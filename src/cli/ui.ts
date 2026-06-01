/** Small presentation helpers shared by the setup command. */
import pc from "picocolors";

export function banner(): string {
    return [
        "",
        pc.bold(pc.magenta("  Bittlebits MCP")),
        pc.dim("  GEO scores & rewrites, inside your AI agent"),
        "",
    ].join("\n");
}

export function success(msg: string): string {
    return `${pc.green("✓")} ${msg}`;
}

export function info(msg: string): string {
    return `${pc.cyan("→")} ${msg}`;
}

export function warn(msg: string): string {
    return `${pc.yellow("!")} ${msg}`;
}

export function fail(msg: string): string {
    return `${pc.red("✗")} ${msg}`;
}

export const dim = pc.dim;
export const bold = pc.bold;
