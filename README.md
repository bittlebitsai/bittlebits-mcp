# Bittlebits MCP Server

A standalone [Model Context Protocol](https://modelcontextprotocol.io) server that brings your [Bittlebits](https://bittlebits.ai) GEO scores and rewrite suggestions directly into AI agents — Claude Code, VS Code Copilot, Cursor, or any MCP-compatible client.

Instead of copying content back and forth, your agent can pull what Bittlebits recommends and apply those changes directly in your codebase.

---

## What you can do

Once connected, ask your agent things like:

- *"Show me what Bittlebits wants to change on this page and explain why."*
- *"Rewrite my homepage copy applying the Bittlebits suggestions."*
- *"Which metrics are weakest and what should I fix first?"*
- *"Get the score for my landing page, then find and update the file in my codebase."*

---

## Setup

### Prerequisites

- Node.js 18+
- A [Bittlebits](https://bittlebits.ai) account
- A Bittlebits API key — find yours at **Settings → API Keys**

### Claude Code (CLI)

```bash
claude mcp add --transport stdio bittlebits -e BITTLEBITS_API_KEY=your_key -- npx bittlebits-mcp
```

### VS Code

Create or update `.vscode/mcp.json` in your project root (or `~/.vscode/mcp.json` for global availability):

```json
{
  "servers": {
    "bittlebits": {
      "type": "stdio",
      "command": "npx",
      "args": ["bittlebits-mcp"],
      "env": {
        "BITTLEBITS_API_KEY": "your_key_here"
      }
    }
  }
}
```

### Cursor / Other MCP clients

Any client that supports stdio transport works. Point it at `npx bittlebits-mcp` with `BITTLEBITS_API_KEY` set in the environment.

---

## Available tools

| Tool | What it does |
|------|-------------|
| `get_score` | Returns GEO metric scores (0–10 per dimension) for a page |
| `get_rewrite` | Returns original and rewritten page content with Bittlebits suggestions applied |
| `get_url_content` | Returns the raw HTML and markdown of a page as fetched by Bittlebits |

All tools accept either a `url` (full page URL) or a `url_id` (Bittlebits internal ID if already known). Results may take a few minutes on first run while Bittlebits processes the page.

---

## Development

```bash
git clone https://github.com/bittlebits/bittlebits-mcp
cd bittlebits-mcp
npm install
npm run dev       # run with tsx (no build step)
npm run build     # compile to dist/
```

---

## Tips

- **Be specific about what to keep.** If brand voice matters, tell your agent: *"Apply the suggestions but keep the casual, conversational tone."*
- **Work section by section** on longer pages — easier to review.
- **Re-score after edits.** Once you've updated your page, trigger a new Bittlebits score to see how much the metrics improved.
