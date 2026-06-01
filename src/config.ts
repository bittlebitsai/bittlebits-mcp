/**
 * Shared configuration for both the MCP server and the `setup` CLI.
 *
 * The base URL can be overridden with BITTLEBITS_BASE_URL so the same binary
 * works against production, staging, or a local Django instance.
 */

export const DEFAULT_BASE_URL = "https://bittlebits.ai";

/** Resolve the Bittlebits base URL (env override → default), without a trailing slash. */
export function getBaseUrl(override?: string): string {
    const raw = override || process.env.BITTLEBITS_BASE_URL || DEFAULT_BASE_URL;
    return raw.replace(/\/+$/, "");
}

/** Name used for the MCP server entry written into every client config. */
export const SERVER_KEY = "bittlebits";
