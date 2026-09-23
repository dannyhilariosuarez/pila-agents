"""Tests for PilaBaseAgent."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from pila.agent import PilaBaseAgent


# ---------------------------------------------------------------------------
# Concrete test agent
# ---------------------------------------------------------------------------


class EchoAgent(PilaBaseAgent):
    name = "echo"
    version = "2.0.0"
    description = "Echoes input back"
    capabilities = ["echo", "test"]
    tags = ["testing"]

    async def run(self, task: str, sub_task: str) -> dict:
        return {
            "success": True,
            "data": {"echo": sub_task},
            "summary": f"Echoed: {sub_task}",
            "confidence": 1.0,
        }


class FailingAgent(PilaBaseAgent):
    name = "failing"

    async def run(self, task: str, sub_task: str) -> dict:
        raise RuntimeError("agent exploded")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPilaBaseAgentAbstract:
    def test_cannot_instantiate_abstract(self):
        """PilaBaseAgent cannot be instantiated directly."""
        with pytest.raises(TypeError):
            PilaBaseAgent()

    def test_subclass_must_implement_run(self):
        """A subclass that doesn't implement run() cannot be instantiated."""

        class Incomplete(PilaBaseAgent):
            pass

        with pytest.raises(TypeError):
            Incomplete()


class TestGetManifest:
    def test_manifest_contains_required_fields(self):
        agent = EchoAgent()
        manifest = agent.get_manifest()

        assert manifest["id"] == "echo"
        assert manifest["name"] == "echo"
        assert manifest["version"] == "2.0.0"
        assert manifest["description"] == "Echoes input back"
        assert manifest["capabilities"] == ["echo", "test"]
        assert manifest["tags"] == ["testing"]

    def test_manifest_has_schemas(self):
        agent = EchoAgent()
        manifest = agent.get_manifest()

        assert "inputSchema" in manifest
        assert manifest["inputSchema"] == {"task": "string", "subTask": "string"}
        assert "outputSchema" in manifest
        assert "success" in manifest["outputSchema"]

    def test_manifest_defaults(self):
        """An agent with no overrides still produces a valid manifest."""

        class MinimalAgent(PilaBaseAgent):
            async def run(self, task: str, sub_task: str) -> dict:
                return {"success": True, "data": {}, "summary": "", "confidence": 0}

        agent = MinimalAgent()
        manifest = agent.get_manifest()
        assert manifest["name"] == "unnamed-agent"
        assert manifest["version"] == "1.0.0"
        assert manifest["capabilities"] == []


class TestExecute:
    @pytest.mark.asyncio
    async def test_execute_success(self):
        agent = EchoAgent()
        result = await agent.execute("parent-task", "say hello")

        assert result["success"] is True
        assert result["data"] == {"echo": "say hello"}
        assert result["summary"] == "Echoed: say hello"
        assert result["confidence"] == 1.0
        assert "executionTime" in result
        assert isinstance(result["executionTime"], int)
        assert result["executionTime"] >= 0

    @pytest.mark.asyncio
    async def test_execute_error_handling(self):
        agent = FailingAgent()
        result = await agent.execute("parent-task", "boom")

        assert result["success"] is False
        assert result["error"] == "agent exploded"
        assert result["confidence"] == 0
        assert "executionTime" in result

    @pytest.mark.asyncio
    async def test_execute_error_contains_empty_defaults(self):
        agent = FailingAgent()
        result = await agent.execute("t", "s")

        assert result["data"] == {}
        assert result["summary"] == ""


class TestRegister:
    def test_register_posts_manifest(self):
        agent = EchoAgent()

        mock_response = httpx.Response(
            status_code=200,
            json={"ok": True},
            request=httpx.Request("POST", "http://localhost:3000/developers/register"),
        )

        with patch("pila.agent.httpx.post", return_value=mock_response) as mock_post:
            result = agent.register(api_key="dev-key")

            mock_post.assert_called_once()
            call_kwargs = mock_post.call_args[1]
            assert call_kwargs["json"]["manifest"]["name"] == "echo"
            assert call_kwargs["timeout"] == 10.0
            assert result == {"ok": True}

    def test_register_custom_base_url(self):
        agent = EchoAgent()

        mock_response = httpx.Response(
            status_code=200,
            json={"ok": True},
            request=httpx.Request("POST", "http://custom:5000/developers/register"),
        )

        with patch("pila.agent.httpx.post", return_value=mock_response) as mock_post:
            agent.register(base_url="http://custom:5000", api_key="dev-key")

            url_arg = mock_post.call_args[0][0]
            assert url_arg == "http://custom:5000/developers/register"

    def test_register_propagates_http_error(self):
        agent = EchoAgent()

        error_response = httpx.Response(
            status_code=500,
            json={"error": "server error"},
            request=httpx.Request("POST", "http://localhost:3000/developers/register"),
        )

        with patch("pila.agent.httpx.post", return_value=error_response):
            with pytest.raises(httpx.HTTPStatusError):
                agent.register(api_key="dev-key")

    def test_register_sends_api_key_header(self):
        agent = EchoAgent()

        mock_response = httpx.Response(
            status_code=200,
            json={"ok": True},
            request=httpx.Request("POST", "http://localhost:3000/developers/register"),
        )

        with patch("pila.agent.httpx.post", return_value=mock_response) as mock_post:
            agent.register(api_key="dev-key")

            call_kwargs = mock_post.call_args[1]
            assert call_kwargs["headers"]["X-API-Key"] == "dev-key"

    def test_register_reads_api_key_from_environment(self, monkeypatch):
        agent = EchoAgent()
        monkeypatch.setenv("PILA_API_KEY", "env-key")

        mock_response = httpx.Response(
            status_code=200,
            json={"ok": True},
            request=httpx.Request("POST", "http://localhost:3000/developers/register"),
        )

        with patch("pila.agent.httpx.post", return_value=mock_response) as mock_post:
            agent.register()

            call_kwargs = mock_post.call_args[1]
            assert call_kwargs["headers"]["X-API-Key"] == "env-key"

    def test_register_without_api_key_raises(self, monkeypatch):
        agent = EchoAgent()
        monkeypatch.delenv("PILA_API_KEY", raising=False)

        with patch("pila.agent.httpx.post") as mock_post:
            with pytest.raises(ValueError, match="PILA_API_KEY"):
                agent.register()

            mock_post.assert_not_called()
