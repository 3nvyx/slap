# Throwaway: proves the API image shape. Two stages so a Vite build can be added.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY server.ts ./
COPY public ./public
FROM node:22-alpine
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=build /app /app
USER app
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://localhost:8787/health || exit 1
CMD ["node", "server.ts"]
