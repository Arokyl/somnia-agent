import OpenAI from 'openai'
import type { Request, Response } from 'express'
import { encodeFunctionData, isAddress, zeroAddress } from 'viem'
import { SYSTEM_PROMPT } from './prompts/system'
import { tools, executeTool } from './tools'
import { CHAIN_NAMES } from '@somnia-agent/shared'
import type { ExecutionPlan } from '@somnia-agent/shared'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const DEFAULT_SLIPPAGE_BPS = 50
const DEFAULT_DEADLINE_SECONDS = 20 * 60

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
  walletContext: { address: string; chainId: number }
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

  if (/\b(help|what can you do|commands?)\b/.test(text)) {
    return {
      reply:
        'I can teach, translate DeFi terms, compare routes, prepare swap plans, wait for cheaper gas, and help you review a transaction before you sign. I do not submit wallet transactions for you.',
      reaction: 'help',
    }
  }

  if (/\b(price|worth|value)\b/.test(text) && /\b(eth|ethereum)\b/.test(text)) {
    return {
      reply:
        'I can explain how ETH pricing works, but this agent is not wired to a live market feed yet. For a live number, use an exchange, oracle, or market API; then bring the intended trade here and I will help reason through route quality, gas, and risk.',
      reaction: 'market-education',
    }
  }

  return null
}

export async function chatHandler(req: Request, res: Response) {
  const { message, walletContext, history = [] } = req.body as ChatRequest

  const commonReply = getCommonReply(message)
  if (commonReply) {
    return res.json(commonReply)
  }

  if (!message || !walletContext?.address) {
    return res.status(400).json({ error: 'Missing message or walletContext' })
  }

  const { address, chainId } = walletContext
  const chainName = CHAIN_NAMES[chainId as keyof typeof CHAIN_NAMES] ?? `Chain ${chainId}`

  // Build system prompt with current context
  const systemContent = SYSTEM_PROMPT
    .replace('{datetime}',  new Date().toISOString())
    .replace('{address}',   address)
    .replace('{chainId}',   chainId.toString())
    .replace('{chainName}', chainName)

  // Build message history
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ]

  try {
    let reply = ''
    let plan: ExecutionPlan | undefined
    let iterations = 0
    const MAX_ITERATIONS = 6
    const MAX_COST_USD = 0.50 // Stop if cumulative API cost exceeds 50 cents
    const TIMEOUT_MS = 30_000 // 30 second timeout per request
    const START_TIME = Date.now()

    let cumulativeCostUsd = 0
    let cumulativeTokens = { input: 0, output: 0 }

    // Pricing (as of 2024): gpt-4o-mini = $0.00015/1K input, $0.0006/1K output
    const PRICE_INPUT_PER_1K = 0.00015
    const PRICE_OUTPUT_PER_1K = 0.0006

    // Agentic loop: keep calling until the model stops using tools
    while (iterations < MAX_ITERATIONS) {
      // Check timeout
      if (Date.now() - START_TIME > TIMEOUT_MS) {
        console.warn(`Agent timeout after ${iterations} iterations`)
        break
      }

      // Check cost limit
      if (cumulativeCostUsd > MAX_COST_USD) {
        console.warn(`Agent cost limit exceeded: $${cumulativeCostUsd.toFixed(4)} > $${MAX_COST_USD}`)
        reply = 'Cost limit exceeded. Please try a simpler request.'
        break
      }

      iterations++

      const completion = await openai.chat.completions.create({
        model: openaiModel,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0,
        max_tokens:  1500,
      })

      // Track token usage and cost
      if (completion.usage) {
        cumulativeTokens.input += completion.usage.prompt_tokens
        cumulativeTokens.output += completion.usage.completion_tokens

        const iterationCost =
          (completion.usage.prompt_tokens / 1000) * PRICE_INPUT_PER_1K +
          (completion.usage.completion_tokens / 1000) * PRICE_OUTPUT_PER_1K

        cumulativeCostUsd += iterationCost

        console.log(
          `Iteration ${iterations}: +${iterationCost.toFixed(4)}$ (cumulative: ${cumulativeCostUsd.toFixed(4)}$, tokens: ${cumulativeTokens.input}/${cumulativeTokens.output})`
        )
      }

      const choice = completion.choices[0]
      const msg = choice.message

      // Add assistant message to conversation
      messages.push(msg)

      // If no tool calls, we're done
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        reply = msg.content ?? ''

        // Try to extract plan JSON from the reply
        const planMatch = reply.match(/\{[\s\S]*"plan"[\s\S]*\}/)
        if (planMatch) {
          try {
            const parsed = JSON.parse(planMatch[0])
            if (parsed.plan) {
              plan  = attachExecutionProxyTx(parsed.plan, chainId)
              reply = parsed.reply || reply
            }
          } catch {
            // Not valid JSON — just use the text reply
          }
        }
        break
      }

      // Execute each tool call and add results back
      for (const toolCall of msg.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments)

        let toolResult: string
        try {
          const result = await executeTool(toolName, { ...toolArgs, address, chainId })
          toolResult = JSON.stringify(result)
        } catch (err: any) {
          toolResult = JSON.stringify({ error: err.message })
        }

        messages.push({
          role:         'tool',
          tool_call_id: toolCall.id,
          content:      toolResult,
        })
      }
    }

    return res.json({ reply, plan, usage: { iterations, cumulativeCostUsd, cumulativeTokens } })
  } catch (err: any) {
    console.error('Agent error:', err)
    return res.status(500).json({ error: 'Agent error', detail: err.message })
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
  if (['eth', 'stt', 'native', '0x'].includes(normalized.toLowerCase())) return zeroAddress
  return isAddress(normalized) ? normalized : null
}

function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  return amountOut * BigInt(10_000 - slippageBps) / 10_000n
}

function gweiToWei(value?: number): string {
  if (!Number.isFinite(value)) return '0'
  return BigInt(Math.floor((value ?? 0) * 1e9)).toString()
}
