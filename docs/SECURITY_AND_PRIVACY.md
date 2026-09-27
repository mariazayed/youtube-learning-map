# Phase 14 security and privacy

Phase 14 turns the existing trust boundaries into production controls and an operating policy.
It is technical guidance, not jurisdiction-specific legal advice. Before serving children or
schools, obtain a privacy and child-safety review for every launch region and identity-provider
configuration.

## Control map

| Risk                             | Implemented control                                                                            | Authoritative location               |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------ |
| Server-side request forgery      | Parse locally, allow exact YouTube hosts, retain only an 11-character ID, construct fixed URLs | `apps/api/src/youtube`               |
| Credential disclosure            | Server-only environment contracts; no public-prefixed keys; redacted logs/errors               | `packages/config`, API and worker    |
| Browser code injection           | Per-request nonce CSP; React escaped text; no raw-HTML result sink                             | web middleware and result components |
| Oversized/malformed requests     | 16 KiB configurable strict JSON parser plus DTO whitelist                                      | `apps/api/src/main.ts`               |
| Cross-origin abuse               | Exact comma-separated `WEB_URL` allowlist with credentials; no wildcard                        | API bootstrap                        |
| Prompt injection                 | Video and metadata declared untrusted; embedded instructions ignored                           | worker analysis prompt               |
| Abuse and cost spikes            | Redis short-window limits, PostgreSQL UTC daily quota, worker concurrency                      | API throttling and `DailyUsage`      |
| Information in errors/logs       | Fixed 5xx/parser messages, stable codes, request IDs, no prompts or raw provider errors        | global filter and interceptors       |
| Untracked high-impact operations | HMAC-pseudonymous audit events                                                                 | `AuditEvent` and `AuditService`      |
| Indefinite storage               | Automatic terminal-analysis and audit retention sweeps                                         | retention module                     |
| User deletion                    | Ownership-scoped analysis deletion and confirmed application-account deletion                  | analyses/accounts modules            |

## URL and outbound-request boundary

The API never performs a request to the submitted URL. It parses it with the platform `URL`
implementation, rejects credentials, ports, unexpected hostnames and malformed paths, and extracts
only a format-checked YouTube ID. Metadata requests go only to the hard-coded Google API origin.
The worker receives the database analysis ID—not a user URL—and reads a server-created canonical
YouTube URL. Redirects are disabled for metadata and provider calls use a fixed Gemini origin.

Do not replace these clients with a general proxy, automatic URL preview, or redirect-following
fetch. New supported YouTube URL shapes require parser tests for hostname lookalikes, encoded path
segments, credentials, ports, fragments, and non-HTTPS protocols.

## Browser and API hardening

The Next.js middleware creates a fresh random nonce and sends the same CSP on the request and
response, allowing Next.js to nonce framework scripts. `frame-ancestors 'none'`, `object-src
'none'`, restricted `connect-src`, and fixed YouTube `frame-src` values reduce injection and
clickjacking exposure. React Flow needs inline styles for computed node coordinates, so
`style-src 'unsafe-inline'` is a documented residual risk; generated text still enters only as
escaped React children. Do not add `dangerouslySetInnerHTML`, `innerHTML`, or unreviewed third-party
scripts to the analysis result path.

The API uses Helmet, an exact credentialed CORS allowlist, a strict JSON parser, DTO rejection of
extra properties, and no-store response headers. The default body limit is 16 KiB. Increasing it
requires an endpoint-specific need and load test; analysis creation and account deletion need only
small payloads. Public errors are capped at 300 characters, stripped of controls, and replaced with
fixed text for 5xx and parser failures.

## AI content boundary

Video, title, and channel metadata are untrusted source material. The prompt tells the provider to
ignore all instructions inside them, avoid outside facts, mark uncertainty, produce one connected
bounded map, and use the requested output language. Provider output follows this pipeline:

```text
JSON parse -> Zod schema -> hierarchy/timestamps -> text normalization -> final validation -> save
```

The worker never logs the complete prompt, raw provider response, API key, or upstream error body.
Only stable provider/error categories are persisted. The UI does not interpret generated Markdown
or HTML. Every completed result repeats the learner notice: generated summaries may be incomplete
and should not replace the original educational material.

## Audit events

The API records `ANALYSIS_CREATED`, `ANALYSIS_RETRIED`, `ANALYSIS_DELETED`, `ACCOUNT_DELETED`,
`RETENTION_PURGE`, and `SECRET_ROTATION_DEPLOYED`. Actor and target values are domain-separated
HMAC-SHA-256 hashes. The secret pepper is mandatory in production and must be stored separately
from PostgreSQL. Rotation-deployment events use a unique hashed deduplication key so multiple API
replicas record the label once.

Audit metadata may contain counts, a non-sensitive category, or deployment mode. It must never
contain source URLs, video titles, user email/name, JWT claims, IP addresses, prompt text, AI output,
keys, headers, stack traces, or raw exception messages. Limit audit-table access to the operational
security role. Application users have no audit endpoint.

Changing `AUDIT_HASH_PEPPER` breaks correlation with older pseudonyms. Treat that as an intentional
privacy boundary during normal rotation and document the cutover time. Retain the previous pepper
only if a documented legal/security need requires historical correlation.

## Retention and deletion policy

Defaults are 90 days for completed or failed analyses and 365 days for audit events. Queued and
processing analyses are not automatically removed, because doing so could race a worker; alert on
stale active rows and resolve them operationally. Each API instance schedules a daily sweep, while
a PostgreSQL transaction advisory lock ensures only one replica performs a given concurrent run.
Deletion and the audit marker commit together.

Users may delete an individual non-processing analysis from its result page. They may delete all
LearnMap application data from settings after typing `DELETE`. The API determines identity only
from authentication, locks the user row, blocks while work is processing, writes a pseudonymous
account-deletion event, and deletes the user. Foreign keys cascade analyses and daily quota rows.
Queued jobs contain only an analysis ID and become harmless no-ops if the row disappears.

Application-account deletion does not delete the managed identity-provider account. Signing in
again may create a new empty LearnMap row. Backups and provider logs can have separate retention;
document their expiry and ensure deletion propagates according to the organization's policy.
Restore procedures must reapply retention before restored data is made available.

## Secret management and rotation runbook

1. Create a replacement key in Google AI Studio or Google Cloud.
2. Restrict the YouTube key to YouTube Data API v3 and the intended workloads; apply the narrowest
   provider controls available to the Gemini key.
3. Store the value as a new managed-secret version. Never commit it, bake it into an image, expose
   it with `NEXT_PUBLIC_`, or paste it into tickets and logs.
4. Update the service's secret reference and bump the corresponding non-secret
   `GEMINI_KEY_VERSION` or `YOUTUBE_KEY_VERSION` label.
5. Roll API and worker services. Confirm `/health`, queue connectivity, and one representative
   English or Arabic analysis without inspecting raw content in logs.
6. Confirm a `SECRET_ROTATION_DEPLOYED` audit event was created for the new label.
7. Revoke the old key after the overlap window. For suspected compromise, revoke immediately,
   accept a short outage, and follow the same verification steps.

Rotate on the organization's schedule and immediately after suspected exposure, staff/access
changes, or provider guidance. The version labels are operational identifiers, not secret values.

## Production checklist

- Terminate TLS at the edge and redirect HTTP to HTTPS.
- Set `NODE_ENV=production`, disable anonymous access, and configure exact OIDC issuer/audience/JWKS.
- Provide production-only managed secrets and unique version labels; never deploy `.env`.
- Apply `20260905180000_add_security_audit` with `prisma migrate deploy` before starting the API.
- Verify web CSP in browser developer tools without weakening directives to silence violations.
- Confirm `WEB_URL` lists only intended HTTPS origins and credentials are never used with `*`.
- Exercise per-user throttles and the persistent daily quota across at least two API replicas.
- Test single-analysis and account deletion, including a processing-analysis conflict.
- Verify retention in staging with shortened intervals and a database backup.
- Enable dependency/container scanning, encrypted backups, access review, and alerts for repeated
  401/403/429 responses, retention failures, failed jobs, and secret-rotation audit failures.
- Publish accurate terms/privacy notices and complete child-safety review before student use.

For CSP deployment mechanics, see the official [Next.js Content Security Policy guide](https://nextjs.org/docs/app/guides/content-security-policy). For the API header middleware, see [Helmet](https://helmetjs.org/). Header policy guidance is also available from the [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/).
