/**
 * Attendance tools: fetch attendance records.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getKekaClient, handleApiError } from "../services/kekaClient.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { ResponseFormat, KekaAttendanceRecord } from "../types.js";
import {
  PaginationSchema,
  ResponseFormatSchema,
  truncate,
  formatPaginationFooter,
} from "../utils.js";

// ---------------------------------------------------------------------------
// Attendance formatting helpers
// ---------------------------------------------------------------------------

/** Timezone for display — defaults to Asia/Kolkata, override via KEKA_TIMEZONE env var. */
const DISPLAY_TZ = process.env.KEKA_TIMEZONE ?? "Asia/Kolkata";

/** Convert a decimal hour value (e.g. 10.4) into "10h 24m". */
function decimalHoursToHM(decimal: number): string {
  const totalMinutes = Math.round(decimal * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Format a UTC ISO 8601 timestamp to local time string (e.g. "11:13 AM") in DISPLAY_TZ. */
function utcToLocalTime(utcTimestamp: string): string {
  return new Date(utcTimestamp).toLocaleTimeString("en-US", {
    timeZone: DISPLAY_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Format a UTC ISO 8601 date string to "DD MMM" (e.g. "23 Mar") in DISPLAY_TZ. */
function utcToDateLabel(utcTimestamp: string): string {
  return new Date(utcTimestamp).toLocaleDateString("en-US", {
    timeZone: DISPLAY_TZ,
    day: "numeric",
    month: "short",
  });
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
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
            .optional()
            .describe("Start date ISO 8601 (e.g., '2025-03-01'). Max range: 90 days."),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
            .optional()
            .describe("End date ISO 8601 (e.g., '2025-03-31'). Max range: 90 days."),
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
          `| Employee | Date | Clock In | Clock Out | Gross Hours | Effective Hours | Location |`,
          `|---|---|---|---|---|---|---|`,
          ...res.data.map((a) => {
            const employee = a.employeeNumber ?? "—";
            const date = a.attendanceDate ? utcToDateLabel(a.attendanceDate) : "—";
            const clockIn = a.firstInOfTheDay?.timestamp
              ? utcToLocalTime(a.firstInOfTheDay.timestamp)
              : "—";
            const clockOut = a.lastOutOfTheDay?.timestamp
              ? utcToLocalTime(a.lastOutOfTheDay.timestamp)
              : (a.firstInOfTheDay?.timestamp ? "Still In" : "—");
            const grossHours = a.totalGrossHours != null && a.totalGrossHours > 0
              ? decimalHoursToHM(a.totalGrossHours)
              : "—";
            const effectiveHours = a.totalEffectiveHours != null && a.totalEffectiveHours > 0
              ? decimalHoursToHM(a.totalEffectiveHours)
              : "—";
            const location = (a.firstInOfTheDay?.premiseName ?? "").trim() || "—";
            return `| ${employee} | ${date} | ${clockIn} | ${clockOut} | ${grossHours} | ${effectiveHours} | ${location} |`;
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
