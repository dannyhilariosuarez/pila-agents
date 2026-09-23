"""Base agent class for building Pila agents in Python."""

from __future__ import annotations

import os
import time
from abc import ABC, abstractmethod

import httpx


class PilaBaseAgent(ABC):
    """Abstract base class for Pila agents."""

    name: str = "unnamed-agent"
    version: str = "1.0.0"
    description: str = ""
    capabilities: list[str] = []
    tags: list[str] = []

    @abstractmethod
    async def run(self, task: str, sub_task: str) -> dict:
        """Execute the agent's logic. Must return a dict with success, data, summary, confidence."""
        ...

    async def execute(self, task: str, sub_task: str) -> dict:
        """Execute with timing and error handling."""
        start = time.time()
        try:
            result = await self.run(task, sub_task)
            result["executionTime"] = int((time.time() - start) * 1000)
            return result
        except Exception as e:
            return {
                "success": False,
                "data": {},
                "summary": "",
                "confidence": 0,
                "executionTime": int((time.time() - start) * 1000),
                "error": str(e),
            }

    def get_manifest(self) -> dict:
        """Return the agent manifest for registration."""
        return {
            "id": self.name,
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "capabilities": self.capabilities,
            "tags": self.tags,
            "inputSchema": {"task": "string", "subTask": "string"},
            "outputSchema": {
                "success": "boolean",
                "data": "object",
                "summary": "string",
                "confidence": "number",
            },
        }

    def register(
        self,
        base_url: str = "http://localhost:3000",
        api_key: str | None = None,
    ) -> dict:
        """Register this agent with the Pila orchestrator.

        Requires a developer API key, passed as ``api_key`` or set in the
        ``PILA_API_KEY`` environment variable.
        """
        key = api_key or os.environ.get("PILA_API_KEY")
        if not key:
            raise ValueError(
                "An API key is required: pass api_key or set PILA_API_KEY"
            )

        manifest = self.get_manifest()
        response = httpx.post(
            f"{base_url}/developers/register",
            json={"manifest": manifest, "endpoint": None},
            headers={"X-API-Key": key},
            timeout=10.0,
        )
        response.raise_for_status()
        return response.json()
