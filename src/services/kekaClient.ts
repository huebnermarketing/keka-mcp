/**
 * Keka API client with automatic OAuth2 token management.
 *
 * Keka uses a custom OAuth2 grant_type "kekaapi" requiring:
 *   - client_id, client_secret, api_key, grant_type="kekaapi", scope="kekaapi"
 *
 * Tokens are cached in memory and auto-refreshed before expiry.
 */

import axios, { AxiosError, AxiosInstance } from "axios";
import {
  KEKA_AUTH_BASE,
  KEKA_AUTH_BASE_SANDBOX,
  TOKEN_EXPIRY_BUFFER_SECONDS,
} from "../constants.js";
import { KekaPaginatedResponse, KekaSimpleResponse } from "../types.js";

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix timestamp in seconds
}

export interface KekaClientConfig {
  tenantBaseUrl: string; // e.g. https://yourcompany.keka.com
  clientId: string;
  clientSecret: string;
  apiKey: string;
  sandbox?: boolean;
}

export class KekaClient {
  private config: KekaClientConfig;
  private tokenCache: TokenCache | null = null;
  private httpClient: AxiosInstance;
  private authBase: string;

  constructor(config: KekaClientConfig) {
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

  private async fetchToken(): Promise<TokenCache> {
    const params = new URLSearchParams();
    params.append("grant_type", "kekaapi");
    params.append("scope", "kekaapi");
    params.append("client_id", this.config.clientId);
    params.append("client_secret", this.config.clientSecret);
    params.append("api_key", this.config.apiKey);

    const response = await axios.post(
      `${this.authBase}/connect/token`,
      params,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 15000,
      }
    );

    const { access_token, expires_in } = response.data as {
      access_token: string;
      expires_in: number;
    };

    return {
      accessToken: access_token,
      expiresAt: Math.floor(Date.now() / 1000) + expires_in,
    };
  }

  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    if (
      !this.tokenCache ||
      this.tokenCache.expiresAt - TOKEN_EXPIRY_BUFFER_SECONDS <= now
    ) {
      this.tokenCache = await this.fetchToken();
    }

    return this.tokenCache.accessToken;
  }

  // ---------------------------------------------------------------------------
  // Core request helper
  // ---------------------------------------------------------------------------

  async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    endpoint: string,
    params?: Record<string, unknown>,
    body?: unknown
  ): Promise<T> {
    const token = await this.getAccessToken();

    const response = await this.httpClient.request<T>({
      method,
      url: endpoint,
      params,
      data: body,
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.data;
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    return this.request<T>("GET", endpoint, params);
  }

  async post<T>(endpoint: string, body: unknown): Promise<T> {
    return this.request<T>("POST", endpoint, undefined, body);
  }

  // ---------------------------------------------------------------------------
  // Paginated list helper
  // ---------------------------------------------------------------------------

  async getPaginated<T>(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<KekaPaginatedResponse<T>> {
    return this.get<KekaPaginatedResponse<T>>(endpoint, params);
  }

  async getSimple<T>(
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<KekaSimpleResponse<T>> {
    return this.get<KekaSimpleResponse<T>>(endpoint, params);
  }
}

// ---------------------------------------------------------------------------
// Error handling helper (used by all tools)
// ---------------------------------------------------------------------------

export function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as { message?: string; errors?: string[] } | undefined;
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
    } else if (error.code === "ECONNABORTED") {
      return "Error: Request timed out. The Keka server may be slow — try again.";
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return "Error: Cannot reach Keka. Check your KEKA_BASE_URL and network connection.";
    }
  }
  return `Error: Unexpected error — ${error instanceof Error ? error.message : String(error)}`;
}

// ---------------------------------------------------------------------------
// Singleton initialised from environment variables
// ---------------------------------------------------------------------------

let _client: KekaClient | null = null;

export function getKekaClient(): KekaClient {
  if (_client) return _client;

  const tenantBaseUrl = process.env.KEKA_BASE_URL;
  const clientId = process.env.KEKA_CLIENT_ID;
  const clientSecret = process.env.KEKA_CLIENT_SECRET;
  const apiKey = process.env.KEKA_API_KEY;

  if (!tenantBaseUrl || !clientId || !clientSecret || !apiKey) {
    console.error(
      "ERROR: Missing required environment variables.\n" +
        "Required: KEKA_BASE_URL, KEKA_CLIENT_ID, KEKA_CLIENT_SECRET, KEKA_API_KEY\n" +
        "Example: KEKA_BASE_URL=https://yourcompany.keka.com"
    );
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
