# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report it through GitHub's private vulnerability reporting, which is enabled on this repository:

[**Report a vulnerability**](https://github.com/dannyhilariosuarez/pila-agents/security/advisories/new)

The report stays private between you and the maintainers until a fix is published. Please include:

1. What the vulnerability is
2. Steps to reproduce it
3. What an attacker could achieve
4. A suggested fix, if you have one

## Response

| Stage | Target |
| --- | --- |
| Acknowledgement | 48 hours |
| Initial assessment | 5 business days |
| Fix for a critical issue | 30 days |

This is a small project and those are targets, not guarantees. If you have had no acknowledgement after a week, it is reasonable to assume the report was missed.

## Scope

In scope — everything in this repository:

- `packages/protocol` — the base class, tap schema, and registration client
- `packages/cli` and `packages/shared`
- `sdks/python`
- `agents/*` — the reference agents

Particularly interesting: anything that causes credentials to leak out of an agent, and anything in `validateTapJson` or `ManifestExecutor` that lets a malicious tap manifest reach somewhere it should not.

Out of scope:

- The hosted registry and orchestrator. They live in a separate repository; report those to the same address and say which component.
- Third-party dependencies — report upstream.
- Denial of service and social engineering.

## Notes for agent authors

Agents hold third-party API keys. Two rules carry most of the weight:

- **Never commit a `.env`.** They are gitignored here, which also means `cp -r` will happily copy one somewhere it does not belong.
- **Never log a key**, including inside an error message. `getApiKey()` throws with the variable's *name*, never its value — keep it that way.

Registration uses a developer API key over HTTPS. Nothing in this repository should ever need a database credential; if you find something that does, that is a bug worth reporting.

## Recognition

Reporters are credited in the release notes unless they would rather stay anonymous.
