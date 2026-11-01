// Create/update the ElevenLabs agents and tools: npm --prefix api run sync-agents
import { syncAgents } from '../voice/syncAgents.ts'

const ids = await syncAgents()
console.table([...ids].map(([assistant, agentId]) => ({ assistant, agentId })))
