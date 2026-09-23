# ADR 005: Centralized Environment Validation at Startup

## Status
Accepted

## Context
Environment variables were accessed via `process.env` throughout the codebase with ad-hoc validation (e.g., `if (!url) throw new Error(...)`). This led to inconsistent defaults, runtime crashes from missing vars, and no single source of truth for required configuration.

## Decision
Create a centralized Zod schema (`apps/orchestrator/src/lib/env.ts`) that validates all environment variables at import time. Export a typed `env` object used throughout the application instead of `process.env`.

## Consequences
- **Positive**: Fail-fast on startup if required vars are missing. Type-safe access to all config. Single place to see all env vars with defaults. New devs can see exactly what's required.
- **Negative**: Adding a new env var requires updating the schema (intentional friction). Tests that import modules depending on `env` must have valid env vars set.
- **Tradeoffs**: The intentional friction of updating the schema prevents accidental use of unvalidated environment variables.
