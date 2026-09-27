# Phase 11–12 frontend

The web application is a Next.js App Router client for creating, tracking, and studying video
analyses. It uses the shared contracts package at every API boundary, `next-intl` locale routing,
TanStack Query for server state, React Flow for interaction, and ELK for deterministic layout.

## Routes and localization

| Route                                  | Purpose                                      |
| -------------------------------------- | -------------------------------------------- |
| `/en`, `/ar`                           | Create an analysis and see three recent runs |
| `/en/analyses`, `/ar/analyses`         | Browse the complete user-scoped history      |
| `/en/analyses/:id`, `/ar/analyses/:id` | Follow processing or study the result        |
| `/en/settings`, `/ar/settings`         | Preferences and application-account deletion |

The locale prefix is always present. `src/middleware.ts` rejects unsupported locale prefixes and
`src/app/[locale]/layout.tsx` sets both `lang` and `dir` on the document. Language switching keeps
the current route and changes only its locale. User-facing Arabic is Modern Standard Arabic, while
the analysis output language is an independent setting sent to the API. Phase 12 also displays the
provider-detected video language and isolates mixed-direction generated text. See
[Internationalization and bidirectional content](INTERNATIONALIZATION.md).

## Submission flow

The home form accepts only supported public YouTube URL shapes and `ar` or `en`. It validates the
request with `createAnalysisRequestSchema` from `@learnmap/contracts` before making a network
request. This is immediate user feedback, not a security boundary; the API repeats validation,
extracts the video ID, and performs authoritative metadata checks.

After a successful `202 Accepted` response, the browser navigates directly to the localized detail
route. The default output language is stored in browser storage and parsed through the shared
language schema before use. It contains no token or sensitive analysis data.

## Processing progress

The detail query polls every two seconds until the status is terminal. The labels correspond to
progress values written by the worker, rather than simulated client timers:

| Progress | Learner-facing phase   | Worker action                         |
| -------: | ---------------------- | ------------------------------------- |
|       10 | Validating video       | Claims the job and validates identity |
|       25 | Reading video content  | Revalidates YouTube metadata          |
|       70 | Identifying main ideas | Receives the provider result          |
|       85 | Building mind map      | Completes defensive result validation |
|       95 | Finalizing analysis    | Begins the atomic persistence step    |
|      100 | Complete               | Stores the result and terminal state  |

Polling stops for `COMPLETED` and `FAILED`. Retry is offered only for failed analyses and relies on
the API's ownership and state-transition checks.

## Result interface

The structured summary separates overview, learning objectives, main ideas, key takeaways, and
terminology. Its headings follow the interface locale while generated content follows the selected
output language. Timestamp controls are explicitly approximate and send a seek request to the
player.

The map derives edges exclusively from `parentId`; provider output never supplies coordinates.
ELK uses a layered layout with 50 pixels of node spacing and 100 pixels of layer spacing. English
flows right and Arabic flows left. Root, topic, detail, and example nodes have distinct visual
roles, backed by text labels so color is not the only signal.

Map controls support:

- Pointer selection to open an explanation panel
- Enter or Space on a focused node to open it
- Double-click or the explicit toggle to collapse a branch
- Search with ancestor expansion for hidden matches
- Approximate timestamp seeking
- Fit view, zoom, pan, and standard React Flow controls

## YouTube player

`YoutubePlayer` loads the IFrame Player API once and keeps one player instance for the analysis.
Timestamp requests call `seekTo(seconds, true)` followed by `playVideo()`. The privacy-enhanced
embed host is used. If the API cannot initialize, a learner can open the canonical YouTube URL with
the timestamp in a new tab. Only a validated 11-character video ID is used to build that URL.

## Generated content and deletion

Summary and mind-map values are inserted as ordinary React text children. The result components
contain no raw-HTML rendering sink, so markup supplied by a model is displayed as text rather
than executed. Completed results display a learner notice that generated summaries may be
incomplete and should not replace the original lesson.

Every queued, failed, or completed result has an authenticated delete control. The settings page
offers application-account deletion only after the learner types the exact word `DELETE`.
Successful deletion clears cached queries, local compatibility identity, and the browser OIDC
session before returning to the localized home page. The external identity-provider account is
not changed.

## Browser security headers

The locale middleware generates a unique nonce and Content Security Policy for every rendered
request. The policy blocks plugins and framing, restricts connections to the configured API/OIDC
origins, and allows frames only from YouTube's normal and privacy-enhanced hosts. The layout is
dynamic so each response receives a fresh nonce. Inline styles remain allowed because React Flow
and ELK apply computed positions as style properties; scripts require the request nonce. The
middleware also emits restrictive permissions, referrer, and MIME-sniffing policies.

## Accessibility and responsive behavior

- Document direction follows the locale.
- All interactive controls are native buttons, links, inputs, or selects.
- Map nodes expose labels and keyboard behavior.
- Focus indicators are visible throughout the application.
- Processing state includes text and numeric progress, not animation alone.
- Motion is reduced when the operating-system preference requests it.
- Layouts collapse to a single column on narrow screens.

## Tests

The Phase 11 unit tests cover form-contract validation, every processing threshold, edge creation,
collapse visibility, search behavior, ancestor resolution, timestamp formatting, and safe YouTube
fallback URL generation. Production type checking and the Next.js build verify the route tree and
server/client component boundaries.

## Deployment notes

Set `NEXT_PUBLIC_API_URL` to the browser-reachable API origin before building the web application.
Set `WEB_URL` on the API to the exact deployed web origin. Do not use wildcard CORS with
credentials. Configure the platform to serve every localized App Router path through Next.js; no
separate rewrite for `/en` or `/ar` is necessary.
