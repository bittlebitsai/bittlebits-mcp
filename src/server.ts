import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pollBittlebits, ENDPOINTS } from "./api.js";
import { formatScore, formatRewrite, formatUrlContent } from "./formatters.js";

const SuggestionSchema = z.object({
    stable_id:     z.string().optional(),
    current_text:  z.string().optional(),
    suggested_text: z.string().optional(),
    rationale:     z.string().optional(),
    is_addition:   z.boolean().default(false),
    location_hint: z.string().optional(),
    selector:      z.string().nullable().optional(),
    tag:           z.string().nullable().optional(),
});

export function createServer(bearer: string): McpServer {
    const server = new McpServer(
        { name: "Bittlebits GEO Assistant", version: "0.1.0" },
        { capabilities: { tools: { listChanged: true } } },
    );

    server.registerTool(
        "get_score",
        {
            title: "Get Bittlebits GEO Score",
            description:
                "Returns GEO metric scores (0–10 per dimension) for a page. " +
                "Accepts either a URL or a Bittlebits url_id. " +
                "The higher the score, the better the page's GEO performance. " +
                "This may take a few minutes to generate a response.",
            inputSchema: {
                url:    z.string().optional().describe("The page URL to score"),
                url_id: z.number().int().positive().optional().describe("Bittlebits url_id (if already known)"),
            },
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        },
        async ({ url, url_id }: { url?: string; url_id?: number }) => {
            if (!url && !url_id) throw new Error("Either url or url_id must be provided");
            const data = await pollBittlebits(ENDPOINTS.score, url, url_id, bearer);
            return { content: [{ type: "text" as const, text: formatScore(data) }] };
        },
    );

    server.registerTool(
        "get_rewrite",
        {
            title: "Get Bittlebits GEO Rewrite",
            description:
                "Returns the original and rewritten page content with Bittlebits GEO suggestions applied, " +
                "plus the list of individual suggested changes. " +
                "Accepts either a URL or a Bittlebits url_id. " +
                "This may take a few minutes to generate a response.",
            inputSchema: {
                url:    z.string().optional().describe("The page URL to rewrite"),
                url_id: z.number().int().positive().optional().describe("Bittlebits url_id (if already known)"),
            },
            outputSchema: {
                rewritten_html:     z.string().describe("Full page HTML with all suggestions applied"),
                rewritten_markdown: z.string().describe("Page markdown with all suggestions applied"),
                suggestions:        z.array(SuggestionSchema).nullable().describe("List of individual suggested changes"),
            },
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        },
        async ({ url, url_id }: { url?: string; url_id?: number }) => {
            if (!url && !url_id) throw new Error("Either url or url_id must be provided");
            const data = await pollBittlebits(ENDPOINTS.rewrite, url, url_id, bearer);
            if (!data.suggestions) throw new Error("No suggestions returned");
            const parsedSuggestions = z.array(SuggestionSchema).safeParse(data.suggestions);
            return {
                content: [{ type: "text" as const, text: formatRewrite(data) }],
                structuredContent: {
                    rewritten_html:     data.rewritten_html,
                    rewritten_markdown: data.rewritten_markdown,
                    suggestions:        parsedSuggestions.success ? parsedSuggestions.data : null,
                },
            };
        },
    );

    server.registerTool(
        "get_url_content",
        {
            title: "Get URL Content",
            description:
                "Returns the original HTML and markdown content of a page as fetched by Bittlebits. " +
                "Useful for comparing the current page to the rewritten version. " +
                "Accepts either a URL or a Bittlebits url_id.",
            inputSchema: {
                url:    z.string().optional().describe("The page URL"),
                url_id: z.number().int().positive().optional().describe("Bittlebits url_id (if already known)"),
            },
            outputSchema: {
                original_html:     z.string().describe("Raw HTML of the page as fetched"),
                original_markdown: z.string().describe("Page content as parsed markdown"),
            },
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        },
        async ({ url, url_id }: { url?: string; url_id?: number }) => {
            if (!url && !url_id) throw new Error("Either url or url_id must be provided");
            const data = await pollBittlebits(ENDPOINTS.url, url, url_id, bearer);
            return {
                content: [{ type: "text" as const, text: formatUrlContent(data) }],
                structuredContent: {
                    original_html:     data.original_html,
                    original_markdown: data.original_markdown,
                },
            };
        },
    );

    return server;
}
