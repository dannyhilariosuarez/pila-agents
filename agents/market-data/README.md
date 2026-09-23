# Market Data Agent

Looks up stock, crypto, and commodity prices using Tavily. Category: **Finance**.

## Key Features

- Stock price lookup
- Cryptocurrency price lookup
- Commodity price lookup
- Extends `PilaBaseAgent` from `@pila/protocol`

## Development

```bash
pnpm test   # run tests
pnpm build  # build for production
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TAVILY_API_KEY` | Tavily API key for market data |
