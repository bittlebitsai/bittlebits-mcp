/**
 * Resolves the Bittlebits API key used to authenticate MCP requests.
 *
 * Precedence:
 *   1. BITTLEBITS_API_KEY environment variable (CI / power users).
 *   2. The key cached locally at ~/.bittlebits/config.json.
 *   3. Interactive browser login (only when allowed and attached to a TTY).
 */
import { getBaseUrl } from "../config.js";
import * as store from "./store.js";
import { loginInBrowser } from "./oauth.js";

/** Exchange an OAuth access token for the user's long-lived API key. */
export async function fetchApiKey(baseUrl: string, accessToken: string): Promise<string> {
    const res = await fetch(`${baseUrl}/skewer/v1/auth/user`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) {
        throw new Error(`Could not load your account (HTTP ${res.status}).`);
    }
    const data = (await res.json()) as { api_key?: string; authenticated?: boolean };
    if (!data.api_key) {
        throw new Error(
            "Signed in, but no API key was returned for your account. " +
                "Visit https://bittlebits.ai/settings to create one.",
        );
    }
    return data.api_key;
}

/** Run the browser login and return + persist the resulting API key. */
export async function loginAndStoreApiKey(baseUrl: string, onAuthUrl?: (url: string) => void): Promise<string> {
    const { accessToken } = await loginInBrowser({ baseUrl, onAuthUrl });
    const apiKey = await fetchApiKey(baseUrl, accessToken);
    store.save({ ...store.load(), apiKey, baseUrl });
    return apiKey;
}

export interface ResolveOptions {
    /** Allow an interactive browser login if no key is found. */
    interactive?: boolean;
    baseUrl?: string;
    onAuthUrl?: (url: string) => void;
}

/**
 * Resolve an API key for server mode. Throws a clear, actionable error when no
 * key is available and interactive login isn't possible.
 */
export async function resolveApiKey(opts: ResolveOptions = {}): Promise<string> {
    const envKey = process.env.BITTLEBITS_API_KEY?.trim();
    if (envKey) return envKey;

    const cached = store.load().apiKey?.trim();
    if (cached) return cached;

    const baseUrl = getBaseUrl(opts.baseUrl);
    if (opts.interactive && process.stdin.isTTY && process.stdout.isTTY) {
        return loginAndStoreApiKey(baseUrl, opts.onAuthUrl);
    }

    throw new Error(
        "No Bittlebits API key found.\n" +
            "  • Run `npx bittlebits-mcp setup` to sign in, or\n" +
            "  • set the BITTLEBITS_API_KEY environment variable.",
    );
}
