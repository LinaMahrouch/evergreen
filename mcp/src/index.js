#!/usr/bin/env node
/* openGym MCP server — stdio transport. The LLM client (Claude Desktop, Cursor, …) spawns
   this process locally, talks JSON-RPC over stdin/stdout, tears it down when the session ends.
   No extra container — your data stays in a folder (or on a server) you control.

   Two modes, picked by what it finds (state.js):
     file mode    reads ./data directly. Read-only, no network.
     remote mode  a paired device of a running openGym api (`npm run pair`). Reads and writes
                  through the api, so an assistant can plan routines too. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { TOOLS } from './tools.js'
import { PLAN_TOOLS } from './plan-tools.js'
import { init, getUser, isRemote, refresh, remoteUrl } from './state.js'

const server = new McpServer({
  name: 'opengym',
  version: '0.2.0'
})

// Fail fast on bad config so a misnamed OPENGYM_DATA doesn't silently answer every call with
// the no-state sentinel. Always register every tool so the LLM sees the full list at
// handshake, even when state didn't resolve.
try {
  if (isRemote()) {
    await refresh()
    console.error(`[opengym-mcp] paired with ${remoteUrl()} — serving profile ${getUser().name} (read + write)`)
  } else {
    init()
    const u = getUser()
    console.error(`[opengym-mcp] serving profile ${u.name} (${u.id}) from the data folder (read-only)`)
  }
} catch (e) {
  console.error(`[opengym-mcp] ${e.message}`)
  // Don't exit — keep the tool listings up so the user sees a useful error after fixing their
  // env and restarting.
}

for (const t of [...TOOLS, ...PLAN_TOOLS]) {
  server.tool(
    t.name,
    t.description,
    t.schema,
    async (params) => {
      try {
        // Remote mode: one cheap revision check so every answer reflects what the phone just
        // logged. A no-op in file mode.
        await refresh()
        const result = await t.handler(params || {})
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        const code = err.code || 'ERROR'
        return {
          isError: true,
          content: [{ type: 'text', text: `${code}: ${err.message}` }]
        }
      }
    }
  )
}

const transport = new StdioServerTransport()
await server.connect(transport)
// Process stays alive serving JSON-RPC over stdio until the LLM client disconnects.
