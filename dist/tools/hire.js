/**
 * Recruitment tools: jobs, candidates.
 */
import { z } from "zod";
import { getKekaClient, handleApiError } from "../services/kekaClient.js";
import { CHARACTER_LIMIT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { ResponseFormat } from "../types.js";
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
function truncate(text) {
    if (text.length > CHARACTER_LIMIT) {
        return text.slice(0, CHARACTER_LIMIT) + "\n\n[Response truncated. Use filters or reduce pageSize.]";
    }
    return text;
}
function formatPaginationFooter(res) {
    return (`\n---\nPage ${res.pageNumber} of ${res.totalPages} | ` +
        `Showing ${res.data.length} of ${res.totalRecords} records.` +
        (res.nextPage ? ` Pass pageNumber=${res.pageNumber + 1} for next page.` : ""));
}
export function registerHireTools(server) {
    // ─── List Jobs ────────────────────────────────────────────────────────────
    server.registerTool("keka_list_jobs", {
        title: "List Keka Job Openings",
        description: `Retrieve all job openings from Keka Hire (Recruitment module).

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Job openings with ID, title, department, location, status, number of openings, posted date, closing date, and hiring manager.

Use keka_list_candidates to see candidates for a specific job.`,
        inputSchema: z.object({ ...PaginationSchema, response_format: ResponseFormatSchema }).strict(),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const client = getKekaClient();
            const res = await client.getPaginated("/hire/jobs", {
                pageNumber: params.pageNumber,
                pageSize: params.pageSize,
            });
            if (!res.succeeded) {
                return { content: [{ type: "text", text: `Error: ${res.message}` }] };
            }
            if (!res.data.length) {
                return { content: [{ type: "text", text: "No job openings found." }] };
            }
            if (params.response_format === ResponseFormat.JSON) {
                return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
            }
            const lines = [
                `# Keka Job Openings`,
                "",
                ...res.data.map((j) => [
                    `## ${j.title} (ID: ${j.id})`,
                    `- **Department:** ${j.department ?? "—"} | **Location:** ${j.location ?? "—"}`,
                    `- **Status:** ${j.status ?? "—"} | **Openings:** ${j.openings ?? "—"}`,
                    `- **Posted:** ${j.postedDate ?? "—"} | **Closing:** ${j.closingDate ?? "—"}`,
                    `- **Hiring Manager:** ${j.hiringManagerName ?? "—"}`,
                    "",
                ].join("\n")),
            ];
            lines.push(formatPaginationFooter(res));
            return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: handleApiError(error) }] };
        }
    });
    // ─── List Candidates ──────────────────────────────────────────────────────
    server.registerTool("keka_list_candidates", {
        title: "List Keka Job Candidates",
        description: `Retrieve candidates for a specific job opening in Keka Hire.

Args:
  - jobId (string, required): The Keka job ID (use keka_list_jobs to find IDs)
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Candidate list with name, email, phone, current interview stage, application date, source, and status.`,
        inputSchema: z
            .object({
            jobId: z
                .string()
                .min(1)
                .describe("Keka job ID (from keka_list_jobs)"),
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
    }, async (params) => {
        try {
            const client = getKekaClient();
            const res = await client.getPaginated(`/hire/jobs/${params.jobId}/candidates`, { pageNumber: params.pageNumber, pageSize: params.pageSize });
            if (!res.succeeded) {
                return { content: [{ type: "text", text: `Error: ${res.message}` }] };
            }
            if (!res.data.length) {
                return {
                    content: [{ type: "text", text: `No candidates found for job ${params.jobId}.` }],
                };
            }
            if (params.response_format === ResponseFormat.JSON) {
                return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
            }
            const lines = [
                `# Candidates for Job ${params.jobId}`,
                "",
                `| Name | Email | Stage | Status | Applied | Source |`,
                `|---|---|---|---|---|---|`,
                ...res.data.map((c) => `| ${c.name} | ${c.email ?? "—"} | ${c.currentStage ?? "—"} | ` +
                    `${c.status ?? "—"} | ${c.appliedDate ?? "—"} | ${c.source ?? "—"} |`),
            ];
            lines.push(formatPaginationFooter(res));
            return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: handleApiError(error) }] };
        }
    });
}
//# sourceMappingURL=hire.js.map