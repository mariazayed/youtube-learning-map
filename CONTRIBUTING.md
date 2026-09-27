# Contributing

## Before changing code

1. Use the pinned Node and pnpm versions.
2. Run `pnpm doctor`.
3. Create a focused branch.
4. Never commit `.env` or credentials.

## Quality gate

Before opening a pull request:

```bash
pnpm validate
pnpm format:check
pnpm test:e2e
```

Changes to the AI prompt, schema, model, or node limits must also be evaluated against the
documented Arabic and English video evaluation set. Generate a template with
`pnpm eval:ai template`, retain the passing scored report as release evidence, and increment the
prompt or schema version so old cached output is not mixed with the new contract.

## Database changes

Create a named Prisma migration and commit both the Prisma schema and generated SQL. Review
the SQL before committing. Production uses `prisma migrate deploy`; never depend on `db push`
for released environments.

## Pull requests

Keep each pull request small enough to review. Explain behavior changes, test coverage,
migration impact, environment-variable changes, and any AI quality trade-offs. Do not combine
unrelated dependency upgrades with product changes.
