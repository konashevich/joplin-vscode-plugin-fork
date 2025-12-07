# Joplin VS Code Extension: AI Agent Integration Plan

## Problem Statement

When a user asks an AI agent (like Copilot) to "find details of my rockchip NAS in MyPC in Joplin," the agent fails because:

1. **No Joplin CLI installed** — The agent tried `joplin --version`, got "command not found"
2. **Attempted global install** — The agent tried `npm install -g joplin`, which the user canceled
3. **Agent didn't know about the extension** — Despite this extension having a `joplin:/` FileSystemProvider and search functionality, the agent had no awareness of these capabilities
4. **Existing commands are interactive** — The `joplinNote.search` command opens a QuickPick UI, which agents can't drive programmatically

**Root cause:** The extension lacks agent-discoverable, non-interactive APIs that return structured data.

---

## Solution Overview

We will implement a multi-layered approach:

| Layer | Purpose | Benefit |
|-------|---------|---------|
| **MCP Server** | Native tool calling for LLMs | Agent can call `joplin_search`, `joplin_get_note` directly |
| **Non-UI Commands** | Programmatic VS Code commands | Fallback if MCP isn't available; usable by other extensions |
| **Extension-Registered MCP** | Auto-configure MCP on install | Zero-config for users—MCP server appears automatically |

---

## Part 1: Standalone Joplin MCP Server

### 1.1 Overview

Create a standalone MCP server (Node.js/TypeScript) that:
- Connects to Joplin's REST API (same as the extension does)
- Exposes tools for searching, listing, and reading notes
- Can be run locally via `stdio` transport or remotely via `http`

### 1.2 Tools to Implement

| Tool Name | Description | Input | Output |
|-----------|-------------|-------|--------|
| `joplin_status` | Check Joplin connectivity | none | `{ connected: boolean, version?: string, error?: string }` |
| `joplin_list_notebooks` | List all notebooks (folders) | none | `[{ id, title, parent_id, path }]` |
| `joplin_search_notes` | Search notes by query | `{ query: string, notebook?: string, limit?: number }` | `[{ id, title, notebook, snippet }]` |
| `joplin_get_note` | Get full note content | `{ noteId: string }` | `{ id, title, body, notebook, tags, created, updated }` |
| `joplin_list_notes_in_notebook` | List notes in a specific notebook | `{ notebookId: string }` | `[{ id, title, updated }]` |

### 1.3 MCP Server Structure

```
joplin-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Entry point, MCP server setup
│   ├── joplin-client.ts  # Joplin REST API wrapper
│   ├── tools/
│   │   ├── status.ts
│   │   ├── listNotebooks.ts
│   │   ├── searchNotes.ts
│   │   ├── getNote.ts
│   │   └── listNotesInNotebook.ts
│   └── types.ts
└── README.md
```

### 1.4 Configuration

The MCP server reads Joplin connection details from environment variables:

```bash
JOPLIN_TOKEN=your_api_token
JOPLIN_PORT=41184  # default Joplin Web Clipper port
```

### 1.5 Sample Tool Implementation

```typescript
// tools/searchNotes.ts
import { z } from 'zod';
import { joplinClient } from '../joplin-client';

export const searchNotesSchema = z.object({
  query: z.string().describe('Search query (title or body text)'),
  notebook: z.string().optional().describe('Limit search to this notebook name'),
  limit: z.number().default(10).describe('Maximum results to return'),
});

export async function searchNotes(input: z.infer<typeof searchNotesSchema>) {
  const results = await joplinClient.search({
    query: input.query,
    type: 'note',
    fields: ['id', 'title', 'parent_id', 'body'],
    limit: input.limit,
  });

  // Filter by notebook if specified
  let notes = results.items;
  if (input.notebook) {
    const folders = await joplinClient.listFolders();
    const targetFolder = folders.find(f => 
      f.title.toLowerCase() === input.notebook!.toLowerCase()
    );
    if (targetFolder) {
      notes = notes.filter(n => n.parent_id === targetFolder.id);
    }
  }

  return notes.map(note => ({
    id: note.id,
    title: note.title,
    notebook: note.parent_id, // Could resolve to name
    snippet: note.body?.substring(0, 200) + '...',
  }));
}
```

---

## Part 2: Extension-Registered MCP Server (Auto-Configuration)

### 2.1 How It Works

VS Code extensions can programmatically register MCP servers using `vscode.lm.registerMcpServerDefinitionProvider`. When the extension activates, it registers the Joplin MCP server, making it instantly available in Agent mode—**no user configuration required**.

### 2.2 Implementation Steps

#### Step 1: Add to `package.json`

```json
{
  "contributes": {
    "mcpServerDefinitionProviders": [
      {
        "id": "joplin.mcpServer",
        "label": "Joplin Notes MCP Server"
      }
    ]
  }
}
```

#### Step 2: Bundle the MCP Server

Include the standalone MCP server as a bundled dependency or compile it into `out/mcp-server/`.

#### Step 3: Register in `extension.ts`

```typescript
import * as vscode from 'vscode';
import * as path from 'path';

export async function activate(context: vscode.ExtensionContext) {
  // ... existing activation code ...

  // Register MCP Server Definition Provider
  const mcpServerPath = context.asAbsolutePath(path.join('out', 'mcp-server', 'index.js'));
  
  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider('joplin.mcpServer', {
      provideMcpServerDefinitions: async () => {
        // Only provide if Joplin is configured
        if (!appConfig.token) {
          return [];
        }

        return [
          new vscode.McpStdioServerDefinition(
            'Joplin Notes',           // label
            'node',                    // command
            [mcpServerPath],           // args
            {                          // env
              JOPLIN_TOKEN: appConfig.token,
              JOPLIN_PORT: String(appConfig.port),
            }
          ),
        ];
      },
    })
  );
}
```

### 2.3 Benefits

- **Zero configuration** — Users install the extension, and the MCP server appears automatically
- **Inherits extension settings** — Token and port come from existing extension configuration
- **Updates with extension** — MCP server updates when the extension updates
- **Seamless agent integration** — Copilot/agents can immediately use Joplin tools

---

## Part 3: Non-Interactive VS Code Commands (Fallback)

Even without MCP, we should expose programmatic commands that return data (not UI).

### 3.1 Commands to Add

| Command | Input | Output |
|---------|-------|--------|
| `joplinNote.api.status` | none | `{ connected: boolean, error?: string }` |
| `joplinNote.api.listNotebooks` | none | `[{ id, title, path }]` |
| `joplinNote.api.searchNotes` | `{ query: string, limit?: number }` | `[{ id, title, notebook }]` |
| `joplinNote.api.getNoteContent` | `{ noteId: string }` | `{ id, title, body, tags }` |

### 3.2 Implementation

```typescript
// In extension.ts or a new api-commands.ts

registerCommand('joplinNote.api.status', async () => {
  try {
    const ping = await noteApi.ping();
    return { connected: true, version: ping.version };
  } catch (err) {
    return { connected: false, error: String(err) };
  }
});

registerCommand('joplinNote.api.searchNotes', async (args: { query: string; limit?: number }) => {
  const { items } = await searchApi.search({
    query: args.query,
    type: TypeEnum.Note,
    fields: ['id', 'title', 'parent_id'],
    limit: args.limit || 20,
  });
  return items.map(note => ({
    id: note.id,
    title: note.title,
    parentId: note.parent_id,
  }));
});

registerCommand('joplinNote.api.getNoteContent', async (args: { noteId: string }) => {
  const note = await noteApi.get(args.noteId, ['id', 'title', 'body', 'parent_id']);
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    parentId: note.parent_id,
  };
});
```

### 3.3 Declare in `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "joplinNote.api.status",
        "title": "Joplin: Check Connection Status (API)",
        "category": "Joplin API"
      },
      {
        "command": "joplinNote.api.searchNotes",
        "title": "Joplin: Search Notes (API)",
        "category": "Joplin API"
      },
      {
        "command": "joplinNote.api.getNoteContent",
        "title": "Joplin: Get Note Content (API)",
        "category": "Joplin API"
      },
      {
        "command": "joplinNote.api.listNotebooks",
        "title": "Joplin: List Notebooks (API)",
        "category": "Joplin API"
      }
    ]
  }
}
```

---

## Part 4: Instructions File (Mandatory)

### 4.1 Do We Need It?

**Yes — this is mandatory.**

Even with an MCP server, an explicit workspace-level instructions file is required to ensure agents and LLMs that read the repository understand the recommended workflows and constraints for interacting with Joplin in this workspace. The MCP server exposes tools, but the instructions file serves as a short, authoritative policy and guardrail that prevents mistaken fallback behavior (like trying to install a global CLI) and documents preferred usage patterns such as searching `MyPC` notebook first.

### 4.2 Why It's Required

- Guarantees agents prefer the workspace-provided tooling (MCP tools and `joplinNote.api.*`) over ad-hoc local installs.
- Documents required configuration (how to set the Joplin token/port) and remediation steps so agents can surface clear next steps when configuration is missing.
- Provides explicit examples, guardrails and canonical flows so automated agents perform deterministic, safe actions (e.g., avoid long-running or privileged installs).

### 4.3 Implementation (Mandatory)

Add a workspace instruction file at the repository root (required) and include both `joplin.instructions.md` and `.github/copilot-instructions.md` (required) with clear usage guidance and guardrails. Each file must be concise, include the exact MCP tool names and `joplinNote.api.*` command names, show the canonical flow for searching and reading notes, and explicitly forbid agent behavior such as installing the Joplin CLI.

```markdown
# Joplin Integration Instructions

This workspace has the Joplin VS Code extension installed with MCP tools.

## To search or read Joplin notes:

1. Use the `joplin_search_notes` tool with your query
2. Use `joplin_get_note` to read the full content of a specific note
3. Use `joplin_list_notebooks` to see available notebooks

## Do NOT:
- Try to install `joplin` via npm or any package manager
- Use the Joplin CLI (it's not installed)
- Call interactive UI commands like `joplinNote.search`

## Example flow for "find rockchip NAS in MyPC":
1. Call `joplin_search_notes` with query "rockchip NAS" and notebook "MyPC"
2. Call `joplin_get_note` with the returned noteId to get full content
```

---

## Part 5: Implementation Roadmap

### Phase 1: Standalone MCP Server (Week 1-2)

1. [ ] Create `joplin-mcp-server/` directory structure
2. [ ] Implement Joplin REST API client (reuse from extension if possible)
3. [ ] Implement `joplin_status` tool
4. [ ] Implement `joplin_list_notebooks` tool
5. [ ] Implement `joplin_search_notes` tool
6. [ ] Implement `joplin_get_note` tool
7. [ ] Test with VS Code MCP configuration (manual `mcp.json`)
8. [ ] Write README with setup instructions

### Phase 2: Extension-Registered MCP (Week 2-3)

1. [ ] Add `mcpServerDefinitionProviders` to `package.json`
2. [ ] Bundle MCP server into extension output
3. [ ] Implement `registerMcpServerDefinitionProvider` in `extension.ts`
4. [ ] Test auto-registration on extension activation
5. [ ] Handle edge cases (no token configured, Joplin not running)

### Phase 3: Non-Interactive API Commands (Week 3)

1. [ ] Add `joplinNote.api.*` commands to `package.json`
2. [ ] Implement command handlers in extension
3. [ ] Test commands via Command Palette and programmatic invocation

### Phase 4: Polish & Documentation (Week 4)

1. [ ] Update extension README with AI agent usage
2. [ ] Add troubleshooting guide
3. [ ] Add instructions file (MANDATORY) and include templates for workspace and GitHub Copilot instructions
4. [ ] Test end-to-end with Copilot agent mode

---

## Technical Notes

### MCP Transport Options

| Transport | Use Case |
|-----------|----------|
| `stdio` | Local, bundled with extension (recommended) |
| `http` | Remote server, shared across machines |

We'll use **stdio** for the extension-bundled version since it's simpler and inherits the extension's configuration.

### Joplin API Requirements

- Joplin desktop must be running with Web Clipper enabled
- API token must be configured in extension settings
- Default port: 41184

### VS Code API Requirements

The `registerMcpServerDefinitionProvider` API requires:
- VS Code 1.96+ (December 2024)
- The API is currently proposed; may need `enabledApiProposals` in `package.json`

### Error Handling

All tools should return structured errors:

```typescript
{
  success: false,
  error: "Joplin is not running or token is invalid",
  suggestion: "Start Joplin desktop and check extension settings"
}
```

---

## Expected User Experience

### Before (Current State)

```
User: "find details of my rockchip NAS in MyPC in Joplin"

Agent: *runs `joplin --version`* → command not found
Agent: *runs `npm install -g joplin`* → user cancels
Agent: "I couldn't complete the request..."
```

### After (With MCP Server)

```
User: "find details of my rockchip NAS in MyPC in Joplin"

Agent: *calls joplin_search_notes({ query: "rockchip NAS", notebook: "MyPC" })*
       → [{ id: "abc123", title: "Rockchip NAS Setup", ... }]

Agent: *calls joplin_get_note({ noteId: "abc123" })*
       → { title: "Rockchip NAS Setup", body: "## Specs\n- Model: ...", ... }

Agent: "I found your note 'Rockchip NAS Setup' in MyPC. Here are the details:
        - Model: ...
        - IP: ...
        ..."
```

---

## References

- [VS Code MCP Developer Guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [VS Code AI Extensibility Overview](https://code.visualstudio.com/api/extension-guides/ai/ai-extensibility-overview)
- [MCP Extension Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/mcp-extension-sample)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
