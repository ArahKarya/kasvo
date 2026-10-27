# Production image for self-hosting Kasvo. See docs/SELF-HOSTING.md.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
# Prisma's config needs a URL at generate time; the real one comes from the runtime environment.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY mobile/package.json mobile/package.json
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile --filter kasvo
COPY . .
# Dev dependencies stay: the runtime needs the prisma CLI for `migrate deploy` and tsx for `pnpm mcp`.
RUN pnpm prisma generate && pnpm build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app /app
RUN rm -rf /app/mobile /app/tests /app/.git && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm prisma migrate deploy && exec pnpm start -p ${PORT} -H ${HOSTNAME}"]
