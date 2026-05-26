#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getAuthToken } from "./auth.js";
import { createServer } from "./server.js";

async function main() {
    const bearer = getAuthToken();
    const server = createServer(bearer);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
