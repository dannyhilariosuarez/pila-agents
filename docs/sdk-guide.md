# Python SDK Guide

The pila Python SDK provides a client for interacting with the pila orchestrator API and a base class for building agents in Python.

**Package**: `pila-sdk`
**Version**: 0.1.0
**Python**: >= 3.10
**Dependencies**: `httpx >= 0.27.0`, `pydantic >= 2.0.0`

---

## Installation

```bash
pip install pila-sdk
```

Or install from the local SDK directory:

```bash
cd sdks/python
pip install -e .
```

For development:

```bash
pip install -e ".[dev]"
```

---

## Quick Start

```python
from pila import PilaClient

client = PilaClient(base_url="http://localhost:3000")

# Submit a task
task = client.submit_task("Find flights from NYC to Tokyo in April under $1500")
print(f"Task ID: {task.task_id}")
print(f"View at: {task.web_url}")

# Check the result
result = client.get_task(task.task_id)
print(f"Status: {result.status}")
print(f"Result: {result.result}")

client.close()
```

---

## Client Usage

### PilaClient (synchronous)

```python
from pila import PilaClient

# Basic usage
client = PilaClient(base_url="http://localhost:3000")

# With API key authentication
client = PilaClient(
    base_url="https://your-registry.example.com",
    api_key="your-api-key"
)
```

The client can be used as a context manager:

```python
with PilaClient(base_url="http://localhost:3000") as client:
    task = client.submit_task("Plan a trip to Paris")
    result = client.get_task(task.task_id)
```

### Submit a task

```python
task = client.submit_task(
    task="Find flights from NYC to Miami next Friday under $300",
    user_id="my-user-id"    # Default: "sdk-user"
)

# task.task_id  — UUID of the created task
# task.web_url  — URL to view results in the web dashboard
# task.status   — "processing"
```

### Get task result

```python
result = client.get_task(task.task_id)

# result.id         — Task UUID
# result.user_id    — User who submitted the task
# result.input      — Original task text
# result.status     — "pending" | "processing" | "complete" | "failed"
# result.result     — JSON string of agent results (when complete)
# result.created_at — ISO timestamp
# result.agents     — List of AgentResult objects
```

Each `AgentResult` contains:

```python
for agent_result in result.agents:
    print(agent_result.agent)             # Agent name
    print(agent_result.subtask)           # Sub-task assigned
    print(agent_result.output)            # Agent's output text
    print(agent_result.used_real_executor) # True if real API, False if Claude fallback
```

### List agents

```python
agents = client.list_agents()

for agent in agents:
    print(f"{agent.name} ({agent.category})")
    print(f"  Source: {agent.source}")
    print(f"  Real executor: {agent.has_real_executor}")
    print(f"  Registered: {agent.registered_at}")
```

### Health check

```python
health = client.health()
print(health)
# {"status": "healthy", "checks": {"database": "ok", "agentRegistry": "ok"}, ...}
```

---

## Async Client

For async applications, use `AsyncPilaClient`:

```python
import asyncio
from pila.client import AsyncPilaClient

async def main():
    async with AsyncPilaClient(base_url="http://localhost:3000") as client:
        # Submit a task
        task = await client.submit_task("Find flights from NYC to London")

        # Stream real-time updates
        async for event in client.stream_task(task.task_id):
            print(f"[{event['event']}] {event['data']}")

        # Get final result
        result = await client.get_task(task.task_id)
        print(result.status)

asyncio.run(main())
```

### Streaming task progress

The async client supports SSE streaming for real-time task progress:

```python
async with AsyncPilaClient(base_url="http://localhost:3000") as client:
    task = await client.submit_task("Plan a trip to Tokyo")

    async for event in client.stream_task(task.task_id):
        event_type = event["event"]
        data = event["data"]

        if event_type == "task:status":
            print(f"Task status: {data}")
        elif event_type == "agent:status":
            print(f"Agent update: {data}")
        elif event_type == "done":
            print("Task complete!")
            break
```

Event types:

| Event          | Description                                       |
| -------------- | ------------------------------------------------- |
| `task:status`  | Task status change (processing, complete, failed) |
| `agent:status` | Agent status change (running, complete, failed)   |
| `ping`         | Keepalive (every 2.5 seconds)                     |
| `done`         | Task reached terminal state                       |

---

## Building Agents with the SDK

### PilaBaseAgent

The SDK provides `PilaBaseAgent` for building agents in Python:

```python
from pila import PilaBaseAgent

class WeatherAgent(PilaBaseAgent):
    name = "weather-agent"
    version = "1.0.0"
    description = "Provides real-time weather forecasts and historical weather data"
    capabilities = [
        "current weather lookup",
        "5-day forecast",
        "historical weather data",
        "severe weather alerts",
    ]
    tags = ["weather", "forecast", "climate"]

    async def run(self, task: str, sub_task: str) -> dict:
        # Call your weather API
        forecast = await self.get_forecast(sub_task)

        return {
            "success": True,
            "data": {"forecast": forecast},
            "summary": f"Weather forecast retrieved for the requested location",
            "confidence": 1.0,
        }

    async def get_forecast(self, query: str) -> dict:
        # Your API integration
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.weather.example.com/forecast",
                params={"q": query}
            )
            return response.json()
```

### Agent execution

The base class wraps `run()` with timing and error handling:

```python
agent = WeatherAgent()

# execute() calls run() with timing and error handling
result = await agent.execute(
    task="Plan a trip to Tokyo",
    sub_task="Get the weather forecast for Tokyo in April"
)

# result["success"]       — True/False
# result["data"]          — Your structured data
# result["summary"]       — Human-readable summary
# result["confidence"]    — 0.0 to 1.0
# result["executionTime"] — Milliseconds
# result["error"]         — Error message (if failed)
```

If `run()` raises an exception, `execute()` catches it and returns:

```python
{
    "success": False,
    "data": {},
    "summary": "",
    "confidence": 0,
    "executionTime": 1234,
    "error": "Connection timeout"
}
```

### Get the manifest

```python
agent = WeatherAgent()
manifest = agent.get_manifest()
# Returns a dict suitable for registration
```

### Register with the orchestrator

```python
agent = WeatherAgent()

# Registration requires a developer API key: pass api_key=... or set
# PILA_API_KEY in the environment.

# Register against a local orchestrator
result = agent.register(base_url="http://localhost:3000")

# Register against production
result = agent.register(base_url="https://your-registry.example.com")
```

This calls `POST /developers/register` with the agent's manifest. The agent is immediately available in the registry, though it will use the inline Claude fallback for execution (marked "AI Generated") unless you also expose a remote HTTP endpoint.

### Remote agent with endpoint

To run your Python agent as a remote HTTP agent:

1. Serve it with FastAPI or similar:

```python
from fastapi import FastAPI
from weather_agent import WeatherAgent

app = FastAPI()
agent = WeatherAgent()

@app.post("/execute")
async def execute(body: dict):
    result = await agent.execute(
        task=body.get("task", ""),
        sub_task=body.get("subTask", "")
    )
    return result
```

2. Register with the endpoint:

```bash
pnpm agent:register \
  --endpoint https://my-weather-agent.fly.dev/execute \
  --manifest ./manifest.json \
  --category Research
```

Now the orchestrator calls your endpoint directly instead of falling through to the inline Claude fallback.

---

## Type Reference

All types are Pydantic models with automatic JSON parsing and validation.

### Task

```python
class Task(BaseModel):
    task_id: str       # Alias: "taskId"
    web_url: str       # Alias: "webUrl"
    status: str
```

### TaskResult

```python
class TaskResult(BaseModel):
    id: str
    user_id: str
    input: str
    status: str
    result: str | None
    created_at: str
    agents: list[AgentResult]
```

### AgentResult

```python
class AgentResult(BaseModel):
    agent: str
    subtask: str
    output: str
    used_real_executor: bool   # Alias: "usedRealExecutor"
```

### AgentInfo

```python
class AgentInfo(BaseModel):
    id: str
    name: str
    category: str
    source: str                # "built-in" | "cli" | "remote" | "registered"
    has_real_executor: bool    # Alias: "hasRealExecutor"
    registered_at: str | None  # Alias: "registeredAt"
```

### PilaOutput

```python
class PilaOutput(BaseModel):
    success: bool
    data: dict
    summary: str
    confidence: float
    execution_time: int        # Alias: "executionTime"
    sources: list[str]
    error: str | None
```

---

## Configuration

### Client options

| Parameter  | Default                 | Description                     |
| ---------- | ----------------------- | ------------------------------- |
| `base_url` | `http://localhost:3000` | Orchestrator URL                |
| `api_key`  | `None`                  | Bearer token for authentication |

### Timeouts

Both clients use a 30-second timeout for HTTP requests. This matches the orchestrator's agent execution timeout.

### Error handling

The SDK raises `httpx.HTTPStatusError` on non-2xx responses:

```python
import httpx

try:
    task = client.submit_task("Find flights")
except httpx.HTTPStatusError as e:
    if e.response.status_code == 429:
        print("Rate limited, try again later")
    elif e.response.status_code == 400:
        print(f"Validation error: {e.response.json()}")
    else:
        print(f"Error: {e.response.status_code}")
```

---

## Development

### Running tests

```bash
cd sdks/python
pip install -e ".[dev]"
pytest
```

### Dependencies

| Package          | Version   | Purpose                           |
| ---------------- | --------- | --------------------------------- |
| `httpx`          | >= 0.27.0 | HTTP client (sync and async)      |
| `pydantic`       | >= 2.0.0  | Data validation and serialization |
| `pytest`         | >= 8.0.0  | Testing (dev)                     |
| `pytest-asyncio` | >= 0.24.0 | Async test support (dev)          |

### Build system

The SDK uses [Hatch](https://hatch.pypa.io/) as the build backend, configured in `pyproject.toml`:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```
