# Validation Checklist: Joplin MCP & API

Use this to manually confirm the MCP server and non-interactive commands work end-to-end.

## Prerequisites

- Joplin desktop running with Web Clipper enabled.
- Extension settings `token` and `port` set to match Web Clipper (default port 41184).
- VS Code 1.96+ (MCP support).

## MCP server (stdio) validation

1. In VS Code, run `Developer: Inspect MCP Servers` → verify `Joplin Notes` is present.
2. In an agent chat, call `joplin_status` (expect connected: true, version present).
3. Call `joplin_list_notebooks` and confirm expected notebooks appear.
4. Call `joplin_search_notes` with a known term; if a result returns, call `joplin_get_note` on one result.
5. Optionally call `joplin_list_notes_in_notebook` with a known notebook id and spot-check titles.

## Fallback VS Code commands validation

1. Run `joplinNote.api.status` via `vscode.commands.executeCommand` or Command Palette; expect connected: true.
2. Run `joplinNote.api.listNotebooks`; check structure and expected notebooks.
3. Run `joplinNote.api.searchNotes` with a known term; ensure IDs/titles match MCP results.
4. Run `joplinNote.api.getNoteContent` on a known note id; confirm body present.

## Troubleshooting references

If any step fails, see `docs/TROUBLESHOOTING.md` for common fixes. Avoid installing the Joplin CLI; use the provided MCP tools and API commands.
