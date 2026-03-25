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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { getKekaClient } from "./services/kekaClient.js";
import { registerHrisTools } from "./tools/hris.js";
import { registerLeaveTools } from "./tools/leave.js";
import { registerAttendanceTools } from "./tools/attendance.js";
import { registerPayrollTools } from "./tools/payroll.js";
import { registerExpenseTools } from "./tools/expense.js";
import { registerHireTools } from "./tools/hire.js";
import { registerPsaTools } from "./tools/psa.js";

// ---------------------------------------------------------------------------
// Server creation
// ---------------------------------------------------------------------------

function createServer(): McpServer {
  const server = new McpServer({
    name: "keka-mcp-server",
    version: "1.0.0",
  });

  // Register all tool groups
  registerHrisTools(server);
  registerLeaveTools(server);
  registerAttendanceTools(server);
  registerPayrollTools(server);
  registerExpenseTools(server);
  registerHireTools(server);
  registerPsaTools(server);

  return server;
}

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

  const server = createServer();
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "keka-mcp-server" });
  });

  // MCP endpoint — stateless per-request transport
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
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
