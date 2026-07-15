import './env.js'
import express from 'express'
import cors from 'cors'
import { chatHandler } from './agent/executor.js'
import { conversationMemory } from './agent/memory.js'
import { SUB_AGENT_CATALOG } from './agent/orchestrator.js'
import { getAllowedOrigins } from './lib/cors.js'

const app = express()
app.use(cors({ origin: getAllowedOrigins() }))
app.use(express.json())

// Inject the conversation-memory singleton so history persists per wallet context.
app.post('/chat', (req, res) => chatHandler(req, res, conversationMemory))
app.get('/subagents', (_, res) => res.json({ subagents: SUB_AGENT_CATALOG }))
app.get('/health', (_, res) => res.json({ ok: true }))

const port = parseInt(process.env.PORT || process.env.AGENT_PORT || '3002')
const server = app.listen(port, () => console.log(`Agent service running on port ${port}`))

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
