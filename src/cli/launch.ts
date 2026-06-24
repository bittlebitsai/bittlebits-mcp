/**
 * `bittlebits-mcp launch` — detect an installed AI client and start it with
 * the Bittlebits MCP server pre-configured, so the user can immediately start
 * asking questions without any manual setup.
 *
 * Supported clients (in preference order):
 *   claude   — Claude Code CLI  (auto-approves MCP tool calls)
 *   codex    — OpenAI Codex CLI
 */
import { Command } from "commander";
import { spawnSync, execSync } from "node:child_process";
import { select } from "@inquirer/prompts";
import { banner, info, warn, fail, success, dim } from "./ui.js";

const MCP_CONFIG = JSON.stringify({
    mcpServers: {
        bittlebits: {
            command: "npx",
            args: ["-y", "@bittlebits.ai/mcp"],
        },
    },
});

interface LaunchOptions {
    prompt?: string;
    client?: string;
}

/** Check if a CLI binary exists on PATH. */
function isInstalled(bin: string): boolean {
    try {
        execSync(`which ${bin}`, { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

const CLIENTS = [
    {
        id: "claude",
        label: "Claude Code",
        check: () => isInstalled("claude"),
        launch(prompt?: string) {
            const args = [
                "--mcp-config", MCP_CONFIG,
                "--permission-mode", "auto",
            ];
            if (prompt) {
                args.push("--print", prompt);
            }
            spawnSync("claude", args, { stdio: "inherit" });
        },
    },
    {
        id: "codex",
        label: "Codex (OpenAI)",
        check: () => isInstalled("codex"),
        launch(prompt?: string) {
            // Codex doesn't support inline MCP config — register the server
            // via `codex mcp add` if not already present, then launch.
            try {
                execSync("codex mcp get bittlebits", { stdio: "ignore" });
            } catch {
                // Not registered yet — add it.
                execSync(
                    "codex mcp add bittlebits -- npx -y @bittlebits.ai/mcp",
                    { stdio: "inherit" },
                );
            }
            const args = prompt ? [prompt] : [];
            spawnSync("codex", args, { stdio: "inherit" });
        },
    },
] as const;

export function registerLaunchCommand(program: Command): void {
    program
        .command("launch")
        .description("Detect an installed AI client and launch it with Bittlebits ready to use")
        .option("-c, --client <name>", "Force a specific client: claude, codex")
        .option("-p, --prompt <text>", "Send an initial prompt (non-interactive)")
        .action((opts: LaunchOptions) => runLaunch(opts));
}

async function runLaunch(opts: LaunchOptions): Promise<void> {
    process.stdout.write(banner() + "\n");

    // ── Resolve which client to use ───────────────────────────────────────────
    let clientId = opts.client?.toLowerCase();

    if (clientId) {
        // Explicit flag — validate it.
        const found = CLIENTS.find((c) => c.id === clientId);
        if (!found) {
            console.log(fail(`Unknown client "${clientId}". Choose from: ${CLIENTS.map((c) => c.id).join(", ")}`));
            process.exit(1);
        }
        if (!found.check()) {
            console.log(fail(`"${found.label}" is not installed or not on PATH.`));
            process.exit(1);
        }
    } else {
        // Auto-detect.
        const available = CLIENTS.filter((c) => c.check());

        if (available.length === 0) {
            console.log(fail("No supported AI client found on PATH."));
            console.log(dim("  Install Claude Code (https://claude.ai/code) or Codex (https://github.com/openai/codex)"));
            process.exit(1);
        }

        if (available.length === 1) {
            clientId = available[0].id;
            console.log(info(`Using ${available[0].label}\n`));
        } else {
            // Multiple clients found — let the user pick.
            clientId = await select<string>({
                message: "Multiple AI clients found. Which would you like to use?",
                choices: available.map((c) => ({ name: c.label, value: c.id })),
            });
        }
    }

    const client = CLIENTS.find((c) => c.id === clientId)!;
    console.log(success(`Launching ${client.label} with Bittlebits MCP…\n`));
    client.launch(opts.prompt);
}
