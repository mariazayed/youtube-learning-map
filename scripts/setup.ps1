$ErrorActionPreference = "Stop"

corepack enable
corepack install --global pnpm@11.19.0
node scripts/bootstrap.mjs @args
