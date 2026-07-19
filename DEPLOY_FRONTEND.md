# Deploy Frontend to Vercel

Use `apps/web` as the Vercel project root. The frontend package includes its own `vercel.json` for this setup.

## Vercel Settings

- Framework Preset: `Next.js`
- Root Directory: `apps/web`
- Install Command: `cd ../.. && pnpm install --frozen-lockfile=false`
- Build Command: `pnpm build`
- Output Directory: leave empty/default for Next.js
- Node.js Version: `20.x`

## Required Environment Variables

Add these in Vercel Project Settings -> Environment Variables:

You can copy from `deploy-env.frontend.example`.

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_SOMNIA_RPC=https://api.infra.testnet.somnia.network/
NEXT_PUBLIC_SOMNIA_RPC_FALLBACK=https://dream-rpc.somnia.network
NEXT_PUBLIC_SOMNIA_CHAIN_ID=50312
NEXT_PUBLIC_SOMNIA_EXPLORER_URL=https://shannon-explorer.somnia.network
NEXT_PUBLIC_ETH_RPC=https://rpc.ankr.com/eth
NEXT_PUBLIC_BASE_RPC=https://rpc.ankr.com/base
NEXT_PUBLIC_ARB_RPC=https://rpc.ankr.com/arbitrum
NEXT_PUBLIC_EXECUTION_PROXY_SOMNIA=0xdBA2b47E8348b79422B736c4017336f44d2ff0a6
NEXT_PUBLIC_EXECUTION_PROXY_ETH=0x
```

If the backend/agent services are deployed, also set:

```bash
API_URL=
AGENT_URL=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_AGENT_URL=
ALLOW_DEMO_AGENT=false
```

`AGENT_URL` must point at the deployed agent service. In production, the web app will not create demo chat plans unless `ALLOW_DEMO_AGENT=true` is explicitly set.

Do not add private keys to Vercel for the frontend project.

## Fixing Vercel 404 / Wrong Project Root

If Vercel shows a platform page like `404: NOT_FOUND` at `/`, the frontend project is probably deploying the monorepo root instead of `apps/web`, or it is deploying an older GitHub commit.

Check these before redeploying:

```bash
git status --short
git log -1 --oneline
git grep -n "Live agent service"
git grep -n "ALLOW_DEMO_AGENT"
```

Then confirm the Vercel project uses:

```text
Root Directory: apps/web
Install Command: cd ../.. && pnpm install --frozen-lockfile=false
Build Command: pnpm build
Output Directory: default / empty
```

The root `vercel.json` intentionally fails with a clear message if the monorepo root is deployed as the frontend. The working frontend Vercel config is `apps/web/vercel.json`.

## CLI Deploy

After logging in with `vercel login`, run from the repo root:

```bash
vercel --prod
```

If you run the command from `apps/web`, Vercel will append the saved root directory again. Run from the repo root when the project setting is `apps/web`.
