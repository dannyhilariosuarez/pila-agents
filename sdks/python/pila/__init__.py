"""Pila SDK — Python client for the Pila agent orchestration platform."""

from .client import PilaClient
from .agent import PilaBaseAgent
from .types import Task, TaskResult, AgentInfo, PilaOutput
from .streaming import (
    StreamingTaskClient,
    StreamEvent,
    TaskStatusEvent,
    AgentStatusEvent,
    AgentResultEvent,
    ErrorEvent,
    DoneEvent,
    EventType,
)

__all__ = [
    "PilaClient",
    "PilaBaseAgent",
    "Task",
    "TaskResult",
    "AgentInfo",
    "PilaOutput",
    "StreamingTaskClient",
    "StreamEvent",
    "TaskStatusEvent",
    "AgentStatusEvent",
    "AgentResultEvent",
    "ErrorEvent",
    "DoneEvent",
    "EventType",
]
__version__ = "0.1.0"
