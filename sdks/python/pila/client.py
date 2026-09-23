"""HTTP client for the Pila orchestrator API."""

from __future__ import annotations

from typing import AsyncIterator

import httpx

from .types import Task, TaskResult, AgentInfo, RegistryResponse


class PilaClient:
    """Synchronous client for the Pila orchestrator API."""

    def __init__(self, base_url: str = "http://localhost:3000", api_key: str | None = None):
        self.base_url = base_url.rstrip("/")
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self._client = httpx.Client(base_url=self.base_url, headers=headers, timeout=30.0)

    def submit_task(self, task: str, user_id: str = "sdk-user") -> Task:
        response = self._client.post("/tasks", json={"task": task, "userId": user_id})
        response.raise_for_status()
        return Task.model_validate(response.json())

    def get_task(self, task_id: str) -> TaskResult:
        response = self._client.get(f"/tasks/{task_id}")
        response.raise_for_status()
        data = response.json()
        return TaskResult.model_validate(data.get("task", data))

    def list_agents(self) -> list[AgentInfo]:
        response = self._client.get("/registry")
        response.raise_for_status()
        registry = RegistryResponse.model_validate(response.json())
        return registry.agents

    def health(self) -> dict:
        response = self._client.get("/health")
        response.raise_for_status()
        return response.json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "PilaClient":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


class AsyncPilaClient:
    """Async client for the Pila orchestrator API."""

    def __init__(self, base_url: str = "http://localhost:3000", api_key: str | None = None):
        self.base_url = base_url.rstrip("/")
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self._client = httpx.AsyncClient(base_url=self.base_url, headers=headers, timeout=30.0)

    async def submit_task(self, task: str, user_id: str = "sdk-user") -> Task:
        response = await self._client.post("/tasks", json={"task": task, "userId": user_id})
        response.raise_for_status()
        return Task.model_validate(response.json())

    async def get_task(self, task_id: str) -> TaskResult:
        response = await self._client.get(f"/tasks/{task_id}")
        response.raise_for_status()
        data = response.json()
        return TaskResult.model_validate(data.get("task", data))

    async def stream_task(self, task_id: str) -> AsyncIterator[dict]:
        async with self._client.stream("GET", f"/tasks/{task_id}/stream") as response:
            event_type = ""
            async for line in response.aiter_lines():
                if line.startswith("event:"):
                    event_type = line[6:].strip()
                elif line.startswith("data:"):
                    data = line[5:].strip()
                    yield {"event": event_type, "data": data}

    async def list_agents(self) -> list[AgentInfo]:
        response = await self._client.get("/registry")
        response.raise_for_status()
        registry = RegistryResponse.model_validate(response.json())
        return registry.agents

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AsyncPilaClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()
