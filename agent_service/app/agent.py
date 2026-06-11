# app/agent.py
import time
from dataclasses import dataclass
from typing import TypedDict, Annotated, Optional
import operator

import google.generativeai as genai
from langgraph.graph import StateGraph, END

from app.config import settings

genai.configure(api_key=settings.gemini_api_key)

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
    if output_text := getattr(response, "output_text", None):
        return output_text
    output = getattr(response, "output", None)
    if isinstance(output, str):
        return output
    if isinstance(output, list) and output:
        first = output[0]
        if isinstance(first, str):
            return first
        if hasattr(first, "content"):
            content = first.content
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return " ".join(
                    getattr(block, "text", "") for block in content if hasattr(block, "text")
                )
    return ""


def _extract_token_counts(response) -> tuple[int, int]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return 0, 0

    input_tokens = getattr(usage, "prompt_tokens", None) or getattr(usage, "input_tokens", 0) or 0
    output_tokens = getattr(usage, "output_tokens", 0) or 0
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


def execute_tool(name: str, inputs: dict, state: AgentState) -> str:
    if name == "calculate":
        expression = str(inputs.get("expression", ""))
        try:
            allowed = {"__builtins__": {}}
            result = eval(expression, allowed, {})
            return str(result)
        except Exception as exc:
            return f"Error: {exc}"

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
    try:
        response = genai.generate(
            model=settings.gemini_model,
            prompt=prompt_text,
            max_output_tokens=1024,
        )
    except Exception as exc:
        return {
            "messages": [{"role": "assistant", "content": f"Error: {exc}"}],
            "step_count": state["step_count"] + 1,
            "input_tokens": state["input_tokens"],
            "output_tokens": state["output_tokens"],
        }

    text = _extract_response_text(response)
    input_tokens, output_tokens = _extract_token_counts(response)

    return {
        "messages": [{"role": "assistant", "content": text}],
        "step_count": state["step_count"] + 1,
        "input_tokens": state["input_tokens"] + input_tokens,
        "output_tokens": state["output_tokens"] + output_tokens,
    }

# ── Graph ─────────────────────────────────────────────────────────────────────
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

def run_agent(question: str, documents: list[str] = []) -> AgentOutput:
    context = "\n\n".join(documents)
    user_content = f"Context:\n{context}\n\nQuestion: {question}" if context else question

    start = time.perf_counter()
    final_state = graph.invoke({
        "messages":     [{"role": "user", "content": user_content}],
        "question":     question,
        "documents":    documents,
        "step_count":   0,
        "input_tokens": 0,
        "output_tokens":0,
    })
    duration = time.perf_counter() - start

    # Estimated Gemini cost: replace with actual model pricing if required.
    cost = (
        final_state["input_tokens"]  / 1_000_000 * 0.0 +
        final_state["output_tokens"] / 1_000_000 * 0.0
    )

    return AgentOutput(
        answer=_extract_final_answer(final_state["messages"]),
        input_tokens=final_state["input_tokens"],
        output_tokens=final_state["output_tokens"],
        cost_usd=cost,
        duration_secs=duration,
        steps_taken=final_state["step_count"],
    )