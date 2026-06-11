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
NEXT_PUBLIC_EXECUTION_PROXY_SOMNIA=0x62ABDCFab87fbE9D66893C389C7D1B8AF6ffb9E5
NEXT_PUBLIC_EXECUTION_PROXY_ETH=0x
```

If the backend/agent services are deployed, also set:

```bash
API_URL=
AGENT_URL=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_AGENT_URL=
```

Do not add private keys to Vercel for the frontend project.

## CLI Deploy

After logging in with `vercel login`, run from the repo root:

```bash
vercel --prod
```

If you run the command from `apps/web`, Vercel will append the saved root directory again. Run from the repo root when the project setting is `apps/web`.
