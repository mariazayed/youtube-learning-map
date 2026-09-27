FROM node:24.19.0-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack install --global pnpm@11.19.0

USER node
WORKDIR /workspace
