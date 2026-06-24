#!/usr/bin/env node
import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { resolveApiKey } from "./auth/apiKey.js";
import { registerSetupCommand } from "./cli/setup.js";
import { registerLaunchCommand } from "./cli/launch.js";

const VERSION = "0.1.0";

/** Default command: run the stdio MCP server. */
async function runServer(): Promise<void> {
    // Never log to stdout here — it carries the JSON-RPC stream. Use stderr.
    const apiKey = await resolveApiKey({
        interactive: true,
        onAuthUrl: (url) => console.error(`Open this URL to sign in: ${url}`),
    });
    const server = createServer(apiKey);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

async function main(): Promise<void> {
    const program = new Command();
    program
        .name("bittlebits-mcp")
        .description("Bittlebits MCP server — GEO scores and rewrites in your AI agent")
        .version(VERSION);

    registerSetupCommand(program);
    registerLaunchCommand(program);

    // No subcommand → start the server.
    program.action(runServer);

    await program.parseAsync(process.argv);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
