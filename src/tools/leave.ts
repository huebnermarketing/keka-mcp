/**
 * Leave management tools: leave requests, leave types, leave balances.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getKekaClient, handleApiError } from "../services/kekaClient.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import {
  ResponseFormat,
  KekaLeaveRequest,
  KekaLeaveType,
  KekaLeaveBalance,
} from "../types.js";
import {
  PaginationSchema,
  ResponseFormatSchema,
  truncate,
  formatPaginationFooter,
} from "../utils.js";

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerLeaveTools(server: McpServer): void {
  // ─── List Leave Types ─────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_leave_types",
    {
      title: "List Keka Leave Types",
      description: `Retrieve all leave types configured in Keka (e.g., Annual Leave, Sick Leave, Casual Leave).

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: List of leave types with ID, name, code, and whether they are paid leave.
Use the returned IDs when creating leave requests with keka_create_leave_request.`,

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
        const res = await client.getPaginated<KekaLeaveType>("/time/leavetypes", {
          pageNumber: params.pageNumber,
          pageSize: params.pageSize,
        });

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
        }

        const lines = [
          `# Keka Leave Types`,
          "",
          `| Name | Identifier | Paid? |`,
          `|---|---|---|`,
          ...res.data.map(
            (lt) =>
              `| ${lt.name} | \`${lt.identifier}\` | ${lt.isPaid ? "Yes" : "No"} |`
          ),
        ];
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ─── List Leave Requests ──────────────────────────────────────────────────

  server.registerTool(
    "keka_list_leave_requests",
    {
      title: "List Keka Leave Requests",
      description: `Retrieve leave requests from Keka with optional filters for employees and date range.

Args:
  - employeeIds (string, optional): Comma-separated employee IDs to filter by
  - from (string, optional): Start date in ISO 8601 format (e.g., '2025-01-01')
  - to (string, optional): End date in ISO 8601 format (e.g., '2025-01-31')
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: List of leave requests with employee, leave type, dates, number of days, status, and reason.

Examples:
  - View pending leaves for a team → pass employeeIds and a date range
  - See who is on leave this month → from='2025-03-01', to='2025-03-31'`,

      inputSchema: z
        .object({
          employeeIds: z
            .string()
            .optional()
            .describe("Comma-separated Keka employee IDs"),
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
            .optional()
            .describe("Start date (ISO 8601, e.g. '2025-01-01')"),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
            .optional()
            .describe("End date (ISO 8601, e.g. '2025-01-31')"),
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
        if (params.from) queryParams.from = params.from;
        if (params.to) queryParams.to = params.to;

        const res = await client.getPaginated<KekaLeaveRequest>(
          "/time/leaverequests",
          queryParams
        );

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (!res.data.length) {
          return { content: [{ type: "text", text: "No leave requests found for the given filters." }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
        }

        const lines = [`# Leave Requests`, ""];
        for (const lr of res.data) {
          const leaveTypeName = lr.selection?.[0]?.leaveTypeName ?? "—";
          const days = lr.selection?.[0]?.count ?? "?";
          lines.push(
            `- **Emp #${lr.employeeNumber ?? lr.employeeIdentifier}** | ` +
            `${lr.fromDate?.slice(0, 10)} → ${lr.toDate?.slice(0, 10)} | ` +
            `${leaveTypeName} (${days}d) | ` +
            `Status: **${lr.status ?? "—"}**` +
            (lr.note ? ` | _"${lr.note}"_` : "")
          );
        }
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ─── Create Leave Request ─────────────────────────────────────────────────

  server.registerTool(
    "keka_create_leave_request",
    {
      title: "Create Keka Leave Request",
      description: `Submit a new leave request for an employee in Keka.

Args:
  - employeeId (string, required): Keka employee ID for whom leave is being requested
  - leaveTypeId (string, required): Leave type ID (use keka_list_leave_types to find IDs)
  - fromDate (string, required): Start date in ISO 8601 format (e.g., '2025-04-01')
  - toDate (string, required): End date in ISO 8601 format (e.g., '2025-04-03')
  - fromSession (number, optional): Start session — 0 = first half, 1 = second half (default: 0)
  - toSession (number, optional): End session — 0 = first half, 1 = second half (default: 1)
  - reason (string, optional): Reason for leave
  - note (string, optional): Additional note for the request
  - requestedBy (string, optional): Employee ID of the person submitting on behalf (defaults to employee)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Confirmation of leave request creation with the generated request ID.

Note: Requires the API key to have leave management write permissions.`,

      inputSchema: z
        .object({
          employeeId: z.string().min(1).describe("Keka employee ID"),
          leaveTypeId: z
            .string()
            .min(1)
            .describe("Leave type ID (from keka_list_leave_types)"),
          fromDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
            .describe("Leave start date (e.g., '2025-04-01')"),
          toDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
            .describe("Leave end date (e.g., '2025-04-03')"),
          fromSession: z
            .number()
            .int()
            .min(0)
            .max(1)
            .default(0)
            .describe("Start session: 0 = first half, 1 = second half"),
          toSession: z
            .number()
            .int()
            .min(0)
            .max(1)
            .default(1)
            .describe("End session: 0 = first half, 1 = second half"),
          reason: z.string().max(500).optional().describe("Reason for leave"),
          note: z.string().max(500).optional().describe("Additional note for the request"),
          requestedBy: z
            .string()
            .optional()
            .describe("Employee ID submitting on behalf (optional, defaults to employee)"),
          response_format: ResponseFormatSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const client = getKekaClient();
        const body: Record<string, unknown> = {
          employeeId: params.employeeId,
          leaveTypeId: params.leaveTypeId,
          fromDate: params.fromDate,
          toDate: params.toDate,
          fromSession: params.fromSession,
          toSession: params.toSession,
        };
        if (params.reason) body.reason = params.reason;
        if (params.note) body.note = params.note;
        if (params.requestedBy) body.requestedBy = params.requestedBy;

        const res = await client.post<{ succeeded: boolean; message: string; data: { id: string } }>(
          "/time/leaverequests",
          body
        );

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Leave request created successfully.\n\n` +
                `- **Request ID:** ${res.data?.id ?? "—"}\n` +
                `- **Employee:** ${params.employeeId}\n` +
                `- **Dates:** ${params.fromDate} → ${params.toDate}` +
                (params.reason ? `\n- **Reason:** ${params.reason}` : "") +
                (params.note ? `\n- **Note:** ${params.note}` : ""),
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ─── Get Leave Balances ───────────────────────────────────────────────────

  server.registerTool(
    "keka_get_leave_balances",
    {
      title: "Get Keka Leave Balances",
      description: `Retrieve leave balances for employees in Keka.

Args:
  - employeeIds (string, optional): Comma-separated employee IDs (omit for all employees)
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Leave balance breakdown per employee and leave type — opening, earned, taken, pending, and closing balances.`,

      inputSchema: z
        .object({
          employeeIds: z
            .string()
            .optional()
            .describe("Comma-separated employee IDs (optional)"),
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

        const res = await client.getPaginated<KekaLeaveBalance>(
          "/time/leavebalance",
          queryParams
        );

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
        }

        const lines = [
          `# Leave Balances`,
          "",
          `| Employee | Leave Type | Opening | Earned | Taken | Pending | Closing |`,
          `|---|---|---|---|---|---|---|`,
          ...res.data.map(
            (lb) =>
              `| ${lb.employeeName ?? lb.employeeId} | ${lb.leaveTypeName ?? lb.leaveTypeId} | ${lb.openingBalance} | ${lb.earned} | ${lb.taken} | ${lb.pending} | ${lb.closing} |`
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
