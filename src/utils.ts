/**
 * Shared utilities for Keka MCP tool handlers.
 */

import { z } from "zod";
import { ResponseFormat, KekaPaginatedResponse } from "./types.js";
import { CHARACTER_LIMIT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./constants.js";

export const PaginationSchema = {
  pageNumber: z.number().int().min(1).default(1).describe("Page number (starts at 1)"),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe(`Results per page (max ${MAX_PAGE_SIZE})`),
};

export const ResponseFormatSchema = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe("Output format: 'markdown' for human-readable, 'json' for machine-readable");

export function truncate(text: string, hint = "Use filters or reduce pageSize."): string {
  if (text.length > CHARACTER_LIMIT) {
    return text.slice(0, CHARACTER_LIMIT) + `\n\n[Response truncated. ${hint}]`;
  }
  return text;
}

export function formatPaginationFooter(res: KekaPaginatedResponse<unknown>): string {
  return (
    `\n---\nPage ${res.pageNumber} of ${res.totalPages} | ` +
    `Showing ${res.data.length} of ${res.totalRecords} records.` +
    (res.nextPage ? ` Pass pageNumber=${res.pageNumber + 1} for next page.` : "")
  );
}
