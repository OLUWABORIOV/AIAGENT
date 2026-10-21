# app/agent.py
import ast
import logging
import threading
import time
from dataclasses import dataclass
from typing import TypedDict, Annotated, Optional
import operator

from google import genai
from google.genai import types
from langgraph.graph import StateGraph, END

from app.config import settings

logger = logging.getLogger(__name__)

# The worker runs jobs in a thread pool. google-genai clients are not safe to
# share across threads: concurrent calls can close the underlying HTTP client
# ("Cannot send a request, as the client has been closed"). One client per
# thread avoids that without creating a new client for every request.
_thread_local = threading.local()


def _get_client() -> genai.Client:
    client = getattr(_thread_local, "client", None)
    if client is None:
        client = genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=settings.gemini_timeout_secs * 1000,
                # We do our own retries so a single call cannot silently hang
                # for minutes inside the SDK's tenacity loop.
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )
        _thread_local.client = client
    return client

_RETRYABLE_MARKERS = ("503", "429", "unavailable", "resource_exhausted", "timeout", "deadline")


def _is_retryable(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in _RETRYABLE_MARKERS)


def _generate(prompt_text: str, max_attempts: int | None = None):
    """Call Gemini, retrying transient rate-limit/overload errors with backoff."""
    max_attempts = max_attempts or settings.gemini_max_attempts
    last_exc = None
    for attempt in range(1, max_attempts + 1):
        try:
            return _get_client().models.generate_content(
                model=settings.gemini_model,
                contents=prompt_text,
                config=types.GenerateContentConfig(max_output_tokens=1024),
            )
        except Exception as exc:
            last_exc = exc
            if attempt == max_attempts or not _is_retryable(exc):
                raise
            delay = 2 ** (attempt - 1)
            logger.warning(
                "gemini_retry attempt=%s/%s delay=%ss error=%s",
                attempt,
                max_attempts,
                delay,
                exc,
            )
            time.sleep(delay)
    raise last_exc  # pragma: no cover

# ── State ─────────────────────────────────────────────────────────────────────
class AgentState(TypedDict, total=False):
    messages:     Annotated[list, operator.add]
    question:     str
    documents:    list[str]
    step_count:   int
    input_tokens: int
    output_tokens: int
    cost_usd:     float
    error:        Optional[str]

# ── Nodes ─────────────────────────────────────────────────────────────────────
MAX_STEPS = 10

def should_continue(state: AgentState) -> str:
    if state["step_count"] >= MAX_STEPS:
        return "end"
    last = state["messages"][-1]
    # If the last message has tool calls, keep going
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "continue"
    return "end"

def _flatten_messages(messages: list[dict]) -> str:
    parts = []
    for message in messages:
        content = message.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                str(block.get("text", "")) if isinstance(block, dict) else str(block)
                for block in content
            )
        parts.append(f"{message.get('role', 'user')}: {content}")
    return "\n".join(parts)

def _extract_response_text(response) -> str:
    return getattr(response, "text", None) or ""


def _extract_token_counts(response) -> tuple[int, int]:
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return 0, 0
    input_tokens = getattr(usage, "prompt_token_count", 0) or 0
    output_tokens = getattr(usage, "candidates_token_count", 0) or 0
    return int(input_tokens), int(output_tokens)


def _render_message_content(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(str(block.get("text", "")))
                elif block.get("type") == "tool_result":
                    parts.append(str(block.get("content", "")))
                else:
                    parts.append(str(block.get("text", "")))
            else:
                parts.append(str(block))
        return " ".join(parts)
    return str(content)


def _extract_final_answer(messages: list[dict]) -> str:
    if not messages:
        return "No answer found"

    for message in reversed(messages):
        if message.get("role") != "assistant":
            continue
        content = message.get("content")
        rendered = _render_message_content(content).strip()
        if rendered:
            return rendered

    return "No answer found"


_ALLOWED_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_ALLOWED_UNARYOPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}


def _safe_arithmetic(node):
    """Evaluate a tiny arithmetic AST. Never use eval() on model output."""
    if isinstance(node, ast.Expression):
        return _safe_arithmetic(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_BINOPS:
        left = _safe_arithmetic(node.left)
        right = _safe_arithmetic(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 1000:
            raise ValueError("exponent too large")
        return _ALLOWED_BINOPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_UNARYOPS:
        return _ALLOWED_UNARYOPS[type(node.op)](_safe_arithmetic(node.operand))
    raise ValueError("disallowed expression")


def execute_tool(name: str, inputs: dict, state: AgentState) -> str:
    if name == "calculate":
        expression = str(inputs.get("expression", ""))
        try:
            return str(_safe_arithmetic(ast.parse(expression, mode="eval")))
        except Exception as exc:
            return f"Tool error: {exc}"

    if name == "summarise_documents":
        docs = state.get("documents", [])
        if not docs:
            return "No documents provided"
        focus = inputs.get("focus", "summary")
        summary_lines = [f"Document {idx + 1}: {doc[:120]}" for idx, doc in enumerate(docs)]
        return f"Summary ({focus}): " + " | ".join(summary_lines)

    return f"Unknown tool: {name}"
def llm_node(state: AgentState) -> dict:
    prompt_text = _flatten_messages(state["messages"])
    # Let provider errors propagate so the worker can mark the job failed
    # instead of storing an "Error: ..." string as a successful answer.
    response = _generate(prompt_text)

    text = _extract_response_text(response)
    input_tokens, output_tokens = _extract_token_counts(response)

    return {
        "messages": [{"role": "assistant", "content": text}],
        "step_count": state["step_count"] + 1,
        "input_tokens": state["input_tokens"] + input_tokens,
        "output_tokens": state["output_tokens"] + output_tokens,
    }


# -- Graph --
def build_graph():
    g = StateGraph(AgentState)
    g.add_node("llm", llm_node)
    g.set_entry_point("llm")
    g.add_conditional_edges("llm", should_continue, {"continue": "llm", "end": END})
    return g.compile()

graph = build_graph()

# ── Run ───────────────────────────────────────────────────────────────────────
@dataclass
class AgentOutput:
    answer: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    duration_secs: float
    steps_taken: int

def run_agent(question: str, documents: list[str] | None = None) -> AgentOutput:
    documents = documents or []
    context = "\n\n".join(documents)
    user_content = f"Context:\n{context}\n\nQuestion: {question}" if context else question

    start = time.perf_counter()
    final_state = graph.invoke({
        "messages":     [{"role": "user", "content": user_content}],
        "question":     question,
        "documents":    documents,
        "step_count":   0,
        "input_tokens": 0,
        "output_tokens": 0,
    })
    duration = time.perf_counter() - start

    cost = (
        final_state["input_tokens"]  / 1_000_000 * settings.gemini_input_price_per_m +
        final_state["output_tokens"] / 1_000_000 * settings.gemini_output_price_per_m
    )

    return AgentOutput(
        answer=_extract_final_answer(final_state["messages"]),
        input_tokens=final_state["input_tokens"],
        output_tokens=final_state["output_tokens"],
        cost_usd=cost,
        duration_secs=duration,
        steps_taken=final_state["step_count"],
    )
