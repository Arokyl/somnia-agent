# Somnia Agent — AI-Powered DeFi Trading Agent

An AI agent that helps users swap tokens on Somnia (and EVM chains) using natural language commands.

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Foundry (for contracts)

### 1. Install dependencies
```bash
pnpm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Fill in your keys: OpenAI, WalletConnect, Alchemy, 1inch, Supabase, Redis
```

### 3. Start development
```bash
# All services in parallel
pnpm dev

# Or individually:
pnpm --filter @somnia-agent/web   dev   # Frontend  → localhost:3000
pnpm --filter @somnia-agent/api   dev   # Backend   → localhost:3001
pnpm --filter @somnia-agent/agent dev   # AI Agent  → localhost:3002
```

### 4. Deploy contracts (Somnia testnet)
```bash
cd packages/contracts

# Install Foundry deps
forge install OpenZeppelin/openzeppelin-contracts-upgradeable --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit

# Run tests
forge test -vvv

# Deploy
cd packages/contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$SOMNIA_RPC" \
  --chain-id 50312 \
  --broadcast \
  --legacy \
  --gas-limit 8000000 \
  --gas-price 6000000000
```
Or from repo root with pnpm:

```bash
pnpm --filter @somnia-agent/contracts run deploy:somnia
```
## Project Structure

```
somnia-agent/
├── apps/
│   ├── web/       Next.js frontend (port 3000)
│   ├── api/       Fastify backend  (port 3001)
│   └── agent/     AI agent service (port 3002)
├── packages/
│   ├── contracts/ Solidity + Foundry
│   └── shared/    Shared TypeScript types
└── .env.example   All required environment variables
```

## Example Commands

The agent understands natural language:

- `"Swap 0.5 ETH to USDC at the cheapest gas"`
- `"Convert 50% of my portfolio to USDC"`
- `"Sell my ETH when gas drops below 20 gwei"`
- `"Find the best route for 1 ETH to USDT"`
- `"Compare routes from 1inch vs 0x for this swap"`

## Architecture

```
User command (NL)
    ↓
AI Agent (OpenAI GPT-4o-mini + tool calling)
    ↓ calls tools
Backend API (Fastify)
    ├── PortfolioService → viem on-chain reads
    ├── QuoteService     → 1inch + 0x aggregators
    └── GasService       → EIP-1559 analysis
    ↓ builds execution plan
Frontend (Next.js + wagmi)
    ↓ user reviews + signs
ExecutionProxy.sol (Somnia)
    ↓ calls aggregator
DEX / Liquidity Pools
```

## Environment Variables

See `.env.example` for all required variables. Required for MVP:
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (for OpenAI-compatible providers like Groq)
- `OPENAI_MODEL` (defaults to `gpt-4o-mini`)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `ONEINCH_API_KEY` or `ZEROX_API_KEY`
- `DATABASE_URL` (Supabase Postgres)
- `REDIS_URL`

## Roadmap

- **Phase 1 (current):** Single-chain swaps on Somnia, basic NL commands, no LangChain
- **Phase 2:** Conditional orders, multi-chain, full LangChain agent, scheduled execution
- **Phase 3:** Smart contract audit, MEV protection, SDK extraction, white-label
