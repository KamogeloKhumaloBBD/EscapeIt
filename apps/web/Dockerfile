FROM node:24.18.0-alpine AS base
RUN npm install --global pnpm@11.21.0
WORKDIR /repo

FROM base AS build
ARG API_INTERNAL_URL=http://api:4000
ARG MCP_INTERNAL_URL=http://mcp:4100
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV MCP_INTERNAL_URL=$MCP_INTERNAL_URL
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/db packages/db
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @context-layer/web build

FROM node:24.18.0-alpine AS runtime
ARG API_INTERNAL_URL=http://api:4000
ARG MCP_INTERNAL_URL=http://mcp:4100
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV MCP_INTERNAL_URL=$MCP_INTERNAL_URL
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
