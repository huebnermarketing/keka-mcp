/**
 * Payroll tools: salaries, pay groups, pay bands.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getKekaClient, handleApiError } from "../services/kekaClient.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import {
  ResponseFormat,
  KekaSalary,
  KekaPayGroup,
  KekaPayBand,
} from "../types.js";
import {
  PaginationSchema,
  ResponseFormatSchema,
  truncate,
  formatPaginationFooter,
} from "../utils.js";

export function registerPayrollTools(server: McpServer): void {
  // ─── List Pay Groups ──────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_pay_groups",
    {
      title: "List Keka Pay Groups",
      description: `Retrieve all payroll groups configured in Keka.

Pay groups define payroll cycles and are used to filter salary listings.

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: List of pay groups with IDs, names, and descriptions.
Use IDs with keka_list_salaries to filter by pay group.`,

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
        const res = await client.getPaginated<KekaPayGroup>("/payroll/paygroups", {
          pageNumber: params.pageNumber,
          pageSize: params.pageSize,
        });

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        const lines = [
          `# Keka Pay Groups`,
          "",
          `| Name | ID | Description |`,
          `|---|---|---|`,
          ...res.data.map((pg) => `| ${pg.name} | \`${pg.identifier}\` | ${pg.description ?? "—"} |`),
        ];
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ─── List Pay Bands ───────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_pay_bands",
    {
      title: "List Keka Pay Bands",
      description: `Retrieve all salary pay bands configured in Keka.

Pay bands define compensation ranges for job levels or grades.

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Pay bands with ID, name, minimum and maximum salary amounts, and currency.`,

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
        const res = await client.getPaginated<KekaPayBand>("/payroll/payband", {
          pageNumber: params.pageNumber,
          pageSize: params.pageSize,
        });

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        const lines = [
          `# Keka Pay Bands`,
          "",
          `| Name | ID | Min | Max | Currency |`,
          `|---|---|---|---|---|`,
          ...res.data.map(
            (pb) =>
              `| ${pb.name} | ${pb.id} | ${pb.minAmount ?? "—"} | ${pb.maxAmount ?? "—"} | ${pb.currency ?? "—"} |`
          ),
        ];
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ─── List Salaries ────────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_salaries",
    {
      title: "List Keka Employee Salaries",
      description: `Retrieve salary information for employees from Keka payroll.

⚠️ This tool returns sensitive compensation data. Ensure your API key has payroll read access.

Args:
  - employeeIds (string, optional): Comma-separated employee IDs to filter
  - payGroupIds (string, optional): Comma-separated pay group IDs to filter (use keka_list_pay_groups)
  - employmentStatus (string, optional): Filter by 'Active', 'InActive', 'Terminated', 'NotJoined'
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Employee salaries with CTC (Cost to Company), pay group, currency, and effective date.`,

      inputSchema: z
        .object({
          employeeIds: z
            .string()
            .optional()
            .describe("Comma-separated employee IDs"),
          payGroupIds: z
            .string()
            .optional()
            .describe("Comma-separated pay group IDs (from keka_list_pay_groups)"),
          employmentStatus: z
            .enum(["Active", "InActive", "Terminated", "NotJoined"])
            .optional()
            .describe("Filter by employment status"),
          ...PaginationSchema,
          response_format: ResponseFormatSchema,
        })
        .strict(),
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
        const queryParams: Record<string, unknown> = {
          pageNumber: params.pageNumber,
          pageSize: params.pageSize,
        };
        if (params.employeeIds) queryParams.employeeIds = params.employeeIds;
        if (params.payGroupIds) queryParams.paygroupIds = params.payGroupIds;
        if (params.employmentStatus) queryParams.employmentStatus = params.employmentStatus;

        const res = await client.getPaginated<KekaSalary>("/payroll/salaries", queryParams);

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (!res.data.length) {
          return { content: [{ type: "text", text: "No salary records found for the given filters." }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
        }

        const lines = [
          `# Employee Salaries`,
          "",
          `| Employee | Emp# | CTC | Currency | Pay Group | Effective Date |`,
          `|---|---|---|---|---|---|`,
          ...res.data.map(
            (s) =>
              `| ${s.employeeName ?? s.employeeId} | ${s.employeeNumber ?? "—"} | ` +
              `${s.ctc != null ? s.ctc.toLocaleString() : "—"} | ${s.currency ?? "—"} | ` +
              `${s.payGroupName ?? "—"} | ${s.effectiveDate ?? "—"} |`
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
