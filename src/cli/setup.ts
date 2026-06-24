/**
 * `bittlebits-mcp setup` — interactive onboarding.
 *
 * Picks one or more clients, signs the user in via the browser (unless a key is
 * already available), and writes the stdio MCP server entry into each client's
 * config file.
 */
import { Command } from "commander";
import { stdin as processStdin, stdout as processStdout, env as processEnv } from "node:process";
import { checkbox, select } from "@inquirer/prompts";
import ora from "ora";
import { getBaseUrl, DEFAULT_BASE_URL } from "../config.js";
import { CLIENTS, getClient, buildEntry, detectInstalled, type Scope } from "./clients.js";
import { loginAndStoreApiKey } from "../auth/apiKey.js";
import * as store from "../auth/store.js";
import { banner, success, info, warn, fail, dim, bold } from "./ui.js";

interface SetupOptions {
    baseUrl?: string;
    apiKey?: string;
    project?: boolean;
    global?: boolean;
    yes?: boolean;
    claude?: boolean;
    cursor?: boolean;
    vscode?: boolean;
    codex?: boolean;
}

const CLIENT_FLAGS: Array<keyof SetupOptions> = ["claude", "cursor", "vscode", "codex"];

export function registerSetupCommand(program: Command): void {
    program
        .command("setup")
        .description("Connect Bittlebits to your AI client (Claude Code, Cursor, VS Code, Codex)")
        .option("--base-url <url>", "Bittlebits base URL", process.env.BITTLEBITS_BASE_URL)
        .option("--api-key <key>", "Use this API key instead of signing in")
        .option("-p, --project", "Write project-scoped config in the current directory")
        .option("--global", "Write user-global config")
        .option("-y, --yes", "Non-interactive; use flags/defaults without prompting")
        .option("--claude", "Configure Claude Code")
        .option("--cursor", "Configure Cursor")
        .option("--vscode", "Configure VS Code")
        .option("--codex", "Configure Codex")
        .action((opts: SetupOptions) => runSetup(opts));
}

async function runSetup(opts: SetupOptions): Promise<void> {
    const baseUrl = getBaseUrl(opts.baseUrl);
    process.stdout.write(banner() + "\n");
    if (baseUrl !== DEFAULT_BASE_URL) console.log(info(`Using ${baseUrl}\n`));

    const clientIds = await resolveClients(opts);
    if (clientIds.length === 0) {
        console.log(warn("No clients selected — nothing to do."));
        return;
    }

    const scope = await resolveScope(opts);
    const apiKey = await resolveSetupKey(opts, baseUrl);

    // Only pin a non-default base URL into client env; keep prod configs clean.
    const entry = buildEntry(apiKey, baseUrl !== DEFAULT_BASE_URL ? baseUrl : undefined);

    console.log("");
    let wrote = 0;
    for (const id of clientIds) {
        const client = getClient(id)!;
        const path = client.resolvePath(scope, process.cwd());
        if (!path) {
            console.log(warn(`${client.label}: ${scope} scope not supported, skipped`));
            continue;
        }
        try {
            client.write(path, entry);
            console.log(success(`${bold(client.label)} ${dim("→ " + path)}`));
            wrote++;
        } catch (err) {
            console.log(fail(`${client.label}: ${(err as Error).message}`));
        }
    }

    if (wrote > 0) {
        console.log("");
        console.log(success(`Done. Restart your client${wrote > 1 ? "s" : ""} to load Bittlebits.`));
        console.log(dim(`  Try: "Get the Bittlebits GEO score for https://example.com"`));
    }
}

async function resolveClients(opts: SetupOptions): Promise<string[]> {
    const flagged = CLIENT_FLAGS.filter((f) => opts[f]).map((f) => f as string);
    if (flagged.length) return flagged;

    if (opts.yes) {
        // Non-interactive with no client flags: configure all clients.
        return CLIENTS.map((c) => c.id);
    }

    const allIds = CLIENTS.map((c) => c.id);
    const choice = await select<"all" | "specific">({
        message: "Which clients should use Bittlebits?",
        default: "all",
        choices: [
            {
                name: "All clients (recommended) — Claude Code, Cursor, VS Code, Codex, ...",
                value: "all",
                description: "Configures every supported client so Bittlebits works wherever you code.",
            },
            {
                name: "Choose specific clients…",
                value: "specific",
                description: "Pick one or more clients from a list.",
            },
        ],
    });

    if (choice === "all") return allIds;

    const installed = detectInstalled();
    // Detected clients first (pre-checked), then the rest.
    const ordered = [
        ...CLIENTS.filter((c) => installed.has(c.id)),
        ...CLIENTS.filter((c) => !installed.has(c.id)),
    ];

    return checkbox({
        message: "Select clients to configure:",
        choices: ordered.map((c) => ({
            name: c.label,
            value: c.id,
            checked: installed.has(c.id),
        })),
        validate: (items) => (items.length > 0 ? true : "Select at least one client (space to toggle)."),
    });
}

async function resolveScope(opts: SetupOptions): Promise<Scope> {
    if (opts.global) return "global";
    if (opts.project) return "project";
    if (opts.yes) return "project";

    return select<Scope>({
        message: "Where should the config be written?",
        choices: [
            { name: "This project (current directory)", value: "project" },
            { name: "Global (all projects on this machine)", value: "global" },
        ],
        default: "project",
    });
}

/** API key precedence for setup: --api-key → env → cached → browser login. */
async function resolveSetupKey(opts: SetupOptions, baseUrl: string): Promise<string> {
    if (opts.apiKey) {
        store.save({ ...store.load(), apiKey: opts.apiKey, baseUrl });
        return opts.apiKey;
    }
    const envKey = process.env.BITTLEBITS_API_KEY?.trim();
    if (envKey) return envKey;

    const cached = store.load().apiKey?.trim();
    if (cached) {
        console.log(success("Using your saved Bittlebits sign-in.\n"));
        return cached;
    }

    if (opts.yes || !process.stdin.isTTY) {
        throw new Error("No API key available. Pass --api-key or run setup interactively to sign in.");
    }

    const spinner = ora("Opening your browser to sign in…").start();
    try {
        const apiKey = await loginAndStoreApiKey(baseUrl, (url) => {
            spinner.text = "Waiting for sign-in to complete…";
            spinner.stopAndPersist({ symbol: "→", text: dim(`If the browser didn't open: ${url}`) });
            spinner.start("Waiting for sign-in to complete…");
        });
        spinner.succeed("Signed in to Bittlebits.\n");
        return apiKey;
    } catch (err) {
        spinner.fail("Sign-in failed.");
        throw err;
    }
}
