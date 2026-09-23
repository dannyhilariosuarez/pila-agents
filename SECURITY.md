# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in Pila, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@pila.ai** with:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. The potential impact
4. Any suggested fixes (optional)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 5 business days
- **Resolution target**: Within 30 days for critical issues

## Scope

This policy applies to:

- The Pila orchestrator API (`apps/orchestrator`)
- The Pila web application (`apps/web`)
- Agent protocol and shared packages (`packages/*`)
- Official agent implementations (`agents/*`)

## Out of Scope

- Third-party dependencies (report these to the respective maintainers)
- Social engineering attacks
- Denial of service attacks

## Security Headers

The orchestrator applies the following security headers to all responses:

| Header                      | Value                                                                                                                                                                                                              | Purpose                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                                          | Prevents MIME-type sniffing                 |
| `X-Frame-Options`           | `DENY`                                                                                                                                                                                                             | Prevents clickjacking via iframes           |
| `X-XSS-Protection`          | `1; mode=block`                                                                                                                                                                                                    | Legacy XSS filter for older browsers        |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                                                  | Limits referrer leakage                     |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`                                                                                                                                                                         | Disables unnecessary browser APIs           |
| `Content-Security-Policy`   | `default-src 'self'; connect-src 'self' <WEB_URL>; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | Mitigates XSS, code injection, clickjacking |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`                                                                                                                                                                              | Enforces HTTPS for 1 year                   |

### Webhook Verification

When `WEBHOOK_SECRET` is configured, the billing webhook endpoint (`POST /billing/webhook`) verifies incoming payloads using HMAC-SHA256 with constant-time comparison (`timingSafeEqual`). This prevents request forgery and replay attacks.

CORS is restricted to the configured `WEB_URL` origin.

## Rate Limiting

All API endpoints are rate-limited using a token-bucket algorithm:

- **Default**: 60 requests per minute per IP
- **Configurable** via `RATE_LIMIT_MAX_TOKENS` and `RATE_LIMIT_REFILL_RATE` env vars
- Returns `429 Too Many Requests` with `Retry-After` header when exceeded

## Recognition

We appreciate responsible disclosure and will credit reporters in our changelog (unless anonymity is preferred).
