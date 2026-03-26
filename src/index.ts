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
 *   KEKA_EMPLOYEE_ID    Your own Keka employee ID — used as requestedBy when applying leave on behalf of others
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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { getKekaClient } from "./services/kekaClient.js";
import { registerHrisTools } from "./tools/hris.js";
import { registerLeaveTools } from "./tools/leave.js";
import { registerAttendanceTools } from "./tools/attendance.js";
import { registerPayrollTools } from "./tools/payroll.js";
import { registerHireTools } from "./tools/hire.js";
import { registerPsaTools } from "./tools/psa.js";
import { registerPrompts } from "./prompts.js";

// ---------------------------------------------------------------------------
// Server creation
// ---------------------------------------------------------------------------

function createServer(): McpServer {
  const server = new McpServer(
    { name: "keka-mcp-server", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // Register all tool groups
  registerHrisTools(server);
  registerLeaveTools(server);
  registerAttendanceTools(server);
  registerPayrollTools(server);
  registerHireTools(server);
  registerPsaTools(server);

  // Register workflow prompts (apply leave, check balance, etc.)
  registerPrompts(server);

  return server;
}

// ---------------------------------------------------------------------------
// Server instructions — sent to Claude Desktop during MCP handshake.
// This is the "skill" that teaches Claude how to use Keka tools correctly.
// ---------------------------------------------------------------------------

const SERVER_INSTRUCTIONS = `
You are connected to the Keka HRM system. Follow these rules for ALL Keka operations:

## General Rules
- When a user mentions an employee by name, ALWAYS resolve to their UUID first via keka_list_employees (searchKey).
- Never ask the user for UUIDs — look them up silently.
- Do multi-step workflows silently. Only show the final result.
- If an operation fails, read the error message carefully — it contains the specific Keka reason. Fix and retry before showing errors.

## Leave Requests — Critical Rules
1. ALWAYS include the "note" field. Keka requires it for Paid Leave and other types. Use the reason if no separate note is given.
2. Leave type IDs use the field "identifier" (not "id"). Get them from keka_list_leave_types.
3. Session values for day coverage:
   - Full day: fromSession=0, toSession=1
   - First half only: fromSession=0, toSession=0
   - Second half only: fromSession=1, toSession=1
4. "requestedBy" is auto-set by the server — do NOT pass it.
5. Before applying leave, check the employee's balance with keka_get_leave_balances. If the chosen type has 0 balance, suggest an alternative.
6. Default leave type: Paid Leave. If user says "sick" use Sick Leave, "casual" use Casual Leave.

## Leave Balance
- Response is nested: each employee has a leaveBalance[] array with leaveTypeName, availableBalance, annualQuota, accruedAmount, consumedAmount.
- annualQuota of -1 means unlimited.

## Leave Requests List
- Leave type info is in the selection[] array: selection[0].leaveTypeName, selection[0].count.
- Status codes: 0=Pending, 1=Approved, 2=Rejected, 3=Cancelled.

## Attendance
- Max date range: 90 days per request.
- dayType: 0=WorkDay, 1=Holiday, 2=WeeklyOff.
- Times are UTC, displayed in IST.

## Pay Groups
- ID field is "identifier" (not "id").

## Error Messages
- Keka errors are in the errors[] array, not the message field. The server already extracts them.
- Common errors: "Note is required for paid leave", "Not enough leave balance", "Leave already exists for this period".
`.trim();


// ---------------------------------------------------------------------------
// Validate environment & warm up auth before accepting requests
// ---------------------------------------------------------------------------

function validateEnvironment(): void {
  const required = [
    "KEKA_BASE_URL",
    "KEKA_CLIENT_ID",
    "KEKA_CLIENT_SECRET",
    "KEKA_API_KEY",
  ];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length) {
    console.error(
      `[keka-mcp-server] ERROR: Missing required environment variables:\n` +
        missing.map((v) => `  - ${v}`).join("\n") +
        `\n\nSet them before starting the server. See README.md for details.`
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Transport: stdio
// ---------------------------------------------------------------------------

async function runStdio(): Promise<void> {
  validateEnvironment();

  // Eagerly initialise client to surface auth errors early
  getKekaClient();

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[keka-mcp-server] Running via stdio transport.");
}

// ---------------------------------------------------------------------------
// Transport: streamable HTTP
// ---------------------------------------------------------------------------

async function runHttp(): Promise<void> {
  validateEnvironment();
  getKekaClient();

  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "keka-mcp-server" });
  });

  // MCP endpoint — stateless, new server+transport per request
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    const requestServer = createServer();
    await requestServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.error(`[keka-mcp-server] Running via HTTP on http://localhost:${port}/mcp`);
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const transportMode = process.env.TRANSPORT ?? "stdio";

if (transportMode === "http") {
  runHttp().catch((err: unknown) => {
    console.error("[keka-mcp-server] Fatal error:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err: unknown) => {
    console.error("[keka-mcp-server] Fatal error:", err);
    process.exit(1);
  });
}
