# Slap API image: builds the web app, then runs the Node API which serves it and the landing page (website/).
# The runtime stage keeps the workspace layout (apps/api, packages/contracts) so that
# @slap/contracts resolves through its workspace symlink to packages/contracts, outside
# node_modules: Node refuses to strip types from TypeScript under node_modules.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM base AS web
RUN pnpm install --frozen-lockfile --filter "@slap/web..."
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @slap/web build

# Production dependencies of the API only; the pnpm store stays behind in this stage.
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter "@slap/api..."

FROM node:22-alpine
RUN apk add --no-cache wget
WORKDIR /app
COPY --from=prod-deps /app ./
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
COPY --from=web /app/apps/web/dist ./apps/web/dist
COPY website ./website
# Uploaded PDFs are kept here until parsed; the rest of the image is read-only to `node`.
RUN mkdir apps/api/.uploads && chown node:node apps/api/.uploads
WORKDIR /app/apps/api
ENV NODE_ENV=production PORT=8787 MODE=cloud
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD wget -qO- http://localhost:8787/api/health || exit 1
CMD ["node", "src/server.ts"]
