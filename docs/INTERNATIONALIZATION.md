# Phase 12 internationalization and bidirectional content

Phase 12 treats language as three independent values. Conflating them causes incorrect labels,
misdirected generated text, and wrong map layout.

| Concept                  | Source                                      | Allowed values                                  | Responsibility                                |
| ------------------------ | ------------------------------------------- | ----------------------------------------------- | --------------------------------------------- |
| Interface language       | Locale-prefixed route                       | `en`, `ar`                                      | Navigation, controls, metadata, errors, dates |
| Detected video language  | AI analysis of the source video             | `en`, `ar`, `other`, or `null` before detection | Source metadata and title direction           |
| Analysis output language | User choice in the submission form/settings | `en`, `ar`                                      | Summary text and mind-map content/layout      |

An Arabic interface can therefore display an English analysis of an Arabic video without changing
the meaning of any field. The result screen makes all three values visible.

## Interface translations

All interface strings live in `apps/web/src/i18n/messages.ts` and are consumed with
`useTranslations`, `getTranslations`, `useFormatter`, and `useLocale`. Components do not contain
parallel Arabic/English string conditionals. Type augmentation in `src/i18n/types.d.ts` makes
message namespaces and keys compile-time checked.

The route layout validates the locale before rendering and emits:

```html
<html lang="ar" dir="rtl">
  <html lang="en" dir="ltr"></html>
</html>
```

Localized metadata is generated for both routes. The translation parity test recursively checks
that Arabic and English have identical keys, non-empty values, and matching ICU placeholders.

## Persisting detected language

The provider result already contains `detectedLanguage`. Phase 12 persists it in a dedicated
nullable `DetectedLanguage` database column instead of discarding it. The worker maps `ar`, `en`,
and `other` to the database enum only after final provider validation. The API maps it back to the
shared contract. Existing records remain `null` because their original language cannot be
reconstructed safely.

Apply the forward migration before deploying the Phase 12 API and worker:

```bash
pnpm --filter @learnmap/database db:deploy
pnpm --filter @learnmap/database db:generate
```

## Generated and mixed-direction text

Generated text is untrusted content and may mix scripts. `BidiText` uses a `<bdi>` isolate with the
analysis or detected-video direction. Arabic-generated blocks use the Arabic font stack and RTL
alignment while preserving embedded technical terms such as:

```text
التعلّم الآلي (Machine Learning)
NestJS
API
PostgreSQL
```

Unknown video-title direction uses `dir="auto"`. Timestamps use an explicit LTR isolate with
tabular numerals, so values such as `1:02:03` remain stable inside Arabic sentences. Code and
technical samples are explicitly LTR and use a monospace stack.

The application uses an offline-safe Arabic-capable stack: Noto Sans Arabic when installed,
followed by Segoe UI, Tahoma, and Arial. It does not depend on a runtime font request.

## Layout and mirroring rules

Directional spacing and positioning use logical CSS properties such as `padding-inline`,
`margin-inline`, and `inset-inline-end`. ELK map direction follows the analysis output language:

- Arabic output: `LEFT`, with RTL node text.
- English output: `RIGHT`, with LTR node text.

The interface direction never decides the map direction. The following media semantics remain LTR
and are not mirrored:

- the YouTube iframe, branding, and internal playback controls;
- progress-fill direction;
- timestamp numerals; and
- code and technical samples.

Only genuinely directional interface controls, such as the back arrow and collapsed-branch arrow,
select the appropriate icon for their context. Play icons are never transformed.

## Test matrix

At minimum, manually verify these combinations:

| Interface | Video         | Output  | Expected map | Expected generated text            |
| --------- | ------------- | ------- | ------------ | ---------------------------------- |
| English   | English       | English | Right        | LTR                                |
| Arabic    | Arabic        | Arabic  | Left         | RTL                                |
| Arabic    | Arabic        | English | Right        | LTR                                |
| English   | English       | Arabic  | Left         | RTL                                |
| Arabic    | Other/unknown | Arabic  | Left         | RTL with auto-directed video title |

Automated tests cover contract separation, database migration, provider instructions, translation
parity, mixed Arabic/English isolation, unknown direction, and LTR timestamps.

## Adding another interface locale

1. Add the locale to `src/i18n/routing.ts`.
2. Add a complete message tree with the same keys and placeholders.
3. Choose the document direction in the locale layout.
4. Extend the interface-language label mapping.
5. Add translation parity, route, and direction tests.

Adding an interface locale does not automatically make it a supported analysis output language;
that requires a deliberate shared-contract, provider, and evaluation change.
