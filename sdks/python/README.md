# pila-sdk

Python SDK for the Pila agent orchestration platform.

## Installation

```bash
pip install pila-sdk
```

## Quick Start

```python
from pila import PilaClient

client = PilaClient(base_url="http://localhost:3000")

# Submit a task
task = client.submit_task("Plan a 5-day trip to Tokyo under $3000")
print(f"Task ID: {task.task_id}")

# Get task result
result = client.get_task(task.task_id)
print(result.status)

# List agents
agents = client.list_agents()
for agent in agents:
    print(f"{agent.name} ({agent.category})")
```

## Agent Development

```python
from pila.agent import PilaBaseAgent

class MyAgent(PilaBaseAgent):
    name = "my-agent"
    version = "1.0.0"
    description = "My custom agent"
    capabilities = ["analyze", "report"]

    async def run(self, task: str, sub_task: str) -> dict:
        return {
            "success": True,
            "data": {"result": "analysis complete"},
            "summary": "Analysis completed successfully",
            "confidence": 0.9,
        }

# Register the agent
agent = MyAgent()
agent.register(base_url="http://localhost:3000")  # needs PILA_API_KEY
```
