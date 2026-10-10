# Slap API image: builds the web app, then runs the Node API which serves it.
# Shape proven in spikes/smoke (236 MB, non-root, health check).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter @slap/web build
RUN pnpm --filter @slap/api deploy --prod --legacy /out/api 2>/dev/null || pnpm --filter @slap/api deploy --prod /out/api

FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=build /out/api /app
COPY --from=build /app/apps/web/dist /app/web-dist
ENV NODE_ENV=production PORT=8787 WEB_DIST=/app/web-dist MODE=cloud
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD wget -qO- http://localhost:8787/api/health || exit 1
CMD ["node", "src/server.ts"]
