/**
 * PSA (Professional Services Automation) tools: clients and projects.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getKekaClient, handleApiError } from "../services/kekaClient.js";
import { CHARACTER_LIMIT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { ResponseFormat, KekaPsaClient, KekaPsaProject, KekaPaginatedResponse } from "../types.js";

const ResponseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' for human-readable, 'json' for machine-readable");

const PaginationSchema = {
  pageNumber: z.number().int().min(1).default(1).describe("Page number (starts at 1)"),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe(`Results per page (max ${MAX_PAGE_SIZE})`),
};

function truncate(text: string): string {
  if (text.length > CHARACTER_LIMIT) {
    return text.slice(0, CHARACTER_LIMIT) + "\n\n[Response truncated. Use filters or reduce pageSize.]";
  }
  return text;
}

function formatPaginationFooter(res: KekaPaginatedResponse<unknown>): string {
  return (
    `\n---\nPage ${res.pageNumber} of ${res.totalPages} | ` +
    `Showing ${res.data.length} of ${res.totalRecords} records.` +
    (res.nextPage ? ` Pass pageNumber=${res.pageNumber + 1} for next page.` : "")
  );
}

export function registerPsaTools(server: McpServer): void {
  // ─── List PSA Clients ─────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_psa_clients",
    {
      title: "List Keka PSA Clients",
      description: `Retrieve all clients from Keka's Professional Services Automation (PSA) module.

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: PSA client records with ID, name, email, phone, status, and creation date.
Use returned IDs with keka_list_psa_projects to find projects for a client.`,

      inputSchema: z.object({ ...PaginationSchema, response_format: ResponseFormatSchema }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const client = getKekaClient();
        const res = await client.getPaginated<KekaPsaClient>("/psa/clients", {
          pageNumber: params.pageNumber,
          pageSize: params.pageSize,
        });

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (!res.data.length) {
          return { content: [{ type: "text", text: "No PSA clients found." }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
        }

        const lines = [
          `# Keka PSA Clients`,
          "",
          `| Name | ID | Email | Phone | Status | Created |`,
          `|---|---|---|---|---|---|`,
          ...res.data.map(
            (c) =>
              `| ${c.name} | ${c.id} | ${c.email ?? "—"} | ${c.phone ?? "—"} | ` +
              `${c.status ?? "—"} | ${c.createdOn ?? "—"} |`
          ),
        ];
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ─── List PSA Projects ────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_psa_projects",
    {
      title: "List Keka PSA Projects",
      description: `Retrieve projects from Keka's Professional Services Automation (PSA) module.

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: PSA projects with ID, name, client, status, start/end dates, budget, currency, and project manager.`,

      inputSchema: z.object({ ...PaginationSchema, response_format: ResponseFormatSchema }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const client = getKekaClient();
        const res = await client.getPaginated<KekaPsaProject>("/psa/projects", {
          pageNumber: params.pageNumber,
          pageSize: params.pageSize,
        });

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (!res.data.length) {
          return { content: [{ type: "text", text: "No PSA projects found." }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
        }

        const lines = [
          `# Keka PSA Projects`,
          "",
          ...res.data.map((p) =>
            [
              `## ${p.name} (ID: ${p.id})`,
              `- **Client:** ${p.clientName ?? p.clientId ?? "—"}`,
              `- **Status:** ${p.status ?? "—"} | **Manager:** ${p.projectManagerName ?? "—"}`,
              `- **Timeline:** ${p.startDate ?? "—"} → ${p.endDate ?? "—"}`,
              `- **Budget:** ${p.budget != null ? p.budget.toLocaleString() : "—"} ${p.currency ?? ""}`,
              "",
            ].join("\n")
          ),
        ];
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
