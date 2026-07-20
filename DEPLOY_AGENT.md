Agent & API Deployment (production)

Prerequisites
- Node 20+ and pnpm (or npm/yarn)
- Redis and Postgres (or configured managed services)
- PM2 or a systemd-enabled server

Environment (.env)
Create `.env` files for services (examples below).

apps/api/.env.example
```
API_PORT=3001
NEXT_PUBLIC_MONAD_RPC=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_MONAD_RPC_FALLBACK=https://rpc.ankr.com/monad_testnet
NEXT_PUBLIC_ETH_RPC=https://mainnet.infura.io/v3/YOUR_KEY
NEXT_PUBLIC_ETH_RPC_FALLBACK=https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgres://user:pass@localhost:5432/db
ONEINCH_API_KEY=your_1inch_key
ZEROX_API_KEY=your_0x_key
ETH_USD_PRICE=3000
```

apps/agent/.env.example
```
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=nvidia/nemotron-3-ultra-550b-a55b
AGENT_PORT=4000
API_URL=https://api.yourdomain.com
WALLET_PRIVATE_KEY=0x...
MONAD_RPC=https://testnet-rpc.monad.xyz
MONAD_RPC_FALLBACK=https://rpc.ankr.com/monad_testnet
```

Steps (example using pm2)
```bash
# Install dependencies
pnpm install --filter @somnia-agent/api...
pnpm install
pnpm -w build

# Build apps
cd apps/api && pnpm build
cd apps/agent && pnpm build
cd apps/web && pnpm build

# Start with PM2 (or use systemd)
pm install -g pm2
pm2 start dist/index.js --name monad-api --cwd apps/api --env production
pm2 start dist/index.js --name monad-agent --cwd apps/agent --env production
# For Next.js (web) use `next start` or a Vercel deployment
```

Systemd unit (example for `apps/api`)
```
[Unit]
Description=Monad API
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/srv/somnia-agent/apps/api
EnvironmentFile=/srv/somnia-agent/apps/api/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Verification
- Monitor logs (`pm2 logs` or `journalctl -u monad-api`)
- Check health endpoint: `GET /health`

If you want, I can generate ready-to-run `systemd` unit files for each service and a `docker-compose.yml` for local staging. Which would you prefer?
