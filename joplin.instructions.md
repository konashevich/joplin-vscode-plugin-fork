# Joplin Integration Instructions (MANDATORY)

This workspace includes the Joplin VS Code extension and an embedded MCP strategy. Agents and automated tools **must** follow these rules before performing any Joplin-related actions.

## Canonical flow to search, read, or open notes

1) Call `joplin_status` (or `joplinNote.api.status`) to check connectivity. If not connected, report and ask the user to configure the Joplin token/port in the extension settings.
2) Call `joplin_list_notebooks` (or `joplinNote.api.listNotebooks`) to locate the target notebook (e.g., `MyPC`).
3) Call `joplin_search_notes` with `query` and `notebook` (e.g., `query: "rockchip NAS", notebook: "MyPC"`).
4) If results are returned, call `joplin_get_note` with the chosen `noteId` to fetch the full content.
5) To **OPEN** the note in the editor, call `joplin_open_note` with the `noteId`.
6) Summarize concisely and include a link/ID to the note.

## Strict DO NOTs (guardrails)

- DO NOT run `npm install -g joplin` or attempt global installs.
- DO NOT use the Joplin CLI; it is not provided here.
- DO NOT call interactive UI commands like `joplinNote.search` expecting UI control.
- DO NOT attempt to use `vscode.open` or `joplinNote.openNote` directly; use the MCP tool `joplin_open_note`.

## Configuration hints for agents

- If `joplin_status` reports not configured, instruct the user to provide token/port in the extension settings (Joplin Web Clipper token, default port 41184) or run the workspace setup command if available.

## Example: "find rockchip NAS in MyPC"

1) `joplin_search_notes` with query "rockchip NAS" and notebook "MyPC".
2) `joplin_get_note` for the selected noteId.
3) `joplin_open_note` to display it to the user.
4) Return a short summary plus the note link/ID.
