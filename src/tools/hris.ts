/**
 * HRIS tools: employees, departments, job titles, groups.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getKekaClient, handleApiError } from "../services/kekaClient.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import {
  ResponseFormat,
  KekaEmployee,
  KekaDepartment,
  KekaJobTitle,
  KekaGroup,
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

export function registerHrisTools(server: McpServer): void {
  // ─── List Employees ───────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_employees",
    {
      title: "List Keka Employees",
      description: `Retrieve a paginated list of employees from Keka HRM.

Supports filtering by employment status, employee IDs, probation status, notice period, and a free-text search key.

Args:
  - employmentStatus (string, optional): Filter by status — 'Active', 'InActive', 'Terminated', 'NotJoined'
  - employeeIds (string, optional): Comma-separated employee IDs to fetch specific employees
  - searchKey (string, optional): Free-text search across name, email, employee number
  - inProbation (boolean, optional): Filter employees currently in probation
  - inNoticePeriod (boolean, optional): Filter employees in notice period
  - pageNumber (integer): Page number, starting at 1 (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Paginated list of employees with ID, name, email, department, job title, status, and join date.

Examples:
  - List all active employees → employmentStatus='Active'
  - Find a specific person → searchKey='John Doe'
  - Get employees by IDs → employeeIds='emp1,emp2,emp3'`,

      inputSchema: z
        .object({
          employmentStatus: z
            .enum(["Active", "InActive", "Terminated", "NotJoined"])
            .optional()
            .describe("Filter by employment status"),
          employeeIds: z
            .string()
            .optional()
            .describe("Comma-separated list of employee IDs"),
          searchKey: z
            .string()
            .optional()
            .describe("Free-text search across name, email, or employee number"),
          inProbation: z
            .boolean()
            .optional()
            .describe("Filter for employees in probation"),
          inNoticePeriod: z
            .boolean()
            .optional()
            .describe("Filter for employees in notice period"),
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
        if (params.employmentStatus) queryParams.employmentStatus = params.employmentStatus;
        if (params.employeeIds) queryParams.employeeIds = params.employeeIds;
        if (params.searchKey) queryParams.searchKey = params.searchKey;
        if (params.inProbation !== undefined) queryParams.inProbation = params.inProbation;
        if (params.inNoticePeriod !== undefined) queryParams.inNoticePeriod = params.inNoticePeriod;

        const res = await client.getPaginated<KekaEmployee>(
          "/hris/employees",
          queryParams
        );

        if (!res.succeeded) {
          return { content: [{ type: "text", text: `Error: ${res.message}` }] };
        }

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
        }

        const lines: string[] = [
          `# Keka Employees`,
          "",
          ...res.data.map((e) =>
            [
              `## ${e.displayName} (${e.employeeNumber})`,
              `- **ID:** ${e.id}`,
              `- **Email:** ${e.email}`,
              `- **Department:** ${e.department?.name ?? "—"}`,
              `- **Job Title:** ${e.jobTitle?.name ?? "—"}`,
              `- **Status:** ${e.employmentStatus ?? "—"}`,
              `- **Joined:** ${e.dateOfJoining ?? "—"}`,
              `- **Manager:** ${e.reportingManager?.displayName ?? "—"}`,
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

  // ─── Get Employee by ID ───────────────────────────────────────────────────

  server.registerTool(
    "keka_get_employee",
    {
      title: "Get Keka Employee Details",
      description: `Retrieve full details for a single employee by their Keka employee ID.

Args:
  - employeeId (string, required): The Keka employee ID (use keka_list_employees to find IDs)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Complete employee profile including personal info, department, job title, manager, location, and employment details.`,

      inputSchema: z
        .object({
          employeeId: z
            .string()
            .min(1)
            .describe("Keka employee ID (e.g., 'abc123')"),
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
        const res = await client.getSimple<KekaEmployee>(
          `/hris/employees/${encodeURIComponent(params.employeeId)}`
        );

        if (!res.succeeded || !res.data) {
          return {
            content: [{ type: "text", text: `Error: ${res.message || "Employee not found."}` }],
          };
        }

        const e = res.data;

        if (params.response_format === ResponseFormat.JSON) {
          return { content: [{ type: "text", text: JSON.stringify(e, null, 2) }] };
        }

        const lines = [
          `# ${e.displayName} (${e.employeeNumber})`,
          "",
          `| Field | Value |`,
          `|---|---|`,
          `| **ID** | ${e.id} |`,
          `| **Email** | ${e.email} |`,
          `| **Work Email** | ${e.workEmail ?? "—"} |`,
          `| **Department** | ${e.department?.name ?? "—"} |`,
          `| **Job Title** | ${e.jobTitle?.name ?? "—"} |`,
          `| **Status** | ${e.employmentStatus ?? "—"} |`,
          `| **Date of Joining** | ${e.dateOfJoining ?? "—"} |`,
          `| **Date of Birth** | ${e.dateOfBirth ?? "—"} |`,
          `| **Gender** | ${e.gender ?? "—"} |`,
          `| **Mobile** | ${e.mobileNumber ?? "—"} |`,
          `| **Manager** | ${e.reportingManager?.displayName ?? "—"} (${e.reportingManager?.email ?? "—"}) |`,
          `| **Location** | ${e.location?.name ?? "—"} |`,
          `| **In Probation** | ${e.isInProbation ? "Yes" : "No"} |`,
          `| **In Notice Period** | ${e.isInNoticePeriod ? "Yes" : "No"} |`,
        ];

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ─── List Departments ─────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_departments",
    {
      title: "List Keka Departments",
      description: `Retrieve all departments defined in Keka HRM.

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: List of departments with IDs, names, parent department, and department lead.`,

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
        const res = await client.getPaginated<KekaDepartment>("/hris/departments", {
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
          `# Keka Departments`,
          "",
          `| Name | ID | Parent | Lead |`,
          `|---|---|---|---|`,
          ...res.data.map(
            (d) =>
              `| ${d.name} | ${d.id} | ${d.parentName ?? "—"} | ${d.leaderName ?? "—"} |`
          ),
        ];
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ─── List Job Titles ──────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_job_titles",
    {
      title: "List Keka Job Titles",
      description: `Retrieve all job titles configured in Keka HRM.

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: List of job titles with their IDs and names.`,

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
        const res = await client.getPaginated<KekaJobTitle>("/hris/jobtitles", {
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
          `# Keka Job Titles`,
          "",
          `| Name | ID |`,
          `|---|---|`,
          ...res.data.map((j) => `| ${j.name} | ${j.id} |`),
        ];
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ─── List Groups ──────────────────────────────────────────────────────────

  server.registerTool(
    "keka_list_groups",
    {
      title: "List Keka Groups",
      description: `Retrieve all groups (teams/divisions) configured in Keka HRM.

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: List of groups with IDs, names, and types.`,

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
        const res = await client.getPaginated<KekaGroup>("/hris/groups", {
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
          `# Keka Groups`,
          "",
          `| Name | ID | Type |`,
          `|---|---|---|`,
          ...res.data.map((g) => `| ${g.name} | ${g.id} | ${g.type ?? "—"} |`),
        ];
        lines.push(formatPaginationFooter(res));
        return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
