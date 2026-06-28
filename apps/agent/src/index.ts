import './env'
import express from 'express'
import cors from 'cors'
import { chatHandler } from './agent/executor'
import { SUB_AGENT_CATALOG } from './agent/orchestrator'
import { getAllowedOrigins } from './lib/cors'

const app = express()
app.use(cors({ origin: getAllowedOrigins() }))
app.use(express.json())

app.post('/chat', chatHandler)
app.get('/subagents', (_, res) => res.json({ subagents: SUB_AGENT_CATALOG }))
app.get('/health', (_, res) => res.json({ ok: true }))

const port = parseInt(process.env.PORT || process.env.AGENT_PORT || '3002')
const server = app.listen(port, () => console.log(`Agent service running on port ${port}`))

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
