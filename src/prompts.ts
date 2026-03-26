/**
 * MCP Prompts — reusable workflow templates that Claude Desktop can discover and use.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  // ─── Apply Leave ───────────────────────────────────────────────────────────

  server.registerPrompt(
    "apply_leave",
    {
      title: "Apply Leave for an Employee",
      description:
        "Walks through the full leave application workflow: resolve employee, pick leave type, check balance, and submit.",
      argsSchema: {
        employee_name: z.string().describe("Employee name or partial name (e.g. 'Kishan', 'Purvi')"),
        date: z.string().describe("Leave date or range (e.g. 'this Friday', '27 March', 'next Monday to Wednesday')"),
        reason: z.string().optional().describe("Reason for leave (e.g. 'personal', 'sick', 'visiting Rajkot')"),
        leave_type: z.string().optional().describe("Leave type name (e.g. 'Paid Leave', 'Sick Leave'). Defaults to Paid Leave."),
        session: z.enum(["full", "first_half", "second_half"]).optional().describe("Full day, first half, or second half. Defaults to full day."),
      },
    },
    async (params) => {
      const session = params.session ?? "full";
      const sessionGuide =
        session === "first_half"
          ? "fromSession: 0, toSession: 0"
          : session === "second_half"
            ? "fromSession: 1, toSession: 1"
            : "fromSession: 0, toSession: 1";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Apply leave for employee "${params.employee_name}" on ${params.date}.`,
                "",
                "Follow these steps in order:",
                "",
                `1. **Resolve employee**: Call \`keka_list_employees\` with searchKey="${params.employee_name}". Extract the \`id\` field (UUID).`,
                "",
                `2. **Get leave type**: Call \`keka_list_leave_types\`. Find "${params.leave_type || "Paid Leave"}" and use its \`identifier\` field (NOT \`id\`).`,
                "",
                `3. **Check balance**: Call \`keka_get_leave_balances\` with the employee ID. Verify availableBalance > 0 for the chosen leave type. If 0, try Casual Leave instead.`,
                "",
                `4. **Submit**: Call \`keka_create_leave_request\` with:`,
                `   - employeeId: the UUID from step 1`,
                `   - leaveTypeId: the identifier from step 2`,
                `   - fromDate/toDate: resolved date(s) in YYYY-MM-DD format`,
                `   - ${sessionGuide}`,
                `   - reason: "${params.reason || "Personal"}"`,
                `   - note: "${params.reason || "Personal"}" (REQUIRED — always include, same as reason if not specified)`,
                "",
                "Do all steps silently. Only show the final result to the user.",
                "If any step fails, read the error message carefully — it contains the specific Keka reason.",
              ].join("\n"),
            },
          },
        ],
      };
    }
  );

  // ─── Check Leave Balance ─────────────────────────────────────────────────

  server.registerPrompt(
    "check_leave_balance",
    {
      title: "Check Leave Balance",
      description:
        "Check leave balance for one or more employees.",
      argsSchema: {
        employee_name: z.string().describe("Employee name or 'all' for everyone"),
      },
    },
    async (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Check leave balance for "${params.employee_name}".`,
              "",
              "Steps:",
              `1. If not "all": Call \`keka_list_employees\` with searchKey="${params.employee_name}" to get their ID.`,
              "2. Call `keka_get_leave_balances` with the employee ID (or omit employeeIds for all).",
              "3. Present a clean table: Employee | Leave Type | Available | Annual Quota",
              "4. The response has a nested `leaveBalance[]` array per employee.",
              "5. Skip leave types with 0 quota and 0 balance to keep it clean.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // ─── Who is on Leave ─────────────────────────────────────────────────────

  server.registerPrompt(
    "who_is_on_leave",
    {
      title: "Who is on Leave",
      description:
        "Check who is on leave for a given date range.",
      argsSchema: {
        period: z.string().describe("Date or range (e.g. 'today', 'this week', 'March')"),
      },
    },
    async (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Show who is on leave during: ${params.period}`,
              "",
              "Steps:",
              "1. Resolve the date range to from/to in YYYY-MM-DD format.",
              "2. Call `keka_list_leave_requests` with the from and to dates.",
              "3. Leave type info is in `selection[0].leaveTypeName` and `selection[0].count`.",
              "4. Status codes: 0=Pending, 1=Approved, 2=Rejected, 3=Cancelled.",
              "5. Present: Employee Number | Dates | Leave Type | Days | Status",
              "6. If no results, say 'No one is on leave during this period.'",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // ─── Attendance Check ────────────────────────────────────────────────────

  server.registerPrompt(
    "check_attendance",
    {
      title: "Check Attendance",
      description:
        "Check attendance records for employees.",
      argsSchema: {
        employee_name: z.string().describe("Employee name or 'all'"),
        period: z.string().describe("Date or range (e.g. 'today', 'this week')"),
      },
    },
    async (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Check attendance for "${params.employee_name}" during: ${params.period}`,
              "",
              "Steps:",
              `1. If not "all": Call \`keka_list_employees\` with searchKey="${params.employee_name}" to get their ID.`,
              "2. Resolve dates to YYYY-MM-DD. Max range: 90 days per request.",
              "3. Call `keka_get_attendance` with employeeIds, from, to.",
              "4. Key fields: firstInOfTheDay (clock in), lastOutOfTheDay (clock out), totalGrossHours, totalEffectiveHours.",
              "5. dayType: 0=WorkDay, 1=Holiday, 2=WeeklyOff. Skip non-workdays unless asked.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // ─── Employee Lookup ─────────────────────────────────────────────────────

  server.registerPrompt(
    "find_employee",
    {
      title: "Find Employee Details",
      description:
        "Look up employee info by name, email, or employee number.",
      argsSchema: {
        query: z.string().describe("Employee name, email, or employee number"),
      },
    },
    async (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Find employee details for: "${params.query}"`,
              "",
              "Steps:",
              `1. Call \`keka_list_employees\` with searchKey="${params.query}".`,
              "2. If exactly one result, call `keka_get_employee` with their `id` for the full profile.",
              "3. If multiple matches, list them briefly and ask user to pick.",
              "4. Show: Name, Employee Number, Email, Department, Job Title, Manager, Join Date.",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
