/**
 * Expense tools: employee expenses and expense claims.
 */
import { z } from "zod";
import { getKekaClient, handleApiError } from "../services/kekaClient.js";
import { CHARACTER_LIMIT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { ResponseFormat, } from "../types.js";
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
        return text.slice(0, CHARACTER_LIMIT) + "\n\n[Response truncated. Apply additional filters.]";
    }
    return text;
}
function formatPaginationFooter(res) {
    return (`\n---\nPage ${res.pageNumber} of ${res.totalPages} | ` +
        `Showing ${res.data.length} of ${res.totalRecords} records.` +
        (res.nextPage ? ` Pass pageNumber=${res.pageNumber + 1} for next page.` : ""));
}
export function registerExpenseTools(server) {
    // ─── List Employee Expenses ───────────────────────────────────────────────
    server.registerTool("keka_list_expenses", {
        title: "List Keka Employee Expenses",
        description: `Retrieve individual expense entries for a specific employee from Keka.

Args:
  - employeeId (string, required): The Keka employee ID whose expenses to retrieve
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: List of expense entries with ID, title, amount, currency, category, date, and status.

Note: Use keka_list_expense_claims for summary-level claim information across all employees.`,
        inputSchema: z
            .object({
            employeeId: z.string().min(1).describe("Keka employee ID"),
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
            const res = await client.getPaginated(`/expense/employees/${params.employeeId}/expenses`, { pageNumber: params.pageNumber, pageSize: params.pageSize });
            if (!res.succeeded) {
                return { content: [{ type: "text", text: `Error: ${res.message}` }] };
            }
            if (!res.data.length) {
                return {
                    content: [{ type: "text", text: `No expenses found for employee ${params.employeeId}.` }],
                };
            }
            if (params.response_format === ResponseFormat.JSON) {
                return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
            }
            const lines = [
                `# Expenses for Employee ${params.employeeId}`,
                "",
                `| Title | Amount | Currency | Category | Date | Status |`,
                `|---|---|---|---|---|---|`,
                ...res.data.map((e) => `| ${e.title ?? "—"} | ${e.amount.toLocaleString()} | ${e.currency ?? "—"} | ` +
                    `${e.category ?? "—"} | ${e.date ?? "—"} | ${e.status ?? "—"} |`),
            ];
            lines.push(formatPaginationFooter(res));
            return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: handleApiError(error) }] };
        }
    });
    // ─── List Expense Claims ──────────────────────────────────────────────────
    server.registerTool("keka_list_expense_claims", {
        title: "List Keka Expense Claims",
        description: `Retrieve expense claim summaries from Keka across all employees.

Expense claims are collections of individual expenses submitted for reimbursement.

Args:
  - pageNumber (integer): Page number (default: 1)
  - pageSize (integer): Results per page, max ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns: Expense claims with ID, employee, title, total amount, currency, status, submitted date, and approver.`,
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
            const res = await client.getPaginated("/expense/claims", {
                pageNumber: params.pageNumber,
                pageSize: params.pageSize,
            });
            if (!res.succeeded) {
                return { content: [{ type: "text", text: `Error: ${res.message}` }] };
            }
            if (!res.data.length) {
                return { content: [{ type: "text", text: "No expense claims found." }] };
            }
            if (params.response_format === ResponseFormat.JSON) {
                return { content: [{ type: "text", text: truncate(JSON.stringify(res, null, 2)) }] };
            }
            const lines = [
                `# Expense Claims`,
                "",
                `| Employee | Title | Total | Currency | Status | Submitted | Approved By |`,
                `|---|---|---|---|---|---|---|`,
                ...res.data.map((c) => `| ${c.employeeName ?? c.employeeId} | ${c.title ?? "—"} | ` +
                    `${c.totalAmount != null ? c.totalAmount.toLocaleString() : "—"} | ` +
                    `${c.currency ?? "—"} | ${c.status ?? "—"} | ` +
                    `${c.submittedOn ?? "—"} | ${c.approvedBy ?? "—"} |`),
            ];
            lines.push(formatPaginationFooter(res));
            return { content: [{ type: "text", text: truncate(lines.join("\n")) }] };
        }
        catch (error) {
            return { content: [{ type: "text", text: handleApiError(error) }] };
        }
    });
}
//# sourceMappingURL=expense.js.map