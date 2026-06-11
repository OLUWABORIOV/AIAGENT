"""
test_agent.py — Unit tests for the LangGraph agent.

TEACHING NOTE — Unit vs Integration tests:
  Unit tests: test ONE function in isolation. Mock ALL external dependencies.
  Integration tests: test how multiple components work together.

  These are unit tests. We mock:
  - genai.generate() — no real API calls
  - The LLM response — controlled, deterministic

  This means tests are:
  - Fast (< 1ms each — no network)
  - Deterministic (same output every time)
  - Free (no API tokens consumed)

TEACHING NOTE — What to test in agent tests:
  ✅ Tool execution (calculate, summarise_documents)
  ✅ Answer extraction from message history
  ✅ Cost calculation
  ✅ Step limit enforcement
  ✅ Error handling (API errors, token limits)
  ❌ LLM quality (you can't unit-test that — use evals)
"""

import pytest
from unittest.mock import MagicMock, patch

from app.agent import (
    execute_tool,
    _extract_final_answer,
    run_agent,
    build_graph,
    AgentState,
)
from app.schemas import AgentOutput


# ── Tool tests ────────────────────────────────────────────────────────────────

class TestCalculateTool:
    """
    TEACHING NOTE: test each tool in isolation.
    execute_tool() is a pure function — it takes inputs and returns a string.
    No mocking needed.
    """

    def make_state(self) -> AgentState:
        return AgentState(
            messages=[], question="", documents=[],
            step_count=0, input_tokens=0, output_tokens=0,
            cost_usd=0.0, error=None,
        )

    def test_basic_arithmetic(self):
        result = execute_tool("calculate", {"expression": "2 + 2"}, self.make_state())
        assert result == "4"

    def test_multiplication(self):
        result = execute_tool("calculate", {"expression": "6 * 7"}, self.make_state())
        assert result == "42"

    def test_power(self):
        result = execute_tool("calculate", {"expression": "2 ** 10"}, self.make_state())
        assert result == "1024"

    def test_division(self):
        result = execute_tool("calculate", {"expression": "10 / 4"}, self.make_state())
        assert result == "2.5"

    def test_floor_division(self):
        result = execute_tool("calculate", {"expression": "10 // 3"}, self.make_state())
        assert result == "3"

    def test_rejects_dangerous_code(self):
        """Security: should NOT execute arbitrary Python."""
        result = execute_tool("calculate", {"expression": "__import__('os').system('ls')"}, self.make_state())
        assert "Error" in result or "disallowed" in result.lower()

    def test_handles_syntax_error_gracefully(self):
        result = execute_tool("calculate", {"expression": "2 +"}, self.make_state())
        assert "error" in result.lower() or "Tool error" in result


class TestSummariseDocumentsTool:
    def make_state_with_docs(self, docs: list[str]) -> AgentState:
        return AgentState(
            messages=[], question="", documents=docs,
            step_count=0, input_tokens=0, output_tokens=0,
            cost_usd=0.0, error=None,
        )

    def test_summarises_provided_documents(self):
        state = self.make_state_with_docs(["This is document one about Python."])
        result = execute_tool("summarise_documents", {"focus": "programming"}, state)
        assert "Document 1" in result
        assert "programming" in result

    def test_handles_empty_documents(self):
        state = self.make_state_with_docs([])
        result = execute_tool("summarise_documents", {"focus": "anything"}, state)
        assert "No documents" in result

    def test_handles_multiple_documents(self):
        state = self.make_state_with_docs(["Doc A content", "Doc B content"])
        result = execute_tool("summarise_documents", {"focus": "test"}, state)
        assert "Document 1" in result
        assert "Document 2" in result

    def test_unknown_tool_returns_error_string(self):
        from app.agent import AgentState
        state = AgentState(
            messages=[], question="", documents=[],
            step_count=0, input_tokens=0, output_tokens=0,
            cost_usd=0.0, error=None,
        )
        result = execute_tool("nonexistent_tool", {}, state)
        assert "Unknown tool" in result


# ── Answer extraction tests ───────────────────────────────────────────────────

class TestExtractFinalAnswer:
    """
    TEACHING NOTE: _extract_final_answer is a utility function.
    Test it with a variety of message history shapes — string content,
    list-of-blocks content, mixed histories.
    """

    def test_extracts_from_simple_string_content(self):
        messages = [
            {"role": "user", "content": "What is Paris?"},
            {"role": "assistant", "content": "Paris is the capital of France."},
        ]
        assert _extract_final_answer(messages) == "Paris is the capital of France."

    def test_extracts_from_list_of_text_blocks(self):
        messages = [
            {"role": "user", "content": "What is 2+2?"},
            {"role": "assistant", "content": [
                {"type": "text", "text": "The answer is 4."}
            ]},
        ]
        assert _extract_final_answer(messages) == "The answer is 4."

    def test_skips_tool_use_blocks(self):
        messages = [
            {"role": "assistant", "content": [
                {"type": "tool_use", "id": "t1", "name": "calculate", "input": {"expression": "2+2"}},
                {"type": "text", "text": "The result is 4."},
            ]},
        ]
        assert _extract_final_answer(messages) == "The result is 4."

    def test_returns_last_assistant_message(self):
        """Should return the LAST assistant message, not the first."""
        messages = [
            {"role": "assistant", "content": "First answer (tool call)."},
            {"role": "user", "content": [{"type": "tool_result", "content": "4"}]},
            {"role": "assistant", "content": "Final answer after tool: 4."},
        ]
        assert _extract_final_answer(messages) == "Final answer after tool: 4."

    def test_returns_fallback_for_empty_messages(self):
        assert "No answer" in _extract_final_answer([])

    def test_strips_whitespace(self):
        messages = [{"role": "assistant", "content": "  Answer with spaces.  "}]
        assert _extract_final_answer(messages) == "Answer with spaces."


# ── run_agent integration tests ───────────────────────────────────────────────

class TestRunAgent:
    """
    TEACHING NOTE: These tests mock the Gemini client entirely.
    We're testing that run_agent():
    1. Calls the LLM with the right inputs
    2. Returns a properly typed AgentOutput
    3. Calculates cost correctly
    4. Handles errors from the LLM
    """

    def make_mock_response(
        self,
        text: str = "Paris is the capital of France.",
        input_tokens: int = 100,
        output_tokens: int = 15,
    ) -> MagicMock:
        """Build a realistic mock of a Gemini response."""
        mock_response = MagicMock()
        mock_response.output_text = text
        mock_response.usage = MagicMock(
            prompt_tokens=input_tokens,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        return mock_response

    def test_returns_agent_output_type(self):
        with patch("app.agent.genai.generate") as mock_generate:
            mock_generate.return_value = self.make_mock_response()

            result = run_agent("What is the capital of France?")

        assert isinstance(result, AgentOutput)

    def test_answer_is_extracted_correctly(self):
        with patch("app.agent.genai.generate") as mock_generate:
            mock_generate.return_value = self.make_mock_response(
                text="Paris is the capital of France."
            )

            result = run_agent("What is the capital of France?")

        assert result.answer == "Paris is the capital of France."

    def test_token_counts_are_summed(self):
        with patch("app.agent.genai.generate") as mock_generate:
            mock_generate.return_value = self.make_mock_response(
                input_tokens=200, output_tokens=30
            )

            result = run_agent("Test question")

        assert result.input_tokens == 200
        assert result.output_tokens == 30

    def test_cost_is_calculated_correctly(self):
        """
        TEACHING NOTE: test cost calculation explicitly.
        200 input tokens  = 200/1_000_000 * $3.00 = $0.0006
        30 output tokens  = 30/1_000_000  * $15.00 = $0.00045
        Total             = $0.00105
        """
        with patch("app.agent.genai.generate") as mock_generate:
            mock_generate.return_value = self.make_mock_response(
                input_tokens=200, output_tokens=30
            )

            result = run_agent("Test")

        expected_cost = (200 / 1_000_000 * 3.00) + (30 / 1_000_000 * 15.00)
        assert abs(result.cost_usd - expected_cost) < 0.000001

    def test_steps_taken_increments(self):
        with patch("app.agent.genai.generate") as mock_generate:
            mock_generate.return_value = self.make_mock_response()

            result = run_agent("Test question")

        assert result.steps_taken == 1   # one LLM call = one step

    def test_duration_is_positive(self):
        with patch("app.agent.genai.generate") as mock_generate:
            mock_generate.return_value = self.make_mock_response()

            result = run_agent("Test question")

        assert result.duration_secs >= 0.0

    def test_includes_documents_in_context(self):
        with patch("app.agent.genai.generate") as mock_generate:
            mock_generate.return_value = self.make_mock_response()

            run_agent("Summarise this", documents=["Doc 1", "Doc 2"])

            call_args = mock_generate.call_args
            prompt = call_args.kwargs.get("prompt", "")
            assert "Doc 1" in prompt or "Doc 2" in prompt

    def test_handles_api_error_gracefully(self):
        with patch("app.agent.genai.generate") as mock_generate:
            mock_generate.side_effect = RuntimeError("Internal server error")

            result = run_agent("Test question")

        assert result.steps_taken >= 1
