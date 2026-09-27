# Google credentials

The application requires two independent server-side credentials. Never add them to source
control and never prefix them with `NEXT_PUBLIC_`.

## Gemini API key

1. Sign in to Google AI Studio.
2. Open the API key section.
3. Create or select a Google Cloud project dedicated to this application.
4. Create a Gemini API key.
5. Store it only in `.env` as `GEMINI_API_KEY`.
6. Keep `GEMINI_VIDEO_MODEL` configurable because public YouTube URL support is a preview
   capability and compatible model names can change.

The worker is the only application that receives the Gemini key.

## YouTube Data API key

1. Open Google Cloud Console and select the same project or a dedicated metadata project.
2. Open **APIs & Services → Library**.
3. Enable **YouTube Data API v3**.
4. Open **APIs & Services → Credentials**.
5. Create an API key.
6. Under API restrictions, select **Restrict key** and allow only YouTube Data API v3.
7. Add an application restriction appropriate to the deployed backend. During local development,
   use a separate development key rather than weakening the production key.
8. Store it in `.env` as `YOUTUBE_API_KEY`.

The API uses this key for public video metadata. It does not use YouTube caption download,
which requires authorization to edit the source video.

The metadata client requests only `snippet`, `contentDetails`, and `status` from `videos.list`.
It never logs the complete request URL because the key is carried as a query parameter. See
[YouTube URL and metadata integration](YOUTUBE_INTEGRATION.md).

## Local file

```dotenv
GEMINI_API_KEY=replace_with_your_real_key
GEMINI_VIDEO_MODEL=gemini-3.8-flash
GEMINI_AGENTIC_MIN_DURATION_SECONDS=300
GEMINI_REQUEST_TIMEOUT_MS=720000
YOUTUBE_API_KEY=replace_with_your_real_key
```

`gemini-3.8-flash` is a stable model identifier in Google's current Gemini model catalog. Keep
the value configurable so a model migration does not require a code release.

Run:

```bash
pnpm env:check
```

## Credential best practices

- Use separate development, staging, and production projects or keys.
- Restrict every key to the smallest possible API and environment scope.
- Store production values in a managed secret store.
- Rotate credentials periodically and immediately after suspected exposure.
- Review provider usage and quota dashboards.
- Do not log environment objects, request headers, or full provider errors.
- Revoke a key before removing it from application configuration.

## If a key is accidentally committed

Removing the text from Git is not enough. Revoke or rotate the key immediately, update the
secret store, redeploy affected services, and then clean repository history according to your
organization's incident procedure.
