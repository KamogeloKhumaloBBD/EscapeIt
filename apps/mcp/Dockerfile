FROM node:24.18.0-alpine AS base
RUN npm install --global pnpm@11.21.0
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps/mcp apps/mcp
COPY packages packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @context-layer/mcp... build
RUN pnpm --filter @context-layer/mcp deploy --prod /prod/mcp

FROM node:24.18.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 mcp
COPY --from=build --chown=mcp:nodejs /prod/mcp ./
USER mcp
EXPOSE 4100
CMD ["node", "dist/server.js"]
