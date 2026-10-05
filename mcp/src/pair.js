#!/usr/bin/env node
/* Pairs this MCP server with a running openGym api, the way the phone app pairs.
 *
 *   npm run pair -- <server-url> <code>
 *
 * The code comes from a signed-in browser: Settings → "Pair the mobile app" (valid 5 minutes,
 * single use). The token it is exchanged for is kept in the auth file beside this package
 * (mode 600, gitignored) and renews itself while the server is used.
 */
import { redeem, saveAuth, AUTH_FILE } from './remote.js'

const [url, code] = process.argv.slice(2)
if (!url || !code) {
  console.error('usage: npm run pair -- <server-url> <code>\n' +
    '  <server-url>  where your openGym runs, e.g. http://localhost:8080\n' +
    '  <code>        from openGym in a browser: Settings → "Pair the mobile app"')
  process.exit(2)
}
if (!/^https?:\/\//i.test(url)) {
  console.error(`"${url}" is not a URL — it should start with http:// or https://`)
  process.exit(2)
}

try {
  const auth = await redeem(url, code)
  saveAuth(auth)
  console.log(`Paired with ${auth.url} as ${auth.user?.name || 'your profile'}.`)
  console.log(`Token saved to ${AUTH_FILE}`)
  console.log('Restart your MCP client (Claude Desktop, Claude Code, Cursor…) to pick it up.')
} catch (e) {
  console.error(`Pairing failed: ${e.message}`)
  process.exit(1)
}
