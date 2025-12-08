# Troubleshooting: Joplin VS Code MCP/Agent

Use this guide when MCP tools or non-interactive commands fail. Keep Joplin running with Web Clipper enabled.

## Quick checks

- VS Code 1.96+; extension enabled; restart VS Code after changing settings.
- Joplin token/port set in extension settings. Default port is 41184.
- In VS Code: run `Developer: Inspect MCP Servers` and confirm `Joplin Notes` is listed.

## MCP server missing

- Ensure VS Code supports MCP (Insiders/1.96+).
- Check extension activation errors in `Developer: Toggle Developer Tools` → Console.
- Restart VS Code after setting token/port.

## Connection errors (`ECONNREFUSED`, `Unauthorized`)

- Start Joplin desktop and enable Web Clipper (Tools → Options → Web Clipper).
- Verify token/port match Joplin Web Clipper settings; re-enter and restart VS Code.
- Re-run `joplin_status`. If it keeps failing, try from the API commands: `joplinNote.api.status`.

## Tools work, but no results

- Confirm notebook name spelling (case-insensitive). Try `joplin_list_notebooks` first.
- Increase search limit (e.g., `limit: 20`) in `joplin_search_notes`.
- Search without notebook filter to confirm data is reachable.

## Validation steps (manual)

1. `Developer: Inspect MCP Servers` → verify `Joplin Notes`.
2. Call `joplin_status` (expect connected: true).
3. Call `joplin_list_notebooks`.
4. Call `joplin_search_notes` with a known term; then `joplin_get_note` for one result.
5. Call fallback commands: `joplinNote.api.status`, `listNotebooks`, `searchNotes`, `getNoteContent`.

## Do not

- Do not install the Joplin CLI (npm/global) in this workspace.
- Do not call interactive commands like `joplinNote.search`.

## Still stuck?

Capture logs from VS Code Developer Tools Console and note the tool/command used and its parameters.
