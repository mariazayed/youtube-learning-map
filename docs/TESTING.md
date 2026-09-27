# Phase 15 testing and AI quality

Phase 15 provides four independently runnable test layers. Unit and HTTP integration tests are
part of `pnpm validate`; browser tests are a separate deterministic gate; the AI-quality gate is
human-scored and intentionally never runs as part of ordinary automation.

## Commands

```bash
pnpm test                 # unit and contract tests only
pnpm test:integration     # Nest HTTP integration tests with in-memory boundaries
pnpm test:e2e:install     # one-time Chromium installation
pnpm test:e2e             # Playwright browser journey
pnpm validate             # static checks, unit/integration tests, and production builds
pnpm format:check
```

No command above requires a Gemini or YouTube key. Tests inject fake metadata, queue, identity,
player, and provider implementations. Never add a live provider call to a `*.test.ts` or Playwright
spec; provider acceptance tests must be opt-in, separately billed, and excluded from CI.

## Coverage map

| Required behavior                                    | Test location                                          |
| ---------------------------------------------------- | ------------------------------------------------------ |
| YouTube forms, invalid domains, and 11-character IDs | `apps/api/src/youtube/youtube-url.test.ts`             |
| Cache-key dimensions and determinism                 | `apps/api/src/analyses/analyses.service.test.ts`       |
| Strict Zod result schema                             | `packages/contracts/src/video-analysis-result.test.ts` |
| Root, parents, reachability, depth, and cycles       | `packages/contracts/src/video-analysis-result.test.ts` |
| Summary and map timestamp bounds                     | `packages/contracts/src/video-analysis-result.test.ts` |
| Arabic/LTR direction and mixed text                  | `apps/web/src/lib/text-direction.test.ts`              |
| Transient/permanent retry classification             | `apps/worker/src/processing-error.test.ts`             |
| Worker lifecycle, duplicates, and restart recovery   | `apps/worker/src/analysis-job.handler.test.ts`         |
| HTTP create/cache/ownership/retry/quota flows        | `apps/api/src/analyses/analyses.integration.test.ts`   |
| Signed-in bilingual learner journey                  | `apps/web/e2e/learning-flow.spec.ts`                   |
| Log allowlisting, secret redaction, and safe tokens  | `packages/observability/src/index.test.ts`             |
| Authenticated API and worker metrics endpoints       | `apps/{api,worker}/src/**/*metrics*.test.ts`           |
| CSP support for configured Sentry ingestion          | `apps/web/src/lib/content-security-policy.test.ts`     |

API integration tests start a real Nest application with the global prefix, validation pipe,
request-ID middleware, and safe error filter. They use Supertest at the HTTP boundary, an
in-memory ownership/quota repository, deterministic YouTube metadata, and a fake BullMQ adapter.
The production AI provider belongs to the worker, so worker tests inject a mock
`VideoAnalysisProvider` and assert that invalid output is never persisted.

Unit configs explicitly exclude API integration files and Playwright specs. This keeps
`pnpm test` fast and prevents a browser suite from being accidentally interpreted as Vitest.

## Worker failure and recovery model

Worker tests prove:

- success writes only fully validated output and reaches 100 percent;
- schema-invalid provider output is retryable and never partially saved;
- rate limits, network errors, and temporary provider failures remain retryable;
- private, overlong, unsupported, and safety-rejected videos stop retrying;
- an already completed analysis exits before claiming work;
- a duplicate job exits when the repository claim fails; and
- a persisted `PROCESSING` row can be reclaimed after a worker restart without replacing its
  original `startedAt` value.

The final database transition is still the idempotency authority. BullMQ `jobId` deduplication is
an optimization, not a substitute for repository compare-and-set behavior.

## Playwright design

The browser test launches Next.js on port 3100 and intercepts only dedicated test origins:

- a fake OIDC discovery/authorization service verifies PKCE initiation, then installs a
  deterministic same-origin test session (callback exchange logic has focused unit coverage);
- a fake API verifies the bearer token and returns queued, processing, then completed states;
- a fake YouTube IFrame player records `seekTo(42)` and `playVideo()`; and
- the completed Arabic analysis verifies RTL node text and a left-oriented ELK graph before the
  interface itself is switched from English/LTR to Arabic/RTL.

Failure artifacts are retained under `test-results/` and `playwright-report/` and are ignored by
Git. Playwright retries twice with one worker in CI, records traces on the first retry, and retains
failure screenshots and video. The fake identity service validates application behavior, not an
identity provider's cryptography; production JWT verification remains covered by API unit tests.

## AI quality evaluation

The versioned dataset is `packages/evaluation/datasets/v1.json`. Its schema enforces exactly 20
unique canonical public-video references: five short English, five long English, five short
Arabic, and five long Arabic. `short` means at most 1,200 seconds and `long` means above that
threshold but no more than the application's 5,400-second limit.

Before a review run, verify every video's current availability, language, embeddability, and
duration using the normal metadata boundary. YouTube content can be removed or changed. Do not
silently edit a released dataset: create `v2.json`, update the loader, explain replacements, and
retain the old file for comparison.

```bash
pnpm eval:ai dataset
pnpm eval:ai template > evaluation-results.json
# Generate all 20 analyses with the exact locked prompt/schema/model, review them, and edit scores.
pnpm eval:ai score evaluation-results.json
```

Each dimension uses an integer 1–5 score. Five is always best. For `duplicateConcepts`, five means
no unnecessary duplication; for `unsupportedClaims`, five means no unsupported claims. Reviewers
must add source-grounded evidence, not only a number.

| Dimension               | A score of 5 means                                               |
| ----------------------- | ---------------------------------------------------------------- |
| Factual accuracy        | Claims faithfully match the source video                         |
| Coverage                | Important teaching points are represented                        |
| Simplicity              | A student can understand the language without lost meaning       |
| Hierarchy quality       | One connected map has useful, non-arbitrary levels               |
| Duplicate concepts      | Concepts are not needlessly repeated                             |
| Timestamp usefulness    | Available timestamps lead to relevant moments                    |
| Arabic language quality | Arabic is clear MSA with technical terms preserved appropriately |
| Unsupported claims      | No external or invented claims appear                            |

The scorer fails a release when any overall dimension is below 4.0, or any individual video's
factual-accuracy or unsupported-claims score is below 3. Dataset, prompt, and schema versions must
match exactly. Use two reviewers for borderline results and record the adjudication in `notes`.
Evaluation result files can contain reviewer observations and analysis identifiers; treat them as
internal quality records and apply the project's retention policy.

Never replace a production prompt, model, schema, or map-size policy until this gate passes.
Prompt behavior changes require a new `ANALYSIS_PROMPT_VERSION`; incompatible result contracts
require a new `ANALYSIS_SCHEMA_VERSION`. Keep the scored report with the release evidence.

## CI and review practice

CI should run `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm format:check`, install the
pinned Chromium build, and run `pnpm test:e2e`. Use no production secrets in pull-request jobs.
Database/Valkey integration can be added as a separate service-backed suite for transactional
races and multi-replica counters; the checked-in HTTP suite remains deterministic and fast.

Manual accessibility review still includes keyboard-only navigation, 200-percent zoom, visible
focus, 360/768/1024-pixel widths, both map directions, mixed Arabic/English text, and meaning that
does not depend on color alone.
