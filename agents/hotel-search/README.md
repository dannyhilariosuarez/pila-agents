# Hotel Search Agent

Searches for real-time hotel data using SerpAPI Google Hotels with Tavily as a fallback source. Category: **Travel**. Rounds ratings to 1 decimal place.

## Key Features

- Real-time hotel pricing and availability lookup
- SerpAPI Google Hotels as primary data source
- Tavily fallback when SerpAPI is unavailable
- Rating normalization (rounded to 1 decimal)
- Extends `PilaBaseAgent` from `@pila/protocol`

## Development

```bash
pnpm test   # run tests
pnpm build  # build for production
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SERPAPI_KEY` | SerpAPI key for Google Hotels |
| `TAVILY_API_KEY` | Tavily API key (fallback) |
