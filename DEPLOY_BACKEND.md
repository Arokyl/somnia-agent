# Deploy Backend Services

The frontend is on Vercel. Deploy these two services separately:

- `apps/agent`: AI chat and execution-plan service
- `apps/api`: portfolio, quote, gas, history, and order API

Both services expose:

```txt
GET /health
```

## Render

You can use `render.yaml` from the repo root, or create two Web Services manually.

Copy environment variables from:

- `deploy-env.agent.example`
- `deploy-env.api.example`

### Agent Service

```txt
Root Directory: .
Build Command: corepack pnpm install --frozen-lockfile=false && corepack pnpm build:agent
Start Command: corepack pnpm --filter @somnia-agent/agent start
Health Check Path: /health
```

Required env vars:

```bash
OPENAI_API_KEY=
OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1
OPENAI_MODEL=nvidia/nemotron-3-ultra-550b-a55b
FRONTEND_URL=https://somnia-agent.vercel.app
CORS_ORIGINS=https://somnia-agent.vercel.app
API_URL=https://your-api-service.onrender.com
SOMNIA_RPC=https://api.infra.testnet.somnia.network/
SOMNIA_CHAIN_ID=50312
SOMNIA_EXPLORER_URL=https://shannon-explorer.somnia.network
EXECUTION_PROXY_ADDRESS=0xdBA2b47E8348b79422B736c4017336f44d2ff0a6
MARKET_NEWS_API_URL=
MARKET_NEWS_API_KEY=
AIRDROP_FEED_URL=
AIRDROP_FEED_API_KEY=
WALLET_HISTORY_API_URL=
WALLET_HISTORY_API_KEY=
TRADE_IDEAS_API_URL=
TRADE_IDEAS_API_KEY=
TRANSACTION_MONITOR_API_URL=
TRANSACTION_MONITOR_API_KEY=
USER_PROBLEM_FEED_URL=
USER_PROBLEM_FEED_API_KEY=
AGENT_AUDIT_FEED_URL=
AGENT_AUDIT_FEED_API_KEY=
```

### API Service

```txt
Root Directory: .
Build Command: corepack pnpm install --frozen-lockfile=false && corepack pnpm build:api
Start Command: corepack pnpm --filter @somnia-agent/api start
Health Check Path: /health
```

Required env vars:

```bash
FRONTEND_URL=https://somnia-agent.vercel.app
CORS_ORIGINS=https://somnia-agent.vercel.app
DATABASE_URL=
SOMNIA_RPC=https://api.infra.testnet.somnia.network/
SOMNIA_CHAIN_ID=50312
SOMNIA_EXPLORER_URL=https://shannon-explorer.somnia.network
ETH_USD_PRICE=3000
```

Optional env vars:

```bash
REDIS_URL=
ONEINCH_API_KEY=
ZEROX_API_KEY=
```

The subagent data API URLs are optional JSON feeds. Leave them empty until you have trusted providers. URLs can include `{address}`, `{chainId}`, `{chainHex}`, `{query}`, and `{apiKey}` placeholders.

## Railway

Create two services from the same repo. Use these commands:

Agent:

```bash
pnpm install --frozen-lockfile=false
pnpm build:agent
pnpm --filter @somnia-agent/agent start
```

API:

```bash
pnpm install --frozen-lockfile=false
pnpm build:api
pnpm --filter @somnia-agent/api start
```

Railway sets `PORT` automatically. The services support `PORT`, `AGENT_PORT`, and `API_PORT`.

## Connect Frontend

After deployment, add these to the Vercel frontend project:

```bash
AGENT_URL=https://your-agent-service
NEXT_PUBLIC_AGENT_URL=https://your-agent-service
API_URL=https://your-api-service
NEXT_PUBLIC_API_URL=https://your-api-service
```

Redeploy the frontend after changing Vercel environment variables.
