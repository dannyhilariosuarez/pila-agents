# Flight Search Agent

Searches for real-time flight data using SerpAPI Google Flights with Tavily as a fallback source. Category: **Travel**.

## Key Features

- Real-time flight price and schedule lookup
- SerpAPI Google Flights as primary data source
- Tavily fallback when SerpAPI is unavailable
- Extends `PilaBaseAgent` from `@pila/protocol`

## Development

```bash
pnpm test   # run tests
pnpm build  # build for production
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SERPAPI_KEY` | SerpAPI key for Google Flights |
| `TAVILY_API_KEY` | Tavily API key (fallback) |
