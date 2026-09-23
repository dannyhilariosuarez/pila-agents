"""Tests for SSE streaming module — line parsing, event classification, and collection."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pila.streaming import (
    AgentResultEvent,
    AgentStatusEvent,
    DoneEvent,
    ErrorEvent,
    EventType,
    StreamingTaskClient,
    TaskStatusEvent,
    _parse_event,
)


# ---------------------------------------------------------------------------
# SSE line parsing via _parse_event
# ---------------------------------------------------------------------------


class TestParseEvent:
    """Test that raw SSE JSON payloads are parsed into the correct dataclass."""

    def test_parse_task_status_event(self):
        raw = json.dumps({
            "taskId": "t-1",
            "status": "running",
            "message": "Working on it",
            "progress": 0.5,
        })
        event = _parse_event(EventType.TASK_STATUS, raw)
        assert isinstance(event, TaskStatusEvent)
        assert event.task_id == "t-1"
        assert event.status == "running"
        assert event.message == "Working on it"
        assert event.progress == 0.5

    def test_parse_agent_status_event(self):
        raw = json.dumps({
            "taskId": "t-2",
            "agentId": "a-1",
            "agentName": "SearchBot",
            "status": "executing",
            "subtask": "search the web",
            "message": "searching",
        })
        event = _parse_event(EventType.AGENT_STATUS, raw)
        assert isinstance(event, AgentStatusEvent)
        assert event.task_id == "t-2"
        assert event.agent_id == "a-1"
        assert event.agent_name == "SearchBot"
        assert event.subtask == "search the web"

    def test_parse_agent_result_event(self):
        raw = json.dumps({
            "taskId": "t-3",
            "agentId": "a-2",
            "agentName": "DataBot",
            "success": True,
            "summary": "Found 5 results",
            "confidence": 0.92,
            "executionTime": 1234,
            "data": {"results": [1, 2, 3]},
        })
        event = _parse_event(EventType.AGENT_RESULT, raw)
        assert isinstance(event, AgentResultEvent)
        assert event.success is True
        assert event.confidence == 0.92
        assert event.execution_time_ms == 1234
        assert event.data == {"results": [1, 2, 3]}

    def test_parse_error_event(self):
        raw = json.dumps({
            "taskId": "t-4",
            "error": "Agent timed out",
            "agentId": "a-3",
        })
        event = _parse_event(EventType.ERROR, raw)
        assert isinstance(event, ErrorEvent)
        assert event.error == "Agent timed out"
        assert event.agent_id == "a-3"

    def test_parse_done_event(self):
        raw = json.dumps({
            "taskId": "t-5",
            "status": "completed",
            "summary": "All done",
            "totalAgents": 3,
            "executionTime": 5000,
        })
        event = _parse_event(EventType.DONE, raw)
        assert isinstance(event, DoneEvent)
        assert event.status == "completed"
        assert event.total_agents == 3
        assert event.execution_time_ms == 5000

    def test_parse_returns_none_for_invalid_json(self):
        event = _parse_event(EventType.TASK_STATUS, "not json at all")
        assert event is None

    def test_parse_returns_none_for_unknown_event_type(self):
        raw = json.dumps({"taskId": "t-6"})
        event = _parse_event("unknown_type", raw)
        assert event is None

    def test_parse_handles_snake_case_keys(self):
        """The parser should accept both camelCase and snake_case field names."""
        raw = json.dumps({
            "task_id": "t-7",
            "agent_id": "a-4",
            "agent_name": "Mixer",
            "status": "done",
        })
        event = _parse_event(EventType.AGENT_STATUS, raw)
        assert isinstance(event, AgentStatusEvent)
        assert event.task_id == "t-7"
        assert event.agent_id == "a-4"
        assert event.agent_name == "Mixer"


# ---------------------------------------------------------------------------
# Event type classification
# ---------------------------------------------------------------------------


class TestEventTypeClassification:
    """Verify EventType enum values match expected SSE event names."""

    def test_task_status_value(self):
        assert EventType.TASK_STATUS == "task_status"

    def test_agent_status_value(self):
        assert EventType.AGENT_STATUS == "agent_status"

    def test_agent_result_value(self):
        assert EventType.AGENT_RESULT == "agent_result"

    def test_error_value(self):
        assert EventType.ERROR == "error"

    def test_done_value(self):
        assert EventType.DONE == "done"

    def test_all_types_are_strings(self):
        for member in EventType:
            assert isinstance(member.value, str)


# ---------------------------------------------------------------------------
# stream_and_collect aggregation
# ---------------------------------------------------------------------------


async def _async_iter(items):
    for item in items:
        yield item


@pytest.mark.asyncio
class TestStreamAndCollect:
    """Test that stream_and_collect properly aggregates events from an SSE stream."""

    async def test_collects_all_events_until_done(self):
        lines = [
            "event:task_status",
            'data:{"taskId":"t-10","status":"running","progress":0.0}',
            "",
            "event:agent_result",
            'data:{"taskId":"t-10","agentId":"a-1","agentName":"Bot","success":true,"summary":"ok"}',
            "",
            "event:done",
            'data:{"taskId":"t-10","status":"completed","summary":"finished","totalAgents":1}',
            "",
        ]

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.aiter_lines = lambda: _async_iter(lines)

        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_response)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_stream_ctx = MagicMock()
        mock_stream_ctx.__aenter__ = AsyncMock(return_value=MagicMock(stream=MagicMock(return_value=mock_ctx)))
        mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("pila.streaming.httpx.AsyncClient") as mock_client_cls:
            mock_client_instance = MagicMock()
            mock_client_cls.return_value = mock_client_instance
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            mock_client_instance.stream = MagicMock(return_value=mock_ctx)

            client = StreamingTaskClient("http://localhost:3000")
            events = await client.stream_and_collect("t-10")

        assert len(events) == 3
        assert isinstance(events[0], TaskStatusEvent)
        assert isinstance(events[1], AgentResultEvent)
        assert isinstance(events[2], DoneEvent)

    async def test_stops_on_error_event(self):
        lines = [
            "event:task_status",
            'data:{"taskId":"t-11","status":"running"}',
            "",
            "event:error",
            'data:{"taskId":"t-11","error":"something broke"}',
            "",
            "event:task_status",
            'data:{"taskId":"t-11","status":"should not appear"}',
            "",
        ]

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.aiter_lines = lambda: _async_iter(lines)

        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_response)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("pila.streaming.httpx.AsyncClient") as mock_client_cls:
            mock_client_instance = MagicMock()
            mock_client_cls.return_value = mock_client_instance
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            mock_client_instance.stream = MagicMock(return_value=mock_ctx)

            client = StreamingTaskClient("http://localhost:3000")
            events = await client.stream_and_collect("t-11")

        # Should stop after error — 2 events, not 3
        assert len(events) == 2
        assert isinstance(events[0], TaskStatusEvent)
        assert isinstance(events[1], ErrorEvent)
        assert events[1].error == "something broke"

    async def test_handles_empty_stream(self):
        """An empty stream (no lines) should return an empty list."""
        lines: list[str] = []

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.aiter_lines = lambda: _async_iter(lines)

        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_response)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("pila.streaming.httpx.AsyncClient") as mock_client_cls:
            mock_client_instance = MagicMock()
            mock_client_cls.return_value = mock_client_instance
            mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
            mock_client_instance.__aexit__ = AsyncMock(return_value=False)
            mock_client_instance.stream = MagicMock(return_value=mock_ctx)

            client = StreamingTaskClient("http://localhost:3000")
            events = await client.stream_and_collect("t-empty")

        assert events == []


# ---------------------------------------------------------------------------
# StreamingTaskClient init
# ---------------------------------------------------------------------------


class TestStreamingTaskClientInit:
    def test_default_base_url(self):
        client = StreamingTaskClient()
        assert client.base_url == "http://localhost:3000"

    def test_strips_trailing_slash(self):
        client = StreamingTaskClient("http://example.com/")
        assert client.base_url == "http://example.com"

    def test_api_key_sets_auth_header(self):
        client = StreamingTaskClient(api_key="sk-test")
        assert client._headers["Authorization"] == "Bearer sk-test"

    def test_no_api_key_no_auth_header(self):
        client = StreamingTaskClient()
        assert "Authorization" not in client._headers
