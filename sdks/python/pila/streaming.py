"""SSE stream client for consuming Pila task progress events."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Union

import httpx


class EventType(str, Enum):
    """Server-sent event types emitted by the Pila orchestrator."""

    TASK_STATUS = "task_status"
    AGENT_STATUS = "agent_status"
    AGENT_RESULT = "agent_result"
    ERROR = "error"
    DONE = "done"


@dataclass
class TaskStatusEvent:
    """Emitted when the overall task status changes."""

    task_id: str
    status: str
    message: str = ""
    progress: float = 0.0  # 0.0 – 1.0


@dataclass
class AgentStatusEvent:
    """Emitted when an individual agent's status changes."""

    task_id: str
    agent_id: str
    agent_name: str
    status: str
    subtask: str = ""
    message: str = ""


@dataclass
class AgentResultEvent:
    """Emitted when an agent completes its work and returns a result."""

    task_id: str
    agent_id: str
    agent_name: str
    success: bool
    summary: str = ""
    confidence: float = 0.0
    execution_time_ms: int = 0
    data: dict = field(default_factory=dict)


@dataclass
class ErrorEvent:
    """Emitted when an error occurs during task execution."""

    task_id: str
    error: str
    agent_id: str | None = None


@dataclass
class DoneEvent:
    """Emitted when the task is fully complete."""

    task_id: str
    status: str
    summary: str = ""
    total_agents: int = 0
    execution_time_ms: int = 0


StreamEvent = Union[TaskStatusEvent, AgentStatusEvent, AgentResultEvent, ErrorEvent, DoneEvent]


def _parse_event(event_type: str, raw_data: str) -> StreamEvent | None:
    """Parse a raw SSE data payload into a typed event object."""
    try:
        data = json.loads(raw_data)
    except (json.JSONDecodeError, TypeError):
        return None

    task_id = data.get("taskId", data.get("task_id", ""))

    if event_type == EventType.TASK_STATUS:
        return TaskStatusEvent(
            task_id=task_id,
            status=data.get("status", ""),
            message=data.get("message", ""),
            progress=float(data.get("progress", 0.0)),
        )

    if event_type == EventType.AGENT_STATUS:
        return AgentStatusEvent(
            task_id=task_id,
            agent_id=data.get("agentId", data.get("agent_id", "")),
            agent_name=data.get("agentName", data.get("agent_name", "")),
            status=data.get("status", ""),
            subtask=data.get("subtask", ""),
            message=data.get("message", ""),
        )

    if event_type == EventType.AGENT_RESULT:
        return AgentResultEvent(
            task_id=task_id,
            agent_id=data.get("agentId", data.get("agent_id", "")),
            agent_name=data.get("agentName", data.get("agent_name", "")),
            success=data.get("success", False),
            summary=data.get("summary", ""),
            confidence=float(data.get("confidence", 0.0)),
            execution_time_ms=int(data.get("executionTime", data.get("execution_time_ms", 0))),
            data=data.get("data", {}),
        )

    if event_type == EventType.ERROR:
        return ErrorEvent(
            task_id=task_id,
            error=data.get("error", ""),
            agent_id=data.get("agentId", data.get("agent_id")),
        )

    if event_type == EventType.DONE:
        return DoneEvent(
            task_id=task_id,
            status=data.get("status", "completed"),
            summary=data.get("summary", ""),
            total_agents=int(data.get("totalAgents", data.get("total_agents", 0))),
            execution_time_ms=int(data.get("executionTime", data.get("execution_time_ms", 0))),
        )

    return None


class StreamingTaskClient:
    """SSE stream client for consuming real-time task progress from the Pila orchestrator.

    Usage::

        client = StreamingTaskClient("http://localhost:3000")
        async for event in client.stream("task-abc-123"):
            if isinstance(event, DoneEvent):
                print(f"Task complete: {event.summary}")
                break
            elif isinstance(event, AgentResultEvent):
                print(f"{event.agent_name} finished: {event.summary}")
            elif isinstance(event, ErrorEvent):
                print(f"Error: {event.error}")
    """

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key: str | None = None,
        timeout: float = 300.0,
    ):
        self.base_url = base_url.rstrip("/")
        self._headers: dict[str, str] = {"Accept": "text/event-stream"}
        if api_key:
            self._headers["Authorization"] = f"Bearer {api_key}"
        self._timeout = timeout

    async def stream(self, task_id: str) -> AsyncIterator[StreamEvent]:
        """Open an SSE connection to ``/tasks/{task_id}/stream`` and yield typed events.

        The iterator terminates when a ``DoneEvent`` or ``ErrorEvent`` is received,
        or the server closes the connection.
        """
        url = f"{self.base_url}/tasks/{task_id}/stream"

        async with httpx.AsyncClient(timeout=httpx.Timeout(self._timeout)) as client:
            async with client.stream("GET", url, headers=self._headers) as response:
                response.raise_for_status()

                event_type = ""
                data_lines: list[str] = []

                async for line in response.aiter_lines():
                    # SSE protocol: lines prefixed with "event:", "data:", or blank
                    if line.startswith("event:"):
                        event_type = line[6:].strip()
                    elif line.startswith("data:"):
                        data_lines.append(line[5:].strip())
                    elif line == "":
                        # Blank line signals end of an event
                        if event_type and data_lines:
                            raw_data = "\n".join(data_lines)
                            event = _parse_event(event_type, raw_data)
                            if event is not None:
                                yield event
                                if isinstance(event, (DoneEvent, ErrorEvent)):
                                    return
                        event_type = ""
                        data_lines = []

                # Flush any remaining buffered event
                if event_type and data_lines:
                    raw_data = "\n".join(data_lines)
                    event = _parse_event(event_type, raw_data)
                    if event is not None:
                        yield event

    async def stream_and_collect(self, task_id: str) -> list[StreamEvent]:
        """Stream all events and return them as a list once complete."""
        events: list[StreamEvent] = []
        async for event in self.stream(task_id):
            events.append(event)
        return events
