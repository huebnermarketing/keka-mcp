#!/usr/bin/env node
/**
 * Keka HRM MCP Server
 *
 * Provides Claude (and other MCP clients) with tools to interact with the
 * Keka HRM API — covering employees, leave, attendance, payroll, expenses,
 * recruitment, and PSA.
 *
 * Required environment variables:
 *   KEKA_BASE_URL       e.g. https://yourcompany.keka.com
 *   KEKA_CLIENT_ID      OAuth2 client ID from Keka admin portal
 *   KEKA_CLIENT_SECRET  OAuth2 client secret
 *   KEKA_API_KEY        Keka API key
 *
 * Optional:
 *   KEKA_SANDBOX=true   Use kekademo.com sandbox auth endpoint
 *   TRANSPORT=http      Use streamable HTTP transport instead of stdio
 *   PORT=3000           HTTP port (default: 3000, only used when TRANSPORT=http)
 *
 * Usage (stdio — default, for Claude Desktop):
 *   node dist/index.js
 *
 * Usage (HTTP — for remote/multi-client):
 *   TRANSPORT=http PORT=3000 node dist/index.js
 */
export {};
//# sourceMappingURL=index.d.ts.map