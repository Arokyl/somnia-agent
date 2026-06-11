import './env'
import express from 'express'
import cors from 'cors'
import { chatHandler } from './agent/executor'

const app = express()
app.use(cors())
app.use(express.json())

app.post('/chat', chatHandler)
app.get('/health', (_, res) => res.json({ ok: true }))

const port = parseInt(process.env.AGENT_PORT || '3002')
app.listen(port, () => console.log(`Agent service running on port ${port}`))
