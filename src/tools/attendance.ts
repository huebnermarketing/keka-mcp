/**
 * Attendance tools: fetch attendance records.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getKekaClient, handleApiError } from "../services/kekaClient.js";
import { CHARACTER_LIMIT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { ResponseFormat, KekaAttendanceRecord, KekaPaginatedResponse } from "../types.js";

// ---------------------------------------------------------------------------
// Attendance formatting helpers
// ---------------------------------------------------------------------------

/** Convert a decimal hour value (e.g. 10.4) into "10h 24m". */
function decimalHoursToHM(decimal: number): string {
  const totalMinutes = Math.round(decimal * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Format a UTC ISO 8601 timestamp to IST (UTC+5:30) time string, e.g. "11:13 AM". */
function utcToIST(utcTimestamp: string): string {
  const date = new Date(utcTimestamp);
  // Shift UTC ms by +5h30m
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  const hours24 = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  const mm = String(minutes).padStart(2, "0");
  return `${hours12}:${mm} ${ampm}`;
}

/** Format a UTC ISO 8601 date string to "DD MMM", e.g. "23 Mar". */
function utcToDateLabel(utcTimestamp: string): string {
  const date = new Date(utcTimestamp);
  const day = date.getUTCDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${monthNames[date.getUTCMonth()]}`;
}

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
          `| Employee | Date | Clock In | Clock Out | Hours | OT | Location |`,
          `|---|---|---|---|---|---|---|`,
          ...res.data.map((a) => {
            const employee = a.employeeNumber ?? "—";
            const date = a.attendanceDate ? utcToDateLabel(a.attendanceDate) : "—";
            const clockIn = a.firstInOfTheDay?.timestamp
              ? utcToIST(a.firstInOfTheDay.timestamp)
              : "—";
            const clockOut = a.lastOutOfTheDay?.timestamp
              ? utcToIST(a.lastOutOfTheDay.timestamp)
              : (a.firstInOfTheDay?.timestamp ? "Still In" : "—");
            const hours = a.totalGrossHours != null && a.totalGrossHours > 0
              ? decimalHoursToHM(a.totalGrossHours)
              : "—";
            const ot = a.totalEffectiveOvertimeDuration != null && a.totalEffectiveOvertimeDuration > 0
              ? decimalHoursToHM(a.totalEffectiveOvertimeDuration)
              : "—";
            const location = (a.firstInOfTheDay?.premiseName ?? "").trim() || "—";
            return `| ${employee} | ${date} | ${clockIn} | ${clockOut} | ${hours} | ${ot} | ${location} |`;
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
