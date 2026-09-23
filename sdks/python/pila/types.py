"""Pydantic models for Pila API types."""

from __future__ import annotations

from pydantic import BaseModel, Field


class Task(BaseModel):
    task_id: str = Field(alias="taskId")
    web_url: str = Field(alias="webUrl")
    status: str


class AgentResult(BaseModel):
    agent: str
    subtask: str
    output: str
    used_real_executor: bool = Field(alias="usedRealExecutor", default=False)


class TaskResult(BaseModel):
    id: str
    user_id: str
    input: str
    status: str
    result: str | None = None
    created_at: str
    agents: list[AgentResult] = []


class AgentInfo(BaseModel):
    id: str
    name: str
    category: str
    source: str = "built-in"
    has_real_executor: bool = Field(alias="hasRealExecutor", default=False)
    registered_at: str | None = Field(alias="registeredAt", default=None)


class PilaOutput(BaseModel):
    success: bool
    data: dict = {}
    summary: str = ""
    confidence: float = 0.0
    execution_time: int = Field(alias="executionTime", default=0)
    sources: list[str] = []
    error: str | None = None


class RegistryResponse(BaseModel):
    total_agents: int = Field(alias="totalAgents")
    executors_loaded: int = Field(alias="executorsLoaded")
    agents: list[AgentInfo] = []
