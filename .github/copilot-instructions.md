# Joplin Integration Instructions (MANDATORY for Copilot/agents)

Follow these steps for any Joplin-related request in this workspace.

## Canonical flow
1) `joplin_status` (or `joplinNote.api.status`) to check connectivity; if not configured, ask the user to set token/port.
2) `joplin_list_notebooks` (or `joplinNote.api.listNotebooks`) to find the target notebook (e.g., `MyPC`).
3) `joplin_search_notes` with `query` and `notebook`.
4) `joplin_get_note` for the chosen `noteId`.
5) Summarize concisely and include note link/ID.

## DO NOT
- Do not run `npm install -g joplin` or any global installs.
- Do not use the Joplin CLI.
- Do not call interactive UI commands like `joplinNote.search` expecting UI automation.

## If not configured
Prompt the user to provide the Joplin Web Clipper token and port (default 41184) in the extension settings or run the workspace setup command if available.

## Example
"find rockchip NAS in MyPC":
- `joplin_search_notes` with query "rockchip NAS", notebook "MyPC"
- `joplin_get_note` for the match
- Return a short summary + note link/ID

## Opening Notes
To open a note in the VS Code editor:
- Use the `joplinNote.openNote` command with the note ID.
- OR use `vscode.open` command with the `joplin:/...` URI returned by `joplin_get_note` or `joplin_search_notes`.
- DO NOT use `xdg-open` or `open` in the terminal.

