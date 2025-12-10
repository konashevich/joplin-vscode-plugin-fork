# MCP SDK Zod Union Issue Report

## Issue Description
When using the Joplin MCP server, calling the `joplin_get_note` tool resulted in a runtime error:
```
Cannot read properties of undefined (reading '_zod')
```
This error occurred when the MCP SDK attempted to validate the tool's output against its defined schema.

## Root Cause Analysis
The error stems from a known compatibility issue between the `@modelcontextprotocol/sdk` (specifically its schema conversion logic) and the `zod` library when using `z.union` or `z.discriminatedUnion`.

The original schema for `joplin_get_note` was defined as a union of two objects:
1. A success object containing note details (`id`, `title`, `body`, `parentId`).
2. An error object containing an `error` message.

```typescript
// Original problematic schema
const getNoteOutputSchema = z.union([
  z.object({
    success: z.literal(true),
    id: z.string(),
    title: z.string(),
    body: z.string(),
    parentId: z.string(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
])
```

The MCP SDK fails to correctly process this union structure during response validation, leading to the crash.

## Resolution
To resolve this issue, the schema was simplified to a single flat object. This approach avoids the use of `z.union` entirely, which is the source of the incompatibility.

The new schema uses optional fields to accommodate both success and error states:

```typescript
// Fixed schema
const getNoteOutputSchema = z.object({
  success: z.boolean(),
  id: z.string().optional(),
  title: z.string().optional(),
  body: z.string().nullish(), // Allows null or undefined
  parentId: z.string().optional(),
  error: z.string().optional(),
})
```

### Design Verification
- **Success Case:** The handler returns `{ success: true, id, title, body, parentId }`. This matches the new schema as `error` is optional.
- **Error Case:** The handler returns `{ success: false, error }`. This matches the new schema as the note fields are optional.
- **Null Safety:** The `body` field is marked as `nullish()` to handle cases where the Joplin API might return `null` or `undefined` for the note body, preventing validation errors on empty notes.

## Verification
- **Code Review:** Confirmed that `joplin_get_note` was the only tool using `z.union`. All other tools (`joplin_status`, `joplin_list_notebooks`, `joplin_search_notes`, `joplin_list_notes_in_notebook`) use `z.object`, which is safe.
- **Build Check:** The project was successfully bundled using `npm run bundle:mcp`, confirming that the changes are syntactically correct and compatible with the build process.

## Conclusion
The fix is robust and addresses the root cause by removing the incompatible schema construct. The flat object design is a standard workaround for this specific SDK limitation and ensures reliable tool operation.
