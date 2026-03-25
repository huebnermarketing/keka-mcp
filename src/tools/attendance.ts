/**
 * Attendance tools: fetch attendance records.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getKekaClient, handleApiError } from "../services/kekaClient.js";
import { CHARACTER_LIMIT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { ResponseFormat, KekaAttendanceRecord, KekaPaginatedResponse } from "../types.js";

const ResponseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' for human-readable, 'json' for machine-readable");

function truncate(text: string): string {
  if (text.length > CHARACTER_LIMIT) {
    return text.slice(0, CHARACTER_LIMIT) + "\n\n[Response truncated. Narrow your date range or reduce pageSize.]";
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

export function registerAttendanceTools(server: McpServer): void {
  server.registerTool(
    "keka_get_attendance",
    {
      title: "Get Keka Attendance Records",
      description: `Retrieve attendance records for employees from Keka.

The Keka API supports a maximum date range of 90 days per request and defaults to the last 30 days.

Args:
  - employeeIds (string, optional): Comma-separated employee IDs to filter records
  - from (string, optional): Start date in ISO 8601 format (e.g., '2025-03-01'). Max 90-day range.
  - to (string, optional): End date in ISO 8601 format (e.g., '2025-03-31'). Max 90-day range.
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Attendance records per employee per day — clock-in, clock-out, total hours, shift, and status (Present, Absent, Half-Day, etc.).

Examples:
  - View attendance for a team this month → from='2025-03-01', to='2025-03-31', employeeIds='id1,id2'
  - Check if an employee was present → employeeIds='emp123', from='2025-03-10', to='2025-03-10'`,

      inputSchema: z
        .object({
          employeeIds: z
            .string()
            .optional()
            .describe("Comma-separated Keka employee IDs"),
          from: z
            .string()
            .optional()
            .describe("Start date ISO 8601 (e.g., '2025-03-01'). Max range: 90 days."),
          to: z
            .string()
            .optional()
            .describe("End date ISO 8601 (e.g., '2025-03-31'). Max range: 90 days."),
          pageNumber: z.number().int().min(1).default(1).describe("Page number (starts at 1)"),
          pageSize: z
            .number()
            .int()
            .min(1)
            .max(MAX_PAGE_SIZE)
            .default(DEFAULT_PAGE_SIZE)
            .describe(`Results per page (max ${MAX_PAGE_SIZE})`),
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

        const res = await client.getPaginated<KekaAttendanceRecord>(
          "/time/attendance",
          queryParams
        );

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (!res.data.length) {
          return {
            content: [{ type: "text", text: "No attendance records found for the given filters." }],
          };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
        }

        const lines = [
          `# Attendance Records`,
          "",
          `| Employee | Date | Clock In | Clock Out | Hours | Status | Shift |`,
          `|---|---|---|---|---|---|---|`,
          ...res.data.map((a) => {
            const special = a.isHoliday ? "🏖 Holiday" : a.isWeekOff ? "📅 Week Off" : (a.status ?? "—");
            return (
              `| ${a.employeeName ?? a.employeeId} | ${a.date} | ${a.clockIn ?? "—"} | ` +
              `${a.clockOut ?? "—"} | ${a.totalHours != null ? `${a.totalHours}h` : "—"} | ${special} | ${a.shift ?? "—"} |`
            );
          }),
        ];
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
