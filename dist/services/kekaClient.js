/**
 * Keka API client with automatic OAuth2 token management.
 *
 * Keka uses a custom OAuth2 grant_type "kekaapi" requiring:
 *   - client_id, client_secret, api_key, grant_type="kekaapi", scope="kekaapi"
 *
 * Tokens are cached in memory and auto-refreshed before expiry.
 */
import axios, { AxiosError } from "axios";
import { KEKA_AUTH_BASE, KEKA_AUTH_BASE_SANDBOX, TOKEN_EXPIRY_BUFFER_SECONDS, } from "../constants.js";
export class KekaClient {
    config;
    tokenCache = null;
    httpClient;
    authBase;
    constructor(config) {
        this.config = config;
        this.authBase = config.sandbox ? KEKA_AUTH_BASE_SANDBOX : KEKA_AUTH_BASE;
        this.httpClient = axios.create({
            baseURL: `${config.tenantBaseUrl.replace(/\/$/, "")}/api/v1`,
            timeout: 30000,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });
    }
    // ---------------------------------------------------------------------------
    // Token management
    // ---------------------------------------------------------------------------
    async fetchToken() {
        const params = new URLSearchParams();
        params.append("grant_type", "kekaapi");
        params.append("scope", "kekaapi");
        params.append("client_id", this.config.clientId);
        params.append("client_secret", this.config.clientSecret);
        params.append("api_key", this.config.apiKey);
        const response = await axios.post(`${this.authBase}/connect/token`, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 15000,
        });
        const { access_token, expires_in } = response.data;
        return {
            accessToken: access_token,
            expiresAt: Math.floor(Date.now() / 1000) + expires_in,
        };
    }
    async getAccessToken() {
        const now = Math.floor(Date.now() / 1000);
        if (!this.tokenCache ||
            this.tokenCache.expiresAt - TOKEN_EXPIRY_BUFFER_SECONDS <= now) {
            this.tokenCache = await this.fetchToken();
        }
        return this.tokenCache.accessToken;
    }
    // ---------------------------------------------------------------------------
    // Core request helper
    // ---------------------------------------------------------------------------
    async request(method, endpoint, params, body) {
        const token = await this.getAccessToken();
        const response = await this.httpClient.request({
            method,
            url: endpoint,
            params,
            data: body,
            headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
    }
    async get(endpoint, params) {
        return this.request("GET", endpoint, params);
    }
    async post(endpoint, body) {
        return this.request("POST", endpoint, undefined, body);
    }
    // ---------------------------------------------------------------------------
    // Paginated list helper
    // ---------------------------------------------------------------------------
    async getPaginated(endpoint, params = {}) {
        return this.get(endpoint, params);
    }
    async getSimple(endpoint, params = {}) {
        return this.get(endpoint, params);
    }
}
// ---------------------------------------------------------------------------
// Error handling helper (used by all tools)
// ---------------------------------------------------------------------------
export function handleApiError(error) {
    if (error instanceof AxiosError) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            const msg = data?.message ?? data?.errors?.[0] ?? "";
            switch (status) {
                case 400:
                    return `Error: Bad request — ${msg || "check your input parameters."}`;
                case 401:
                    return "Error: Authentication failed. Check your KEKA_CLIENT_ID, KEKA_CLIENT_SECRET, and KEKA_API_KEY.";
                case 403:
                    return "Error: Permission denied. Your API key may not have access to this resource.";
                case 404:
                    return `Error: Resource not found. Verify the ID is correct. ${msg}`;
                case 429:
                    return "Error: Rate limit exceeded (50 req/min). Please wait before retrying.";
                case 500:
                    return "Error: Keka server error. Try again in a moment.";
                default:
                    return `Error: API request failed (HTTP ${status}). ${msg}`;
            }
        }
        else if (error.code === "ECONNABORTED") {
            return "Error: Request timed out. The Keka server may be slow — try again.";
        }
        else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
            return "Error: Cannot reach Keka. Check your KEKA_BASE_URL and network connection.";
        }
    }
    return `Error: Unexpected error — ${error instanceof Error ? error.message : String(error)}`;
}
// ---------------------------------------------------------------------------
// Singleton initialised from environment variables
// ---------------------------------------------------------------------------
let _client = null;
export function getKekaClient() {
    if (_client)
        return _client;
    const tenantBaseUrl = process.env.KEKA_BASE_URL;
    const clientId = process.env.KEKA_CLIENT_ID;
    const clientSecret = process.env.KEKA_CLIENT_SECRET;
    const apiKey = process.env.KEKA_API_KEY;
    if (!tenantBaseUrl || !clientId || !clientSecret || !apiKey) {
        console.error("ERROR: Missing required environment variables.\n" +
            "Required: KEKA_BASE_URL, KEKA_CLIENT_ID, KEKA_CLIENT_SECRET, KEKA_API_KEY\n" +
            "Example: KEKA_BASE_URL=https://yourcompany.keka.com");
        process.exit(1);
    }
    _client = new KekaClient({
        tenantBaseUrl,
        clientId,
        clientSecret,
        apiKey,
        sandbox: process.env.KEKA_SANDBOX === "true",
    });
    return _client;
}
//# sourceMappingURL=kekaClient.js.map