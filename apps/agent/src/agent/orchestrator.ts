import type {
  OrchestrationPlan,
  Portfolio,
  SubAgentDepth,
  SubAgentFinding,
  SubAgentId,
  SubAgentRun,
} from '@somnia-agent/shared'
import { executeTool } from './tools/index.js'
import { fetchDataSource } from './dataSources.js'

interface OrchestratorContext {
  message: string
  address: string
  chainId: number
}

interface SubAgentDefinition {
  id: SubAgentId
  name: string
  goal: string
  triggers: RegExp[]
  run: (ctx: OrchestratorContext, depth: SubAgentDepth) => Promise<SubAgentRun>
}

export const SUB_AGENT_CATALOG = [
  { id: 'analyst', name: 'Analyst', goal: 'Combine findings and add up balances.' },
  { id: 'marketScout', name: 'Market Scout', goal: 'Search online sources for the latest crypto context.' },
  { id: 'walletStrategist', name: 'Wallet Strategist', goal: 'Review wallet history and identify next asset actions or airdrops.' },
  { id: 'tradeScout', name: 'Trade Scout', goal: 'Find possible spot and futures trade setups with risk controls.' },
  { id: 'slippageWatcher', name: 'Slippage Watcher', goal: 'Track slippage, price impact, and best swap timing.' },
  { id: 'transactionMonitor', name: 'Transaction Monitor', goal: 'Monitor transactions and improve user execution behavior.' },
  { id: 'problemSolver', name: 'Problem Solver', goal: 'Study common user problems and find better solutions.' },
  { id: 'agentAuditor', name: 'Agent Auditor', goal: 'Check other agents for stale or unsafe activity.' },
] as const

const CRYPTO_NEWS_SOURCES = [
  'CoinDesk',
  'The Block',
  'DefiLlama',
  'project docs',
  'official protocol channels',
]

export async function orchestrateSubAgents(ctx: OrchestratorContext): Promise<OrchestrationPlan> {
  const message = ctx.message.trim().toLowerCase()
  const selectedAgents = selectAgents(message)
  const depth = chooseDepth(message, selectedAgents)
  const mode = chooseMode(message)

  const runs = await Promise.all(
    selectedAgents.map(async (id) => {
      const agent = SUB_AGENTS.find((candidate) => candidate.id === id)
      if (!agent) return skippedRun(id, depth)

      try {
        return agent.run(ctx, depth)
      } catch (error) {
        const failedRun: SubAgentRun = {
          id: agent.id,
          name: agent.name,
          depth,
          goal: agent.goal,
          status: 'failed',
          confidence: 0.2,
          findings: [{
            title: 'Subagent failed',
            detail: error instanceof Error ? error.message : 'Unknown subagent error.',
            severity: 'warning',
            confidence: 0.4,
          }],
          nextActions: ['Retry with a narrower request or check the dependent API service.'],
        }
        return failedRun
      }
    })
  )

  return {
    mode,
    depth,
    selectedAgents,
    reason: explainSelection(message, selectedAgents),
    runs,
  }
}

export function summarizeOrchestration(plan: OrchestrationPlan): string {
  if (plan.runs.length === 0) return ''

  const highlights: string[] = plan.runs
    .flatMap((run: SubAgentRun) => run.findings.slice(0, plan.depth === 'deep' ? 2 : 1).map((finding: SubAgentFinding) => `${run.name}: ${finding.detail}`))
    .slice(0, 5)

  if (highlights.length === 0) return ''
  return `\n\nSubagent observations:\n${highlights.map((item: string) => `- ${item}`).join('\n')}`
}

const SUB_AGENTS: SubAgentDefinition[] = [
  {
    id: 'analyst',
    name: 'Analyst',
    goal: 'Combine subagent observations and add portfolio balances into one readable view.',
    triggers: [/\b(balance|portfolio|hold|asset|worth|sum|total)\b/],
    run: async (ctx, depth) => {
      const portfolio = await safePortfolio(ctx)
      const findings: SubAgentFinding[] = portfolio
        ? [{
            title: 'Portfolio total',
            detail: `Wallet ${shortAddress(ctx.address)} has ${portfolio.tokens.length} tracked assets with an estimated total value of $${portfolio.totalUsdValue.toFixed(2)}.`,
            severity: 'info',
            confidence: 0.82,
          }]
        : [{
            title: 'Portfolio unavailable',
            detail: 'Portfolio service did not return balances, so the analyst can only summarize known conversation context.',
            severity: 'warning',
            confidence: 0.48,
          }]

      if (portfolio && depth !== 'light') {
        findings.push({
          title: 'Largest balances',
          detail: topBalances(portfolio),
          severity: 'info',
          confidence: 0.76,
        })
      }

      return completedRun('analyst', 'Analyst', depth, SUB_AGENT_GOALS.analyst, findings, [
        'Use this balance summary before recommending swaps, airdrops, or risk changes.',
      ])
    },
  },
  {
    id: 'marketScout',
    name: 'Market Scout',
    goal: 'Gather latest crypto context from configured online sources.',
    triggers: [/\b(news|latest|market|internet|online|crypto|update|alpha|narrative)\b/],
    run: async (ctx, depth) => {
      const marketFeed = await fetchDataSource('marketNews', { query: ctx.message })
      return completedRun('marketScout', 'Market Scout', depth, SUB_AGENT_GOALS.marketScout, [
        {
          title: 'Live market source policy',
          detail: marketFeed.items.length
            ? `Latest configured market feed returned ${marketFeed.items.length} items. Lead item: ${marketFeed.items[0]}.`
            : `No MARKET_NEWS_API_URL is configured yet. Connect a news/search service and prefer sources such as ${CRYPTO_NEWS_SOURCES.join(', ')}.`,
          severity: marketFeed.items.length ? 'info' : 'warning',
          confidence: marketFeed.items.length ? 0.78 : 0.55,
          source: marketFeed.source,
        },
      ], [
        'Use official project sources for protocol-specific claims.',
        'Treat social/news data as context, not as financial advice.',
      ])
    },
  },
  {
    id: 'walletStrategist',
    name: 'Wallet Strategist',
    goal: 'Review wallet history and suggest next useful actions, including airdrop discovery.',
    triggers: [/\b(history|airdrop|claim|eligible|next|strategy|wallet)\b/],
    run: async (ctx, depth) => {
      const portfolio = await safePortfolio(ctx)
      const airdrops = await fetchDataSource('airdrop', { address: ctx.address, chainId: ctx.chainId, query: ctx.message })
      const history = await fetchDataSource('walletHistory', { address: ctx.address, chainId: ctx.chainId })
      return completedRun('walletStrategist', 'Wallet Strategist', depth, SUB_AGENT_GOALS.walletStrategist, [
        {
          title: 'Next action map',
          detail: airdrops.items.length
            ? `Configured airdrop feed returned ${airdrops.items.length} opportunities. Verify official claim pages before connecting.`
            : history.items.length
            ? `Wallet history source returned ${history.items.length} recent signals. Use them to classify next asset actions before suggesting claims or swaps.`
            : portfolio
            ? `Start from ${portfolio.tokens.length} detected assets: check unclaimed rewards, stale small balances, approvals, and positions with poor liquidity.`
            : 'Fetch wallet history and token approvals before recommending airdrop or asset cleanup actions.',
          severity: 'info',
          confidence: airdrops.items.length ? 0.72 : history.items.length ? 0.68 : portfolio ? 0.74 : 0.5,
          source: airdrops.source || history.source,
        },
      ], [
        'Add an authenticated history endpoint for full transaction classification.',
        'Search airdrops only from official claim pages and verified ecosystem announcements.',
      ])
    },
  },
  {
    id: 'tradeScout',
    name: 'Trade Scout',
    goal: 'Search for spot and futures trade ideas while keeping user approval and risk bounds explicit.',
    triggers: [/\b(trade|spot|future|futures|long|short|entry|exit|buy|sell)\b/],
    run: async (ctx, depth) => {
      const ideas = await fetchDataSource('tradeIdeas', { address: ctx.address, chainId: ctx.chainId, query: ctx.message })
      return completedRun('tradeScout', 'Trade Scout', depth, SUB_AGENT_GOALS.tradeScout, [
        {
          title: 'Trade risk boundary',
          detail: ideas.items.length
            ? `Configured trade feed returned ${ideas.items.length} setups. Treat them as scenarios and require max-loss, invalidation, and time horizon before action.`
            : 'Trade scout can compare setups and scenarios, but should not present leveraged entries without liquidation, invalidation, and max-loss context.',
          severity: 'warning',
          confidence: ideas.items.length ? 0.74 : 0.78,
          source: ideas.source,
        },
      ], [
        'Ask for time horizon and maximum loss before any spot or futures idea.',
        'Prefer route quotes for spot swaps and require explicit confirmation before signing.',
      ])
    },
  },
  {
    id: 'slippageWatcher',
    name: 'Slippage Watcher',
    goal: 'Check slippage, price impact, and timing for swaps.',
    triggers: [/\b(slippage|price impact|best price|swap|route|quote|cheap|cheapest)\b/],
    run: async (_ctx, depth) => completedRun('slippageWatcher', 'Slippage Watcher', depth, SUB_AGENT_GOALS.slippageWatcher, [
      {
        title: 'Swap quality checks',
        detail: 'Before execution, compare quotes, flag price impact above 1%, verify minimum received, and suggest waiting if route quality is weak.',
        severity: 'info',
        confidence: 0.86,
      },
    ], [
      'Call get_all_quotes for route comparison requests.',
      'Call get_gas_price before recommending execution timing.',
    ]),
  },
  {
    id: 'transactionMonitor',
    name: 'Transaction Monitor',
    goal: 'Monitor transaction behavior and explain what the user can do better next time.',
    triggers: [/\b(transaction|tx|monitor|failed|pending|gas|approval|sign|signed)\b/],
    run: async (ctx, depth) => {
      const txSignals = await fetchDataSource('transactionMonitor', { address: ctx.address, chainId: ctx.chainId })
      return completedRun('transactionMonitor', 'Transaction Monitor', depth, SUB_AGENT_GOALS.transactionMonitor, [
        {
          title: 'Review loop',
          detail: txSignals.items.length
            ? `Transaction monitor source returned ${txSignals.items.length} recent signals to compare against gas, approvals, and route quality.`
            : 'Monitor approvals, failed transactions, gas paid, and route differences between plan and wallet prompt.',
          severity: 'info',
          confidence: txSignals.items.length ? 0.76 : 0.72,
          source: txSignals.source,
        },
      ], [
        'Compare unsigned transaction details against the wallet confirmation.',
        'After execution, classify result as confirmed, failed, or needs follow-up.',
      ])
    },
  },
  {
    id: 'problemSolver',
    name: 'Problem Solver',
    goal: 'Study common user problems and look for better solutions.',
    triggers: [/\b(problem|issue|stuck|confusing|innovative|solution|improve|better)\b/],
    run: async (ctx, depth) => {
      const problems = await fetchDataSource('problemResearch', { query: ctx.message })
      return completedRun('problemSolver', 'Problem Solver', depth, SUB_AGENT_GOALS.problemSolver, [
        {
          title: 'User friction scan',
          detail: problems.items.length
            ? `Problem research feed returned ${problems.items.length} signals. Use them to improve guidance and pre-signing warnings.`
            : 'Common DeFi pain points are unclear signing prompts, hidden approvals, failed swaps, bad routing, and airdrop phishing.',
          severity: 'info',
          confidence: problems.items.length ? 0.76 : 0.78,
          source: problems.source,
        },
      ], [
        'Turn repeated user confusion into product prompts or pre-signing warnings.',
        'Use web research only with cited, reputable sources when enabled.',
      ])
    },
  },
  {
    id: 'agentAuditor',
    name: 'Agent Auditor',
    goal: 'Check whether the other agents are acting safely or using stale assumptions.',
    triggers: [/\b(audit|wrong|mistake|safety|safe|verify|check)\b/],
    run: async (ctx, depth) => {
      const audit = await fetchDataSource('agentAudit', { query: ctx.message })
      return completedRun('agentAuditor', 'Agent Auditor', depth, SUB_AGENT_GOALS.agentAuditor, [
        {
          title: 'Safety audit',
          detail: audit.items.length
            ? `Agent audit feed returned ${audit.items.length} safety checks. Apply them before final recommendations.`
            : 'Other subagents should separate facts from inference, avoid telling users what to buy, and ask for confirmation before execution.',
          severity: 'info',
          confidence: audit.items.length ? 0.82 : 0.84,
          source: audit.source,
        },
      ], [
        'Flag missing sources for live market claims.',
        'Block execution if quote, calldata, chain, or token addresses are incomplete.',
      ])
    },
  },
]

const SUB_AGENT_GOALS: Record<SubAgentId, string> = {
  analyst: 'Combine findings and add up balances.',
  marketScout: 'Search online sources for the latest crypto context.',
  walletStrategist: 'Review wallet history and identify next asset actions or airdrops.',
  tradeScout: 'Find possible spot and futures trade setups with risk controls.',
  slippageWatcher: 'Track slippage, price impact, and best swap timing.',
  transactionMonitor: 'Monitor transactions and improve user execution behavior.',
  problemSolver: 'Study common user problems and find better solutions.',
  agentAuditor: 'Check other agents for stale or unsafe activity.',
}

function selectAgents(message: string): SubAgentId[] {
  const selected = new Set<SubAgentId>(['agentAuditor'])

  for (const agent of SUB_AGENTS) {
    if (agent.triggers.some((trigger) => trigger.test(message))) selected.add(agent.id)
  }

  if (/\b(swap|quote|route|gas)\b/.test(message)) {
    selected.add('slippageWatcher')
    selected.add('transactionMonitor')
  }

  if (/\b(airdrop|history|wallet|portfolio|asset)\b/.test(message)) {
    selected.add('walletStrategist')
    selected.add('analyst')
  }

  if (/\b(latest|news|internet|online|alpha)\b/.test(message)) {
    selected.add('marketScout')
  }

  return Array.from(selected).slice(0, 5)
}

function chooseDepth(message: string, selected: SubAgentId[]): SubAgentDepth {
  if (/\b(deep|thorough|full|all agents|research)\b/.test(message)) return 'deep'
  if (selected.length >= 4) return 'standard'
  if (/\b(quick|brief|simple)\b/.test(message)) return 'light'
  return 'standard'
}

function chooseMode(message: string): OrchestrationPlan['mode'] {
  if (/\b(monitor|watch|alert|notify)\b/.test(message)) return 'monitor'
  if (/\b(swap|trade|buy|sell|route|quote)\b/.test(message)) return 'plan'
  if (/\b(what should|next|strategy|airdrop|improve)\b/.test(message)) return 'advise'
  return 'observe'
}

function explainSelection(message: string, selected: SubAgentId[]) {
  if (selected.length === 1 && selected[0] === 'agentAuditor') {
    return 'Safety auditor is always active so the main agent keeps claims and execution boundaries clear.'
  }
  return `Selected ${selected.length} subagents from the user request: "${message.slice(0, 120)}".`
}

async function safePortfolio(ctx: OrchestratorContext): Promise<Portfolio | null> {
  try {
    return await executeTool('get_portfolio', { address: ctx.address, chainId: ctx.chainId }) as Portfolio
  } catch {
    return null
  }
}

function completedRun(
  id: SubAgentId,
  name: string,
  depth: SubAgentDepth,
  goal: string,
  findings: SubAgentFinding[],
  nextActions: string[]
): SubAgentRun {
  const confidence = findings.length
    ? findings.reduce((sum, finding) => sum + finding.confidence, 0) / findings.length
    : 0.6

  return { id, name, depth, goal, status: 'completed', confidence, findings, nextActions }
}

function skippedRun(id: SubAgentId, depth: SubAgentDepth): SubAgentRun {
  return {
    id,
    name: id,
    depth,
    goal: SUB_AGENT_GOALS[id],
    status: 'skipped',
    confidence: 0,
    findings: [],
    nextActions: [],
  }
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function topBalances(portfolio: Portfolio) {
  const top = [...portfolio.tokens]
    .sort((a, b) => b.balanceUsd - a.balanceUsd)
    .slice(0, 3)
    .map((token) => `${token.symbol}: ${token.balanceFormatted} ($${token.balanceUsd.toFixed(2)})`)

  return top.length ? top.join(', ') : 'No non-zero tracked balances were returned.'
}
