/**
 * Read/merge/write helpers for client config files.
 *
 * JSON clients (Claude Code, Cursor, VS Code) share a merge routine that
 * tolerates JSONC-style comments on read and writes plain 2-space JSON.
 * Codex uses TOML, handled by upserting a single [mcp_servers.<key>] block.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export interface StdioEntry {
    command: string;
    args: string[];
    env: Record<string, string>;
    /** Some clients want an explicit transport type ("stdio"). */
    type?: string;
}

function readText(path: string): string {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Strip // line and /* *​/ block comments so we can JSON.parse JSONC files. */
function stripJsonComments(input: string): string {
    return input
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function ensureDir(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
}

/**
 * Merge an MCP server entry into a JSON config file under
 * `root[topKey][serverName]`. Existing unrelated servers and keys are kept.
 * Returns true if the file changed.
 */
export function mergeJsonServer(
    path: string,
    topKey: string,
    serverName: string,
    entry: StdioEntry,
): void {
    const existing = readText(path).trim();
    let root: Record<string, any> = {};
    if (existing) {
        try {
            root = JSON.parse(stripJsonComments(existing));
        } catch (err) {
            throw new Error(
                `Existing config at ${path} is not valid JSON; please fix or remove it and re-run. ` +
                    `(${(err as Error).message})`,
            );
        }
    }
    if (typeof root !== "object" || root === null || Array.isArray(root)) root = {};
    if (typeof root[topKey] !== "object" || root[topKey] === null) root[topKey] = {};
    root[topKey][serverName] = entry;

    ensureDir(path);
    writeFileSync(path, JSON.stringify(root, null, 2) + "\n");
}

/** Render a TOML value for the limited shapes we emit (string / string[]). */
function tomlValue(value: string | string[]): string {
    if (Array.isArray(value)) {
        return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    return JSON.stringify(value);
}

/**
 * Remove every TOML block whose header is `[<prefix>]` or `[<prefix>.*]`,
 * returning the remaining text. Used to drop a stale server before re-adding it.
 */
function removeTomlBlocks(content: string, prefix: string): string {
    const lines = content.split("\n");
    const out: string[] = [];
    let skipping = false;
    const headerRe = /^\s*\[\[?([^\]]+)\]\]?\s*$/;
    for (const line of lines) {
        const match = line.match(headerRe);
        if (match) {
            const header = match[1].trim();
            skipping = header === prefix || header.startsWith(`${prefix}.`);
        }
        if (!skipping) out.push(line);
    }
    return out.join("\n");
}

/**
 * Upsert `[mcp_servers.<serverName>]` (+ its `.env` sub-table) into a Codex
 * TOML file, preserving any other content.
 */
export function upsertTomlServer(
    path: string,
    topKey: string,
    serverName: string,
    entry: StdioEntry,
): void {
    const prefix = `${topKey}.${serverName}`;
    let content = readText(path);
    content = removeTomlBlocks(content, prefix).replace(/\n{3,}/g, "\n\n").trimEnd();

    const block: string[] = [
        `[${prefix}]`,
        `command = ${tomlValue(entry.command)}`,
        `args = ${tomlValue(entry.args)}`,
    ];
    if (entry.env && Object.keys(entry.env).length) {
        block.push("", `[${prefix}.env]`);
        for (const [k, v] of Object.entries(entry.env)) {
            block.push(`${k} = ${tomlValue(v)}`);
        }
    }

    const next = (content ? content + "\n\n" : "") + block.join("\n") + "\n";
    ensureDir(path);
    writeFileSync(path, next);
}
