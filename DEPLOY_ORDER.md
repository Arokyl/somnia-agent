# Deployment Order

Use this order after local health checks pass.

## 1. Agent Service

Deploy `apps/agent` first.

Build command:

```bash
corepack enable && corepack prepare pnpm@9.0.0 --activate && pnpm install --frozen-lockfile=false && pnpm build:agent
```

Start command:

```bash
pnpm --filter @somnia-agent/agent start
```

Health path:

```txt
/health
```

Copy env vars from `deploy-env.agent.example`.

## 2. API Service

Deploy `apps/api` second.

Build command:

```bash
corepack enable && corepack prepare pnpm@9.0.0 --activate && pnpm install --frozen-lockfile=false && pnpm build:api
```

Start command:

```bash
pnpm --filter @somnia-agent/api start
```

Health path:

```txt
/health
```

Copy env vars from `deploy-env.api.example`.

## 3. Frontend Wiring

After both backend URLs exist, update the Vercel frontend env vars from `deploy-env.frontend.example`:

```bash
AGENT_URL=https://your-agent-service-url
NEXT_PUBLIC_AGENT_URL=https://your-agent-service-url
API_URL=https://your-api-service-url
NEXT_PUBLIC_API_URL=https://your-api-service-url
```

Redeploy the frontend after changing env vars.

## 4. Smoke Tests

```bash
curl https://your-agent-service-url/health
curl https://your-api-service-url/health
curl https://somnia-agent.vercel.app/api/health
```

All three should report healthy services.
