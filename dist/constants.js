/**
 * Shared constants for the Keka MCP Server.
 */
/** Maximum characters in a single tool response to avoid overwhelming context */
export const CHARACTER_LIMIT = 25000;
/** Default page size for paginated requests */
export const DEFAULT_PAGE_SIZE = 50;
/** Maximum page size supported by Keka API */
export const MAX_PAGE_SIZE = 200;
/** Refresh the access token this many seconds before it actually expires */
export const TOKEN_EXPIRY_BUFFER_SECONDS = 120;
/** Keka OAuth token endpoint base */
export const KEKA_AUTH_BASE = "https://login.keka.com";
/** Keka sandbox OAuth token endpoint base */
export const KEKA_AUTH_BASE_SANDBOX = "https://login.kekademo.com";
/** Keka API rate limit: requests per minute */
export const RATE_LIMIT_RPM = 50;
//# sourceMappingURL=constants.js.map