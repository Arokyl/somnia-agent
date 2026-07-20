import OpenAI from 'openai'
import type { Request, Response } from 'express'
import { encodeFunctionData, isAddress, zeroAddress } from 'viem'
import { SYSTEM_PROMPT } from './prompts/system.js'
import { tools, executeTool, isReturnPlanResult } from './tools/index.js'
import { orchestrateSubAgents, summarizeOrchestration } from './orchestrator.js'
import { CHAIN_NAMES } from '@somnia-agent/shared'
import type { ExecutionPlan } from '@somnia-agent/shared'
import {
  conversationMemory,
  type ConversationMemory,
  type StoredMessage,
} from './memory.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const DEFAULT_SLIPPAGE_BPS = 50
const DEFAULT_DEADLINE_SECONDS = 20 * 60

// ---------------------------------------------------------------------------
// Configurable model pricing
// ---------------------------------------------------------------------------
interface ModelPricing {
  inputPer1k: number
  outputPer1k: number
}

// Per-model lookup table. Values are USD per 1K tokens (input, output).
// moonshotai/kimi-k2.6 uses NVIDIA NIM pricing: $0.60/M input, $1.80/M output.
const PRICING_TABLE: Record<string, ModelPricing> = {
  'nvidia/nemotron-3-ultra-550b-a55b': { inputPer1k: 0, outputPer1k: 0 },
  'moonshotai/kimi-k2.6': { inputPer1k: 0.0006, outputPer1k: 0.0018 },
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
}

function resolvePricing(model: string): ModelPricing {
  const raw = process.env.MODEL_PRICING
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { input_per_1k?: unknown; output_per_1k?: unknown }
      if (typeof parsed.input_per_1k === 'number' && typeof parsed.output_per_1k === 'number') {
        return { inputPer1k: parsed.input_per_1k, outputPer1k: parsed.output_per_1k }
      }
      logJson('error', 'config.pricing.invalid', {
        detail: 'MODEL_PRICING missing input_per_1k/output_per_1k; falling back to table',
      })
    } catch {
      logJson('error', 'config.pricing.invalid', {
        detail: 'MODEL_PRICING is not valid JSON; falling back to table',
      })
    }
  }
  return PRICING_TABLE[model] ?? PRICING_TABLE['gpt-4o-mini']
}

const PRICING = resolvePricing(openaiModel)

// ---------------------------------------------------------------------------
// Structured logging for observability
// ---------------------------------------------------------------------------
function logJson(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level, event, ts: new Date().toISOString(), ...data }))
}

function round(n: number, digits = 6): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

// ---------------------------------------------------------------------------
// LLM call with retry + exponential backoff for transient errors
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3

async function callLLM(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.ChatCompletion> {
  let attempt = 0
  while (true) {
    try {
      return await openai.chat.completions.create(params)
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status
      const type = err?.error?.type ?? err?.code
      const isRateLimit = status === 429 || type === 'rate_limit_exceeded'
      const isTransient =
        isRateLimit ||
        ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNABORTED'].includes(err?.code) ||
        /timeout|timed out/i.test(String(err?.message ?? ''))
      if (!isTransient || attempt >= MAX_RETRIES) {
        throw err
      }
      attempt++
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.random() * 500
      logJson('warn', 'llm.retry', {
        attempt,
        maxRetries: MAX_RETRIES,
        status,
        type,
        model: openaiModel,
        error: String(err?.message ?? err),
        delayMs: Math.round(delay),
      })
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}

// ---------------------------------------------------------------------------
// Conversation memory summarizer (uses the same LLM)
// ---------------------------------------------------------------------------
async function summarizeConversation(_conversationId: string, messages: StoredMessage[]): Promise<string> {
  const transcript = messages.map((m) => `${m.role}: ${m.content}`).join('\n')
  const completion = await callLLM({
    model: openaiModel,
    messages: [
      {
        role: 'system',
        content:
          'You are a memory compressor for a DeFi trading assistant. Summarize the conversation below into a concise third-person note (under 200 words). Preserve: the user\'s goals, token preferences, amounts discussed, risk boundaries, pending plans, and any open questions. Drop filler and greeting chatter.',
      },
      { role: 'user', content: transcript },
    ],
    temperature: 0,
    max_tokens: 400,
  })
  return completion.choices[0]?.message?.content?.trim() ?? ''
}

conversationMemory.setSummarizer(summarizeConversation)

// ---------------------------------------------------------------------------
const executionProxyAbi = [
  {
    type: 'function',
    name: 'executeSwap',
    stateMutability: 'payable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'aggregatorTarget', type: 'address' },
      { name: 'aggregatorCalldata', type: 'bytes' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const

interface ChatRequest {
  message: string
  walletContext: { address: string; chainId: number; authMessage?: string; authSignature?: string }
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

function getCommonReply(message?: string) {
  const text = message?.trim().toLowerCase() ?? ''
  if (!text) return null

  if (/^(hi|hello|hey|yo|gm|good\s+(morning|afternoon|evening))[\s!.]*$/.test(text)) {
    return {
      reply:
        'Hello. I am online and ready. You can speak normally: ask for a swap plan, a route comparison, gas timing, or a plain-language lesson before you sign anything.',
      reaction: 'greeting',
    }
  }

  if (/\b(thanks|thank you|appreciate it)\b/.test(text)) {
    return {
      reply:
        'You are welcome. Strong execution is quiet: know the goal, size the risk, read the wallet prompt, and only sign when the transaction matches the plan.',
      reaction: 'thanks',
    }
  }

  if (/\b(advice|teach|teacher|guide|learn|explain|safe|safely|risk)\b/.test(text)) {
    return {
      reply:
        'Teacher mode: begin with the outcome, then inspect the risk. For every swap, check six things: token in, token out, amount, expected output, price impact, and gas. Then compare those details against the wallet confirmation. If one line feels unclear, do not sign yet.',
      reaction: 'teacher',
    }
  }

  if (/\b(what should i buy|what to buy|buy now|should i buy|invest|investment|pick a token|which token)\b/.test(text)) {
    return {
      reply:
        'Teacher mode: I cannot tell you what to buy, but I can help you make a disciplined decision. Start with your time horizon, maximum loss, liquidity, catalyst, and whether the trade still makes sense after fees and slippage. If you name two or three tokens, I can help compare their risks in plain language before you decide.',
      reaction: 'teacher',
    }
  }

  if (/\b(help|what can you do|commands?)\b/.test(text)) {
    return {
      reply:
        'I can teach, translate DeFi terms, compare routes, prepare swap plans, wait for cheaper gas, and help you review a transaction before you sign. I do not submit wallet transactions for you.',
      reaction: 'help',
    }
  }

  return null
}

export async function chatHandler(req: Request, res: Response, memory: ConversationMemory = conversationMemory) {
  const { message, walletContext, history = [] } = req.body as ChatRequest

  if (!message || !walletContext?.address) {
    return res.status(400).json({ error: 'Missing message or walletContext' })
  }

  const { address, chainId, authMessage, authSignature } = walletContext
  const chainName = CHAIN_NAMES[chainId as keyof typeof CHAIN_NAMES] ?? `Chain ${chainId}`
  const conversationId = `${address}:${chainId}`

  const orchestration = await orchestrateSubAgents({ message, address, chainId })
  const orchestrationSummary = summarizeOrchestration(orchestration)
  const commonReply = getCommonReply(message)
  if (commonReply) {
    // Seed memory so even quick replies build context.
    memory.addMessage(conversationId, 'user', message)
    memory.addMessage(conversationId, 'assistant', commonReply.reply)
    return res.json({ ...commonReply, orchestration })
  }

  // Seed memory from any history provided by the client on a fresh conversation.
  // Persisted memory is the source of truth thereafter, so we only seed when empty.
  if (history.length && memory.getHistory(conversationId).length === 0) {
    for (const m of history) memory.addMessage(conversationId, m.role, m.content)
  }

  // Build system prompt with current context
  const systemContent = SYSTEM_PROMPT
    .replace('{datetime}', new Date().toISOString())
    .replace('{address}', address)
    .replace('{chainId}', chainId.toString())
    .replace('{chainName}', chainName)
    + orchestrationSummary

  // Condense older context into a summary when the conversation is long.
  const summary = await memory.summarizeHistory(conversationId)
  const historyMessages = memory.getHistory(conversationId, 20)

  // Build message history
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
  ]
  if (summary) {
    messages.push({
      role: 'system',
      content: `Conversation summary (previous context, condensed):\n${summary}`,
    })
  }
  for (const m of historyMessages) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: message })

  // Persist the user's turn now (assistant turn is added after the loop).
  memory.addMessage(conversationId, 'user', message)

  const auth =
    authMessage && authSignature ? { address, message: authMessage, signature: authSignature } : undefined

  try {
    let reply = ''
    let plan: ExecutionPlan | undefined
    let orderCreation: { unsignedTx: { to: string; data: string; value: string; gasLimit: string }; order: Record<string, any> } | undefined
    let iterations = 0
    const MAX_ITERATIONS = 6
    const MAX_COST_USD = 0.50 // Stop if cumulative API cost exceeds 50 cents
    const TIMEOUT_MS = 30_000 // 30 second timeout per request
    const START_TIME = Date.now()

    let cumulativeCostUsd = 0
    let cumulativeTokens = { input: 0, output: 0 }
    let finalized = false

    // Agentic loop: keep calling until the model stops using tools
    while (iterations < MAX_ITERATIONS) {
      // Check timeout
      if (Date.now() - START_TIME > TIMEOUT_MS) {
        logJson('warn', 'agent.timeout', { iterations, conversationId })
        break
      }

      // Check cost limit
      if (cumulativeCostUsd > MAX_COST_USD) {
        logJson('warn', 'agent.cost_limit', { cumulativeCostUsd, maxCostUsd: MAX_COST_USD, conversationId })
        reply = 'Cost limit exceeded. Please try a simpler request.'
        break
      }

      iterations++

      const completion = await callLLM({
        model: openaiModel,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0,
        max_tokens: 1500,
      })

      // Track token usage and cost
      if (completion.usage) {
        cumulativeTokens.input += completion.usage.prompt_tokens
        cumulativeTokens.output += completion.usage.completion_tokens

        const iterationCost =
          (completion.usage.prompt_tokens / 1000) * PRICING.inputPer1k +
          (completion.usage.completion_tokens / 1000) * PRICING.outputPer1k

        cumulativeCostUsd += iterationCost

        logJson('info', 'agent.iteration', {
          iteration: iterations,
          model: openaiModel,
          inputPer1k: PRICING.inputPer1k,
          outputPer1k: PRICING.outputPer1k,
          iterationCostUsd: round(iterationCost),
          cumulativeCostUsd: round(cumulativeCostUsd),
          inputTokens: cumulativeTokens.input,
          outputTokens: cumulativeTokens.output,
          conversationId,
        })
      }

      const choice = completion.choices[0]
      const msg = choice.message

      // Add assistant message to conversation
      messages.push(msg)

      // If no tool calls, we're done (fallback: use the text reply as-is)
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        reply = msg.content ?? ''
        break
      }

      // Execute each tool call and add results back
      for (const toolCall of msg.tool_calls) {
        if (toolCall.type !== 'function' || !toolCall.function) {
          logJson('warn', 'agent.malformed_tool_call', {
            detail: 'tool call missing function definition',
            conversationId,
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id ?? 'unknown',
            content: JSON.stringify({ error: 'Malformed tool call: missing function definition.' }),
          })
          continue
        }

        const toolName = toolCall.function.name

        // Special structured tool: the model returns its final reply + plan here.
        if (toolName === 'return_plan') {
          let toolArgs: Record<string, any>
          try {
            toolArgs = JSON.parse(toolCall.function.arguments)
          } catch (err: any) {
            logJson('warn', 'agent.invalid_tool_args', { tool: toolName, error: err.message, conversationId })
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: `Invalid JSON arguments for return_plan: ${err.message}. Call return_plan again with valid JSON.`,
              }),
            })
            continue
          }

          let result: unknown
          try {
            result = await executeTool('return_plan', toolArgs)
          } catch (err: any) {
            logJson('error', 'agent.tool_failed', { tool: toolName, error: err.message, conversationId })
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `return_plan failed: ${err.message}` }),
            })
            continue
          }

          if (isReturnPlanResult(result)) {
            const planData = {
              ...(result.plan as Record<string, any>),
              warnings: Array.isArray((result.plan as any)?.warnings)
                ? (result.plan as any).warnings
                : result.warnings,
            }
            reply = result.reply
            plan = attachExecutionProxyTx(planData as ExecutionPlan, chainId)
            finalized = true
            break
          }
          continue
        }

        let toolArgs: Record<string, any>
        try {
          toolArgs = JSON.parse(toolCall.function.arguments)
        } catch (err: any) {
          logJson('warn', 'agent.invalid_tool_args', { tool: toolName, error: err.message, conversationId })
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: `Invalid JSON arguments for ${toolName}: ${err.message}. Please call the tool again with valid JSON arguments.`,
            }),
          })
          continue
        }

        let toolResult: string
        try {
          const result = await executeTool(toolName, {
            ...toolArgs,
            address,
            chainId,
            auth,
          })
          toolResult = JSON.stringify(result)

          if (toolName === 'schedule_order' && result && typeof result === 'object' && 'orderCreation' in result) {
            const oc = (result as any).orderCreation
            if (oc?.unsignedTx) {
              orderCreation = {
                unsignedTx: {
                  to: oc.unsignedTx.to,
                  data: oc.unsignedTx.data,
                  value: oc.unsignedTx.value,
                  gasLimit: oc.unsignedTx.gasLimit,
                },
                order: oc.order,
              }
            }
          }
        } catch (err: any) {
          logJson('error', 'agent.tool_failed', { tool: toolName, error: err.message, conversationId })
          toolResult = JSON.stringify({ error: err.message })
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        })
      }

      if (finalized) break
    }

    // Persist the assistant's final reply so the next request has context.
    if (reply) memory.addMessage(conversationId, 'assistant', reply)

    logJson('info', 'agent.completed', {
      conversationId,
      model: openaiModel,
      iterations,
      usedReturnPlan: finalized,
      hasPlan: Boolean(plan),
      cumulativeCostUsd: round(cumulativeCostUsd),
      memorySize: memory.size(),
    })

    return res.json({ reply, plan, orderCreation, orchestration, usage: { iterations, cumulativeCostUsd, cumulativeTokens } })
  } catch (err: any) {
    logJson('error', 'agent.error', {
      conversationId,
      model: openaiModel,
      error: err?.message ?? String(err),
      status: err?.status,
    })
    return res.status(500).json({ error: 'Agent error', detail: err?.message ?? String(err) })
  }
}

function attachExecutionProxyTx(plan: ExecutionPlan, chainId: number): ExecutionPlan {
  const warnings = [...(plan.warnings ?? [])]
  const executionProxyAddress = process.env.EXECUTION_PROXY_ADDRESS

  if (!executionProxyAddress || !isAddress(executionProxyAddress)) {
    return {
      ...plan,
      warnings: [...warnings, 'Execution proxy address is not configured, so this plan cannot be executed yet.'],
    }
  }

  const quote = plan.quote
  const amountIn = quote?.amountIn
  const amountOut = quote?.amountOut
  const aggregatorTarget = quote?.to
  const aggregatorCalldata = quote?.calldata
  const tokenIn = normalizeTokenAddress(quote?.tokenIn || plan.intent?.tokenIn)
  const tokenOut = normalizeTokenAddress(quote?.tokenOut || plan.intent?.tokenOut)

  if (!amountIn || !amountOut || !aggregatorTarget || !aggregatorCalldata || !tokenIn || !tokenOut) {
    return {
      ...plan,
      warnings: [
        ...warnings,
        'Execution proxy transaction could not be built because the quote is missing token addresses, calldata, router, or raw amounts.',
      ],
    }
  }

  if (!isAddress(aggregatorTarget)) {
    return {
      ...plan,
      warnings: [...warnings, 'Execution proxy transaction could not be built because the quote router is invalid.'],
    }
  }

  const amountInWei = BigInt(amountIn)
  const minAmountOut = applySlippage(BigInt(amountOut), DEFAULT_SLIPPAGE_BPS)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS)
  const isNativeInput = tokenIn === zeroAddress

  const data = encodeFunctionData({
    abi: executionProxyAbi,
    functionName: 'executeSwap',
    args: [
      tokenIn,
      tokenOut,
      amountInWei,
      minAmountOut,
      deadline,
      aggregatorTarget,
      aggregatorCalldata as `0x${string}`,
    ],
  })

  return {
    ...plan,
    warnings,
    unsignedTx: {
      to: executionProxyAddress,
      data,
      value: isNativeInput ? amountIn : '0',
      gasLimit: quote.gasEstimate || '500000',
      maxFeePerGas: gweiToWei(plan.gasAssessment?.suggestedMaxFeeGwei),
      maxPriorityFeePerGas: gweiToWei(plan.gasAssessment?.suggestedPriorityFeeGwei),
      chainId,
      amountIn,
      approvalTarget: executionProxyAddress,
      aggregatorTarget,
      tokenIn,
      tokenOut,
    },
  }
}

function normalizeTokenAddress(value?: string): `0x${string}` | null {
  if (!value) return null
  const normalized = value.trim()
  if (['eth', 'mon', 'native', '0x'].includes(normalized.toLowerCase())) return zeroAddress
  return isAddress(normalized) ? normalized as `0x${string}` : null
}

function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  return amountOut * BigInt(10_000 - slippageBps) / 10_000n
}

function gweiToWei(value?: number): string {
  if (!Number.isFinite(value)) return '0'
  return BigInt(Math.floor((value ?? 0) * 1e9)).toString()
}
