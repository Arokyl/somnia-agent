FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-workspace.yaml ./
COPY apps/agent/package.json apps/agent/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile=false

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build:agent

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY --from=build /app ./
EXPOSE 3002
CMD ["pnpm", "--filter", "@somnia-agent/agent", "start"]
