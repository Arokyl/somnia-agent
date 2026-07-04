# Somnia Agent Subagents

Somnia Agent now has an orchestration layer in `apps/agent/src/agent/orchestrator.ts`.
The main chat handler runs the orchestrator before the LLM loop, adds the subagent observations to the system context, and returns the structured orchestration result to the frontend.

## Active Subagents

- Analyst: combines subagent observations and adds up portfolio balances.
- Market Scout: checks configured online crypto feeds for current context.
- Wallet Strategist: studies wallet assets and next actions, including airdrop discovery.
- Trade Scout: compares spot and futures trade ideas with risk boundaries.
- Slippage Watcher: checks swap route quality, slippage, price impact, and timing.
- Transaction Monitor: watches transaction behavior and suggests execution improvements.
- Problem Solver: studies common user problems and turns them into better guidance.
- Agent Auditor: reviews other agents for stale assumptions and unsafe behavior.

## Runtime Flow

1. User sends a message to `POST /chat`.
2. The orchestration agent selects subagents based on the request.
3. Selected subagents run at `light`, `standard`, or `deep` depth.
4. Findings are summarized into the model context.
5. The chat response returns both the assistant reply and `orchestration`.
6. The web app displays the active subagents inside each assistant message.

## Service Endpoints

- `POST /chat`: main chat and planning endpoint.
- `GET /subagents`: returns the backend subagent catalog for wallet or frontend surfaces.
- `GET /health`: basic service health check.

## Optional Live Feeds

These are optional. If they are empty, subagents degrade gracefully and explain that live feeds are not configured. Feed URLs may include `{address}`, `{chainId}`, `{chainHex}`, `{query}`, and `{apiKey}` placeholders.

```env
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

Expected feed shape can be either a JSON array or an object with `items` or `results`.
Each item may include `title`, `name`, `headline`, or `summary`.

## Data API Mapping

- Market Scout uses `MARKET_NEWS_API_URL`.
- Wallet Strategist uses `AIRDROP_FEED_URL` and `WALLET_HISTORY_API_URL`.
- Trade Scout uses `TRADE_IDEAS_API_URL`.
- Transaction Monitor uses `TRANSACTION_MONITOR_API_URL`.
- Problem Solver uses `USER_PROBLEM_FEED_URL`.
- Agent Auditor uses `AGENT_AUDIT_FEED_URL`.
- Slippage Watcher uses the existing quote tools, which call the API service and its `ONEINCH_API_KEY` / `ZEROX_API_KEY`.
- Analyst uses the existing portfolio tool, which calls the API service and RPC/token data.

Example:

```env
WALLET_HISTORY_API_URL=https://deep-index.moralis.io/api/v2.2/wallets/{address}/history?chain={chainHex}
MARKET_NEWS_API_URL=https://example.com/search?q={query}
MARKET_NEWS_API_URL=https://example.com/search?q={query}&apiKey={apiKey}
```

## Wallet Surface

The current app does not include a browser wallet extension package. The wallet-facing agent is implemented as a persistent floating launcher in the dashboard that jumps to the connected-wallet chat surface.
