# Setup: MCP Servers & Cursor Skills

Use this guide to install the same MCP servers and Cursor skills on another computer so you have the same handy tools when working on this project.

---

## Prerequisites

- **Node.js** (v18+) and **npm** — for `npx` (Context7, Chrome DevTools, Supabase MCP).
- **Python 3** — not required if you only use the npx-based MCPs; required for **Serena** (see below).
- **Cursor** — [cursor.com](https://cursor.com).

---

## 1. MCP Servers

Cursor reads MCP config from:

- **Global (all projects):** `~/.cursor/mcp.json`
- **This project only:** `<this-repo>/.cursor/mcp.json`

Use **global** so these tools are available in every project, or **project** so they only load when this repo is open.

### Option A: Copy the config file

1. Create the config directory if needed:
   ```bash
   mkdir -p ~/.cursor
   ```
2. Create or edit `~/.cursor/mcp.json` with the content below.
3. **Replace placeholders** (see table after the JSON).

**`~/.cursor/mcp.json` (global) or `<repo>/.cursor/mcp.json` (project):**

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"],
      "env": {},
      "transport": "stdio"
    },
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "YOUR_SUPABASE_ACCESS_TOKEN"
      ]
    },
    "serena": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/oraios/serena",
        "serena-mcp-server",
        "--context",
        "ide-assistant"
      ]
    }
  }
}
```

| Placeholder / Item | What to do |
|--------------------|------------|
| `YOUR_SUPABASE_ACCESS_TOKEN` | [Supabase Dashboard](https://supabase.com/dashboard) → Account → Access Tokens → create or copy a token. Paste it here (no quotes). |
| `serena` → `command` | Use `uvx` if it’s on your PATH after installing **uv** (see Serena section). Otherwise use the full path (e.g. `C:\Users\You\AppData\Local\Programs\uv\uvx.exe` on Windows, `/Users/you/.local/bin/uvx` on macOS/Linux). |

### MCP server details

| Server | Purpose | Install note |
|--------|--------|--------------|
| **context7** | Context7 docs/search (Upstash) | Needs Node/npx only. |
| **chrome-devtools** | Browser automation / DevTools | Needs Node/npx only. |
| **supabase** | Supabase project (SQL, migrations, etc.) | Needs Node/npx + your Supabase access token. |
| **serena** | Semantic code search & refactor (LSP-based) | Needs **uv** (and thus `uvx`). See next section. |

### Installing Serena (optional)

Serena runs via **uv**. Install uv, then use `uvx` in the config (or the full path to `uvx`).

**macOS / Linux:**

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Then restart the terminal (or run `source $HOME/.local/bin/env`). Confirm:

```bash
uvx --version
```

If `uvx` is not on PATH, use the full path in `mcp.json`, e.g.:

- macOS/Linux: `"/Users/yourusername/.local/bin/uvx"`
- Windows: `"C:\\Users\\yourusername\\.local\\bin\\uvx.exe"` (or wherever the installer put it)

**Windows (PowerShell):**

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Then use `uvx` or its full path in the Serena `command` in `mcp.json`.

After editing `mcp.json`, **restart Cursor** (or Reload Window) so MCP servers are picked up.

---

## 2. Cursor Skills

Skills live in **`~/.cursor/skills/`** (one folder per skill, each with a `SKILL.md`). This repo keeps a copy so you can install them on any machine.

### Install from this repo

From the **project root** (where `.cursor/skills-snapshot` lives):

```bash
mkdir -p ~/.cursor/skills
cp -r .cursor/skills-snapshot/changelog-generator ~/.cursor/skills/
cp -r .cursor/skills-snapshot/refactoring-specialist ~/.cursor/skills/
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.cursor\skills"
Copy-Item -Recurse -Force ".cursor\skills-snapshot\changelog-generator" "$env:USERPROFILE\.cursor\skills\"
Copy-Item -Recurse -Force ".cursor\skills-snapshot\refactoring-specialist" "$env:USERPROFILE\.cursor\skills\"
```

Restart Cursor (or Reload Window) so the new skills are loaded.

### Skills included

| Skill | What it does |
|-------|----------------|
| **changelog-generator** | Generates user-facing changelogs from git history. Ask e.g. “Update CHANGELOG.md from commits since last release.” |
| **refactoring-specialist** | Guides safe refactors, code smells, and design patterns. Ask e.g. “Refactor this function” or “Review this for code smells.” |

---

## 3. Quick checklist (new computer)

- [ ] Node.js + npm installed (`node -v`, `npm -v`)
- [ ] Create `~/.cursor/mcp.json` (or project `.cursor/mcp.json`) with the JSON above
- [ ] Set `YOUR_SUPABASE_ACCESS_TOKEN` in the Supabase MCP entry
- [ ] (Optional) Install **uv** and set Serena `command` to `uvx` or full path to `uvx`
- [ ] Copy `.cursor/skills-snapshot/*` into `~/.cursor/skills/`
- [ ] Restart Cursor

After that, the same MCP servers and skills will be available on the new machine.
