import type OpenAI from 'openai'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface StoredMessage {
  role: MessageRole
  content: string
  timestamp: number
}

export type Summarizer = (conversationId: string, messages: StoredMessage[]) => Promise<string>

export interface ConversationMemoryOptions {
  /** Time-to-live for an idle conversation before it is evicted. Default 1 hour. */
  ttlMs?: number
  /** Number of most-recent messages kept verbatim after a summary is produced. Default 20. */
  maxMessages?: number
  /** History length that triggers an automatic summarization. Default 30. */
  summarizeThreshold?: number
  /** Async function used to condense old messages into a short summary. */
  summarizer?: Summarizer
}

/**
 * In-memory conversation store keyed by wallet context (`address:chainId`).
 *
 * Responsibilities:
 *  - persist messages per conversation with a TTL
 *  - return a bounded slice of recent history
 *  - condense older messages via an injected summarizer when history grows long
 *  - evict expired conversations
 */
export class ConversationMemory {
  private readonly conversations = new Map<string, StoredMessage[]>()
  private readonly lastAccessed = new Map<string, number>()
  private readonly summaries = new Map<string, string>()

  private readonly ttlMs: number
  private readonly maxMessages: number
  private readonly summarizeThreshold: number
  private summarizer?: Summarizer

  constructor(options: ConversationMemoryOptions = {}) {
    this.ttlMs = options.ttlMs ?? 60 * 60 * 1000
    this.maxMessages = options.maxMessages ?? 20
    this.summarizeThreshold = options.summarizeThreshold ?? 30
    this.summarizer = options.summarizer
  }

  setSummarizer(summarizer: Summarizer): void {
    this.summarizer = summarizer
  }

  addMessage(conversationId: string, role: MessageRole, content: string): void {
    this.cleanup()
    const list = this.conversations.get(conversationId) ?? []
    list.push({ role, content, timestamp: Date.now() })
    this.conversations.set(conversationId, list)
    this.lastAccessed.set(conversationId, Date.now())
  }

  getHistory(conversationId: string, maxMessages = this.maxMessages): StoredMessage[] {
    const list = this.conversations.get(conversationId)
    if (!list) return []
    return list.slice(-maxMessages)
  }

  getSummary(conversationId: string): string | null {
    return this.summaries.get(conversationId) ?? null
  }

  hasSummary(conversationId: string): boolean {
    return this.summaries.has(conversationId)
  }

  /**
   * Condense the older portion of a conversation into a short summary.
   *
   * When the stored transcript exceeds `summarizeThreshold`, the messages that
   * fall outside the most-recent `maxMessages` window are sent to the injected
   * summarizer. The produced (or merged) summary is retained and the trimmed
   * older messages are dropped to bound memory. Returns the summary string, or
   * `null` when no summarization was performed (e.g. history too short).
   */
  async summarizeHistory(conversationId: string): Promise<string | null> {
    this.cleanup()
    const list = this.conversations.get(conversationId)
    if (!list) return null
    if (!this.summarizer) return this.summaries.get(conversationId) ?? null
    if (list.length <= this.summarizeThreshold) return this.summaries.get(conversationId) ?? null

    const recent = list.slice(-this.maxMessages)
    const old = list.slice(0, list.length - this.maxMessages)

    let summary: string
    try {
      summary = await this.summarizer(conversationId, old)
    } catch (err) {
      // Summarization is best-effort; do not break the request on failure.
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'memory.summarize.failed',
          conversationId,
          error: err instanceof Error ? err.message : String(err),
        })
      )
      return this.summaries.get(conversationId) ?? null
    }

    const prior = this.summaries.get(conversationId)
    const combined = prior ? `${prior}\n${summary}` : summary
    this.summaries.set(conversationId, combined)

    // Drop the summarized older messages and keep only the recent window.
    this.conversations.set(conversationId, recent)
    return combined
  }

  /** Remove conversations that have not been accessed within the TTL. */
  cleanup(): number {
    const now = Date.now()
    let removed = 0
    for (const [id, last] of this.lastAccessed) {
      if (now - last > this.ttlMs) {
        this.conversations.delete(id)
        this.lastAccessed.delete(id)
        this.summaries.delete(id)
        removed++
      }
    }
    return removed
  }

  size(): number {
    return this.conversations.size
  }
}

/**
 * Default singleton used across the agent service. The summarizer is wired up
 * by the executor (which owns the OpenAI client) at module load via
 * `setSummarizer`.
 */
export const conversationMemory = new ConversationMemory()
