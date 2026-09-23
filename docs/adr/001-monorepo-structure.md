# ADR 001: Monorepo with pnpm Workspaces + Turborepo

## Status
Accepted

## Context
pila has multiple apps (orchestrator, Slack bot, web dashboard), shared packages (protocol, registry, shared types), and agent implementations. We needed a structure that allows code sharing, atomic changes, and fast builds.

## Decision
Use a pnpm workspace monorepo with Turborepo for build orchestration.

## Consequences
- **Positive**: Shared types and protocol changes are atomic. Turborepo caches builds for fast iteration. pnpm workspace protocol (`workspace:*`) ensures consistent versions.
- **Negative**: Increased initial setup complexity. Some tools (e.g., Docker) require careful configuration to handle workspace dependencies.
- **Tradeoffs**: We accept the monorepo complexity because the alternative (separate repos with published packages) would slow down iteration significantly during early development.
