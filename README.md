# Bittlebits MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that brings your [Bittlebits](https://bittlebits.ai) GEO scores and rewrite suggestions directly into AI agents — Claude Code, Cursor, VS Code, Codex, or any MCP-compatible client.

Instead of copying content back and forth, your agent can pull what Bittlebits recommends and apply those changes directly in your codebase.

---

## Quick start

```bash
npx bittlebits-mcp setup
```

This walks you through everything:

1. **Pick your clients** — Claude Code, Cursor, VS Code, Codex (any combination).
2. **Sign in** — a browser window opens; log into Bittlebits and you're done. Your API key is fetched and cached locally at `~/.bittlebits/config.json`.
3. **Connected** — the server is written into each client's config. Restart the client and start asking.

No copy-pasting keys, no hand-editing JSON.

> Already have an API key? Skip the browser:
> `npx bittlebits-mcp setup --api-key bb_your_key`

---

## What you can do

Once connected, ask your agent things like:

- *"Show me what Bittlebits wants to change on this page and explain why."*
- *"Rewrite my homepage copy applying the Bittlebits suggestions."*
- *"Which metrics are weakest and what should I fix first?"*
- *"Get the score for my landing page, then find and update the file in my codebase."*

---

## Available tools

| Tool | What it does |
|------|-------------|
| `get_score` | Returns GEO metric scores (0–10 per dimension) for a page |
| `get_rewrite` | Returns original and rewritten page content with Bittlebits suggestions applied |
| `get_url_content` | Returns the raw HTML and markdown of a page as fetched by Bittlebits |

All tools accept either a `url` (full page URL) or a `url_id` (Bittlebits internal ID if already known). Results may take a few minutes on first run while Bittlebits processes the page.

---

## The `setup` command

```
npx bittlebits-mcp setup [options]

  --claude --cursor --vscode --codex   Configure specific clients (skips the menu)
  -p, --project                        Write project-scoped config (current directory)
  --global                             Write user-global config
  --api-key <key>                      Use this key instead of signing in
  -y, --yes                            Non-interactive (use flags/defaults)
  --base-url <url>                     Target a non-production instance
```

Where each client's config is written:

| Client | Project scope | Global scope |
|--------|---------------|--------------|
| Claude Code | `.mcp.json` | `~/.claude.json` |
| Cursor | `.cursor/mcp.json` | `~/.cursor/mcp.json` |
| VS Code | `.vscode/mcp.json` | user `mcp.json` |
| Codex | `.codex/config.toml` | `~/.codex/config.toml` |

Re-running `setup` is safe: it merges into existing files, preserving your other MCP servers, and only updates the Bittlebits entry.

---

## Manual configuration

Prefer to wire it up yourself? Any client that supports the stdio transport works. Run `npx bittlebits-mcp` with `BITTLEBITS_API_KEY` set in the environment — find your key under **Settings → API Keys** at [bittlebits.ai](https://bittlebits.ai).

**Claude Code (CLI):**

```bash
claude mcp add --transport stdio bittlebits -e BITTLEBITS_API_KEY=your_key -- npx -y bittlebits-mcp
```

**Cursor / Claude Code (`.cursor/mcp.json` or `.mcp.json`):**

```json
{
  "mcpServers": {
    "bittlebits": {
      "command": "npx",
      "args": ["-y", "bittlebits-mcp"],
      "env": { "BITTLEBITS_API_KEY": "your_key_here" }
    }
  }
}
```

**VS Code (`.vscode/mcp.json`):**

```json
{
  "servers": {
    "bittlebits": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "bittlebits-mcp"],
      "env": { "BITTLEBITS_API_KEY": "your_key_here" }
    }
  }
}
```

**Codex (`~/.codex/config.toml`):**

```toml
[mcp_servers.bittlebits]
command = "npx"
args = ["-y", "bittlebits-mcp"]

[mcp_servers.bittlebits.env]
BITTLEBITS_API_KEY = "your_key_here"
```

---

## Prerequisites

- Node.js 18+
- A [Bittlebits](https://bittlebits.ai) account

---

## Development

```bash
git clone https://github.com/bittlebitsai/bittlebits-mcp
cd bittlebits-mcp
npm install
npm run dev       # run the server with tsx (no build step)
npm run build     # compile to dist/

# Try the setup flow against a local/staging backend:
BITTLEBITS_BASE_URL=http://localhost:8025 node dist/index.js setup
```

Environment variables:

- `BITTLEBITS_API_KEY` — API key for server mode (skips browser login).
- `BITTLEBITS_BASE_URL` — override the Bittlebits instance (default `https://bittlebits.ai`).

---

## Tips

- **Be specific about what to keep.** If brand voice matters, tell your agent: *"Apply the suggestions but keep the casual, conversational tone."*
- **Work section by section** on longer pages — easier to review.
- **Re-score after edits.** Once you've updated your page, trigger a new Bittlebits score to see how much the metrics improved.
