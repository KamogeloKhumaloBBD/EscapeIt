FROM node:24.18.0-alpine AS base
RUN npm install --global pnpm@11.21.0
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @context-layer/api... build
RUN pnpm --filter @context-layer/api deploy --prod /prod/api

FROM node:24.18.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 api
COPY --from=build --chown=api:nodejs /prod/api ./
USER api
EXPOSE 4000
CMD ["node", "dist/server.js"]
