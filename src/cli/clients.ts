/**
 * Registry of supported MCP clients and where/how each stores its config.
 *
 * All four are configured for the stdio transport: they launch
 * `npx -y bittlebits-mcp` with the API key (and optional base URL) in the
 * server's environment.
 */
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { SERVER_KEY } from "../config.js";
import {
    mergeJsonServer,
    upsertTomlServer,
    type StdioEntry,
} from "./configWriter.js";

export type Scope = "project" | "global";

export interface ClientDef {
    id: string;
    label: string;
    /** Where the config lives for the given scope (null = scope unsupported). */
    resolvePath(scope: Scope, cwd: string): string | null;
    /** Paths that hint the client is installed (used to pre-select the menu). */
    detectPaths(): string[];
    /** Write the server entry into the resolved config file. */
    write(path: string, entry: StdioEntry): void;
}

function vscodeUserDir(): string {
    const home = homedir();
    switch (platform()) {
        case "darwin":
            return join(home, "Library", "Application Support", "Code", "User");
        case "win32":
            return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "Code", "User");
        default:
            return join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "Code", "User");
    }
}

function codexHome(): string {
    return process.env.CODEX_HOME || join(homedir(), ".codex");
}

export const CLIENTS: ClientDef[] = [
    {
        id: "claude",
        label: "Claude Code",
        resolvePath: (scope, cwd) =>
            scope === "global" ? join(homedir(), ".claude.json") : join(cwd, ".mcp.json"),
        detectPaths: () => [join(homedir(), ".claude.json"), join(homedir(), ".claude")],
        write: (path, entry) => mergeJsonServer(path, "mcpServers", SERVER_KEY, { type: "stdio", ...entry }),
    },
    {
        id: "cursor",
        label: "Cursor",
        resolvePath: (scope, cwd) =>
            scope === "global"
                ? join(homedir(), ".cursor", "mcp.json")
                : join(cwd, ".cursor", "mcp.json"),
        detectPaths: () => [join(homedir(), ".cursor")],
        write: (path, entry) => mergeJsonServer(path, "mcpServers", SERVER_KEY, entry),
    },
    {
        id: "vscode",
        label: "VS Code",
        resolvePath: (scope, cwd) =>
            scope === "global"
                ? join(vscodeUserDir(), "mcp.json")
                : join(cwd, ".vscode", "mcp.json"),
        detectPaths: () => [vscodeUserDir(), join(homedir(), ".vscode")],
        write: (path, entry) => mergeJsonServer(path, "servers", SERVER_KEY, { type: "stdio", ...entry }),
    },
    {
        id: "codex",
        label: "Codex (OpenAI)",
        resolvePath: (scope, cwd) =>
            scope === "global"
                ? join(codexHome(), "config.toml")
                : join(cwd, ".codex", "config.toml"),
        detectPaths: () => [codexHome()],
        write: (path, entry) => upsertTomlServer(path, "mcp_servers", SERVER_KEY, entry),
    },
];

export function getClient(id: string): ClientDef | undefined {
    return CLIENTS.find((c) => c.id === id);
}

/** Build the stdio server entry written into a client config. */
export function buildEntry(apiKey: string, baseUrl?: string): StdioEntry {
    const env: Record<string, string> = { BITTLEBITS_API_KEY: apiKey };
    if (baseUrl) env.BITTLEBITS_BASE_URL = baseUrl;
    return { command: "npx", args: ["-y", "bittlebits-mcp"], env };
}

/** Clients whose detect paths exist on this machine (best-effort menu default). */
export function detectInstalled(): Set<string> {
    const found = new Set<string>();
    for (const c of CLIENTS) {
        if (c.detectPaths().some((p) => existsSync(p))) found.add(c.id);
    }
    return found;
}
