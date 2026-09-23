# Property Data Agent

Provides property valuations, comparables, and neighborhood stats using Tavily. Category: **RealEstate**. Runs 4 parallel searches for comprehensive results.

## Key Features

- Property valuation estimates
- Comparable property lookups
- Neighborhood statistics
- 4 parallel Tavily searches for speed
- Extends `PilaBaseAgent` from `@pila/protocol`

## Development

```bash
pnpm test   # run tests
pnpm build  # build for production
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TAVILY_API_KEY` | Tavily API key for property data |
