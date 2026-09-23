"""Tests for PilaClient and AsyncPilaClient."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import pytest_asyncio

from pila.client import AsyncPilaClient, PilaClient
from pila.types import AgentInfo, RegistryResponse, Task, TaskResult


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

TASK_RESPONSE = {
    "taskId": "task-123",
    "webUrl": "http://localhost:3000/watch/task-123",
    "status": "pending",
}

TASK_RESULT_RESPONSE = {
    "task": {
        "id": "task-123",
        "user_id": "sdk-user",
        "input": "do something",
        "status": "completed",
        "result": "done",
        "created_at": "2026-01-01T00:00:00Z",
        "agents": [],
    }
}

REGISTRY_RESPONSE = {
    "totalAgents": 1,
    "executorsLoaded": 1,
    "agents": [
        {
            "id": "research",
            "name": "research",
            "category": "analysis",
            "source": "built-in",
            "hasRealExecutor": True,
            "registeredAt": "2026-01-01T00:00:00Z",
        }
    ],
}

HEALTH_RESPONSE = {"status": "ok", "uptime": 12345}


def _mock_response(json_data: dict, status_code: int = 200) -> httpx.Response:
    """Build a fake httpx.Response."""
    return httpx.Response(
        status_code=status_code,
        json=json_data,
        request=httpx.Request("GET", "http://test"),
    )


# ---------------------------------------------------------------------------
# Sync client tests
# ---------------------------------------------------------------------------


class TestPilaClientInit:
    def test_default_base_url(self):
        with patch("pila.client.httpx.Client"):
            client = PilaClient()
            assert client.base_url == "http://localhost:3000"

    def test_custom_base_url_strips_trailing_slash(self):
        with patch("pila.client.httpx.Client"):
            client = PilaClient(base_url="http://example.com/")
            assert client.base_url == "http://example.com"

    def test_api_key_sets_auth_header(self):
        with patch("pila.client.httpx.Client") as mock_cls:
            PilaClient(api_key="sk-test-key")
            _, kwargs = mock_cls.call_args
            assert kwargs["headers"]["Authorization"] == "Bearer sk-test-key"

    def test_no_api_key_no_auth_header(self):
        with patch("pila.client.httpx.Client") as mock_cls:
            PilaClient()
            _, kwargs = mock_cls.call_args
            assert "Authorization" not in kwargs["headers"]


class TestPilaClientSubmitTask:
    def test_submit_task_returns_task(self):
        with patch("pila.client.httpx.Client") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http
            mock_http.post.return_value = _mock_response(TASK_RESPONSE)

            client = PilaClient()
            task = client.submit_task("summarize this")

            mock_http.post.assert_called_once_with(
                "/tasks", json={"task": "summarize this", "userId": "sdk-user"}
            )
            assert isinstance(task, Task)
            assert task.task_id == "task-123"
            assert task.status == "pending"

    def test_submit_task_custom_user_id(self):
        with patch("pila.client.httpx.Client") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http
            mock_http.post.return_value = _mock_response(TASK_RESPONSE)

            client = PilaClient()
            client.submit_task("hello", user_id="user-42")

            mock_http.post.assert_called_once_with(
                "/tasks", json={"task": "hello", "userId": "user-42"}
            )


class TestPilaClientGetTask:
    def test_get_task_returns_task_result(self):
        with patch("pila.client.httpx.Client") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http
            mock_http.get.return_value = _mock_response(TASK_RESULT_RESPONSE)

            client = PilaClient()
            result = client.get_task("task-123")

            mock_http.get.assert_called_once_with("/tasks/task-123")
            assert isinstance(result, TaskResult)
            assert result.id == "task-123"
            assert result.status == "completed"

    def test_get_task_unwraps_task_key(self):
        """When the API wraps the result in a 'task' key, the client unwraps it."""
        with patch("pila.client.httpx.Client") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http
            mock_http.get.return_value = _mock_response(TASK_RESULT_RESPONSE)

            client = PilaClient()
            result = client.get_task("task-123")
            assert result.input == "do something"


class TestPilaClientListAgents:
    def test_list_agents(self):
        with patch("pila.client.httpx.Client") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http
            mock_http.get.return_value = _mock_response(REGISTRY_RESPONSE)

            client = PilaClient()
            agents = client.list_agents()

            mock_http.get.assert_called_once_with("/registry")
            assert len(agents) == 1
            assert isinstance(agents[0], AgentInfo)
            assert agents[0].name == "research"


class TestPilaClientHealth:
    def test_health(self):
        with patch("pila.client.httpx.Client") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http
            mock_http.get.return_value = _mock_response(HEALTH_RESPONSE)

            client = PilaClient()
            health = client.health()

            mock_http.get.assert_called_once_with("/health")
            assert health == {"status": "ok", "uptime": 12345}


class TestPilaClientContextManager:
    def test_context_manager_closes_client(self):
        with patch("pila.client.httpx.Client") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http

            with PilaClient() as client:
                pass

            mock_http.close.assert_called_once()


class TestPilaClientErrorHandling:
    def test_http_error_propagates(self):
        with patch("pila.client.httpx.Client") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http
            error_resp = _mock_response({"error": "not found"}, status_code=404)
            mock_http.get.return_value = error_resp

            client = PilaClient()
            with pytest.raises(httpx.HTTPStatusError):
                client.get_task("nonexistent")


# ---------------------------------------------------------------------------
# Async client tests
# ---------------------------------------------------------------------------


class TestAsyncPilaClientInit:
    def test_default_base_url(self):
        with patch("pila.client.httpx.AsyncClient"):
            client = AsyncPilaClient()
            assert client.base_url == "http://localhost:3000"

    def test_api_key_sets_auth_header(self):
        with patch("pila.client.httpx.AsyncClient") as mock_cls:
            AsyncPilaClient(api_key="sk-async")
            _, kwargs = mock_cls.call_args
            assert kwargs["headers"]["Authorization"] == "Bearer sk-async"


@pytest.mark.asyncio
class TestAsyncPilaClientSubmitTask:
    async def test_submit_task(self):
        with patch("pila.client.httpx.AsyncClient") as mock_cls:
            mock_http = AsyncMock()
            mock_cls.return_value = mock_http
            mock_http.post.return_value = _mock_response(TASK_RESPONSE)

            client = AsyncPilaClient()
            task = await client.submit_task("async task")

            mock_http.post.assert_awaited_once_with(
                "/tasks", json={"task": "async task", "userId": "sdk-user"}
            )
            assert task.task_id == "task-123"


@pytest.mark.asyncio
class TestAsyncPilaClientGetTask:
    async def test_get_task(self):
        with patch("pila.client.httpx.AsyncClient") as mock_cls:
            mock_http = AsyncMock()
            mock_cls.return_value = mock_http
            mock_http.get.return_value = _mock_response(TASK_RESULT_RESPONSE)

            client = AsyncPilaClient()
            result = await client.get_task("task-123")
            assert result.status == "completed"


@pytest.mark.asyncio
class TestAsyncPilaClientStream:
    async def test_stream_task_yields_events(self):
        with patch("pila.client.httpx.AsyncClient") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http

            # Build a fake streaming response context manager
            lines = [
                "event:status",
                "data:running",
                "",
                "event:result",
                "data:done",
            ]

            mock_stream_resp = MagicMock()
            mock_stream_resp.aiter_lines = lambda: _async_iter(lines)

            mock_ctx = MagicMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_stream_resp)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_http.stream.return_value = mock_ctx

            client = AsyncPilaClient()
            events = []
            async for event in client.stream_task("task-123"):
                events.append(event)

            assert len(events) == 2
            assert events[0] == {"event": "status", "data": "running"}
            assert events[1] == {"event": "result", "data": "done"}


@pytest.mark.asyncio
class TestAsyncPilaClientContextManager:
    async def test_async_context_manager(self):
        with patch("pila.client.httpx.AsyncClient") as mock_cls:
            mock_http = AsyncMock()
            mock_cls.return_value = mock_http

            async with AsyncPilaClient() as client:
                pass

            mock_http.aclose.assert_awaited_once()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _async_iter(items):
    for item in items:
        yield item
