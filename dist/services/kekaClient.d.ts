/**
 * Keka API client with automatic OAuth2 token management.
 *
 * Keka uses a custom OAuth2 grant_type "kekaapi" requiring:
 *   - client_id, client_secret, api_key, grant_type="kekaapi", scope="kekaapi"
 *
 * Tokens are cached in memory and auto-refreshed before expiry.
 */
import { KekaPaginatedResponse, KekaSimpleResponse } from "../types.js";
export interface KekaClientConfig {
    tenantBaseUrl: string;
    clientId: string;
    clientSecret: string;
    apiKey: string;
    sandbox?: boolean;
}
export declare class KekaClient {
    private config;
    private tokenCache;
    private httpClient;
    private authBase;
    constructor(config: KekaClientConfig);
    private fetchToken;
    private getAccessToken;
    request<T>(method: "GET" | "POST" | "PUT" | "DELETE", endpoint: string, params?: Record<string, unknown>, body?: unknown): Promise<T>;
    get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T>;
    post<T>(endpoint: string, body: unknown): Promise<T>;
    getPaginated<T>(endpoint: string, params?: Record<string, unknown>): Promise<KekaPaginatedResponse<T>>;
    getSimple<T>(endpoint: string, params?: Record<string, unknown>): Promise<KekaSimpleResponse<T>>;
}
export declare function handleApiError(error: unknown): string;
export declare function getKekaClient(): KekaClient;
//# sourceMappingURL=kekaClient.d.ts.map