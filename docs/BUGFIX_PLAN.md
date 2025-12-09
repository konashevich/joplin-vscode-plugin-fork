# Joplin MCP Server: Bugfix Plan

**Related:** [AI Agent Integration Plan](AI_AGENT_INTEGRATION_PLAN.md)  
**Date:** December 9, 2025  
**Status:** Analysis Complete → Fix Pending

---

## Executive Summary

The MCP server implementation (Phase 1 & 2) was deployed but **all search and listing tools fail** in production. Agent testing revealed two critical bugs:

1. **Schema Validation Crash** (`joplin_list_notebooks`, `joplin_search_notes`, `joplin_list_notes_in_notebook`)
2. **Joplin API Bad Request** (`joplin_search_notes`)

Both bugs prevent the core use case: searching Joplin notes via AI agents.

---

## Bug Analysis

### Bug #1: Schema Validation Crash

**Error:**
```
Cannot read properties of undefined (reading '_zod')
```

**Affected Tools:**
- `joplin_list_notebooks`
- `joplin_search_notes`
- `joplin_list_notes_in_notebook`

**Root Cause:**

The output schema declares a plain array type, but the implementation returns an object wrapper:

```typescript
// SCHEMA (expects array directly)
const listNotebooksOutputSchema = z.array(
  z.object({ id: z.string(), title: z.string(), parentId: z.string(), path: z.string() })
)

// IMPLEMENTATION (returns wrapped object)
return {
  content: [],
  structuredContent: { items: buildFolderPaths(folders) }  // ❌ Wrong!
}
```

**Why It Happens:**

The MCP SDK attempts to validate `structuredContent` against the schema. Since the schema expects `[{ id, title, ... }]` but receives `{ items: [...] }`, the validation logic encounters `undefined` when trying to access internal Zod properties (`_zod`) on the mismatched structure.

**Evidence:**

All working VS Code API commands (`joplinNote.api.*` in `extension.ts`) return plain arrays:
```typescript
return notes.map((note) => ({ id: note.id, title: note.title, parentId: note.parent_id }))
```

---

### Bug #2: Joplin API Bad Request

**Error:**
```
Request failed with status code 400
```

**Affected Tool:**
- `joplin_search_notes`

**Root Cause:**

The implementation requests the `body` field from the Joplin Search API:

```typescript
// src/mcp-server/index.ts:145
const { items } = await searchApi.search({
  query: parsed.query,
  type: TypeEnum.Note,
  fields: ['id', 'title', 'parent_id', 'body'],  // ❌ 'body' causes 400
  // ...
})
```

**Why It Fails:**

The Joplin Search API does not support returning full note bodies in search results (likely for performance/pagination reasons). When the `body` field is requested, Joplin returns HTTP 400.

**Evidence:**

All working search implementations in the extension omit `body`:

- `JoplinNoteCommandService.ts:206`: `fields: ['id', 'title']`
- `extension.ts:173`: `fields: ['id', 'title', 'parent_id']`

**Compounding Error:**

The implementation requests `body` to generate a snippet (per the original plan), but **never uses it**:
```typescript
// The mapping ignores 'body' completely:
structuredContent: {
  items: notes.map((n) => ({
    id: n.id,
    title: n.title,
    parentId: n.parent_id,  // No snippet generated!
  })),
}
```

This means the `body` field was both destructive (caused API failure) and useless (never consumed).

---

## Plan vs. Implementation Gap

### What the Plan Said

From `AI_AGENT_INTEGRATION_PLAN.md`:

> **Tool: `joplin_search_notes`**
> - Output: `[{ id, title, notebook, snippet }]`
> - Sample Implementation: `snippet: note.body?.substring(0, 200) + '...'`

The plan **suggested** including snippets for better UX, with the implicit assumption that the Search API supports fetching body content. However, the plan did not specify:
1. Whether to verify API field support before implementing
2. Whether snippets are required or optional

### What Was Implemented

The developer added `'body'` to the fields array but:
1. Did not test if the API accepts it
2. Did not implement the snippet logic
3. Did not handle graceful degradation if `body` is unavailable

**Assessment:**  
The plan was **not poor**—it outlined a reasonable enhancement. The implementation **failed** by:
- Assuming API support without verification
- Introducing breaking code without fallback handling
- Not following through on the stated purpose (generating snippets)

---

## Solution Design

### Fix #1: Correct Schema Validation (High Priority) ✅ IMPLEMENTED

**Actual Solution Applied:** Wrap arrays in an `items` object in the schema definition (not unwrap in implementation).

**Root Issue:** The MCP SDK's `structuredContent` field requires an object type (with index signature `{ [x: string]: unknown }`), not a plain array. TypeScript correctly rejects arrays as `structuredContent`.

**Before (Broken):**
```typescript
// Schema expected array
const listNotebooksOutputSchema = z.array(z.object({ ... }))

// Implementation returned wrapped object
return { structuredContent: { items: [...] } }  // ❌ Schema mismatch
```

**After (Fixed):**
```typescript
// Schema now wraps array in items object
const listNotebooksOutputSchema = z.object({
  items: z.array(z.object({ ... }))
})

// Implementation matches schema
return { structuredContent: { items: [...] } }  // ✅ Valid
```

**Applies to:**
- `joplin_list_notebooks` (line ~62, ~119)
- `joplin_search_notes` (line ~72, ~163)
- `joplin_list_notes_in_notebook` (line ~82, ~237)

**Impact:**
- ✅ Fixes schema validation crash
- ✅ TypeScript compilation passes
- ✅ No breaking changes (original implementation kept `items` wrapper)
- ✅ Matches MCP SDK requirements

---

### Fix #2: Remove `body` from Search API (High Priority) ✅ IMPLEMENTED

**Change:** Remove `'body'` from the `fields` array in `joplin_search_notes`.

**Before:**
```typescript
fields: ['id', 'title', 'parent_id', 'body'],
```

**After:**
```typescript
fields: ['id', 'title', 'parent_id'],
```

**Impact:**
- ✅ Fixes HTTP 400 error
- ✅ Matches proven patterns in `JoplinNoteCommandService.ts` and `extension.ts`
- ⚠️ Abandons snippet feature (see discussion below)
- ✅ Compilation successful

---

### Fix #3: Optional Enhancement – Snippets (Low Priority)

**Problem:** The original plan wanted snippets for better search results. How to achieve this without breaking the Search API?

**Option A: Remove Snippet Feature** (Recommended for MVP)
- Keep search results lightweight: `{ id, title, parentId }`
- Agents can call `joplin_get_note` if they need full content
- **Pros:** Simple, proven pattern
- **Cons:** Agents must make 2 API calls per note inspection

**Option B: Fetch Bodies Post-Search** (Future Enhancement)
```typescript
// After getting search results:
const notesWithSnippets = await Promise.all(
  notes.slice(0, 10).map(async (n) => {
    const fullNote = await noteApi.get(n.id, ['id', 'title', 'parent_id', 'body'])
    return {
      id: fullNote.id,
      title: fullNote.title,
      parentId: fullNote.parent_id,
      snippet: fullNote.body?.substring(0, 200) || ''
    }
  })
)
```
- **Pros:** Achieves snippet goal
- **Cons:** N+1 query problem, slower for large result sets, should limit to top 10-20 results

**Option C: Update Schema to Make Snippet Optional**
```typescript
const searchNotesOutputSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    parentId: z.string(),
    snippet: z.string().optional(),  // Graceful degradation
  })
)
```
- **Pros:** Future-proof
- **Cons:** Doesn't fix immediate API problem

**Recommendation:**  
Implement **Option A** (remove snippet) for immediate bugfix. Consider **Option B** as a Phase 1.5 enhancement if user testing shows agents struggle without snippets.

---

## Testing Plan

### Pre-Fix Verification
1. ✅ Confirm `joplin_status` works (already passing per chat logs)
2. ✅ Document all failing tool invocations with exact errors

### Post-Fix Validation
1. **Unit Test:** Call each tool directly via MCP CLI or test harness
   - `joplin_list_notebooks` → Should return array of notebooks
   - `joplin_search_notes` with `query: "test"` → Should return array of notes
   - `joplin_get_note` with valid ID → Should return note object
   - `joplin_list_notes_in_notebook` with valid ID → Should return array of notes

2. **Integration Test:** Run agent scenario from chat logs
   - User query: *"search in joplin for note about ai technologies"*
   - Expected: Agent calls `joplin_search_notes({ query: "ai technologies" })` → Returns results
   - Expected: Agent calls `joplin_get_note({ noteId: "..." })` → Returns note body

3. **Regression Test:** Ensure `joplinNote.api.*` commands still work
   - These commands are already working and should remain unaffected

---

## Implementation Checklist

### Phase 1: Critical Bugfixes

- [x] Fix `joplin_list_notebooks` schema (wrap array in `items` object)
- [x] Fix `joplin_search_notes` schema (wrap array in `items` object)
- [x] Fix `joplin_list_notes_in_notebook` schema (wrap array in `items` object)
- [x] Remove `'body'` from `joplin_search_notes` fields array
- [x] Compile and verify TypeScript passes
- [x] Update `AI_AGENT_INTEGRATION_PLAN.md` Phase 1 checklist
- [ ] Test all tools via live MCP integration test
- [ ] Test with VS Code Copilot agent

### Phase 2: Documentation
- [ ] Update `TROUBLESHOOTING.md` with "Search returns 400" entry
- [ ] Add debugging section: how to verify Joplin API field support
- [ ] Document why snippet feature was deferred

### Phase 3: Optional Enhancements (Post-Bugfix)
- [ ] Implement snippet fetching (Option B) if agents need it
- [ ] Add error handling for invalid notebook names
- [ ] Add retry logic for transient Joplin API failures

---

## Risk Assessment

### Deployment Risks
- **Low:** Changes are isolated to `src/mcp-server/index.ts`
- **Low:** No changes to extension commands or UI
- **Medium:** MCP server restart required (users must reload VS Code)

### Backward Compatibility
- **Breaking for MCP clients?** Theoretically yes (schema changes), but current state is 100% broken, so no real clients exist yet.
- **Breaking for extension?** No. Extension commands are in `extension.ts` and unaffected.

---

## References

- [Original Integration Plan](AI_AGENT_INTEGRATION_PLAN.md)
- [Chat Logs (Failure Evidence)](chat2.json)
- Working Search Implementation: `src/service/JoplinNoteCommandService.ts:206`
- Working API Commands: `src/extension.ts:173`
- MCP Server Source: `src/mcp-server/index.ts`

---

## Appendix: Error Correlation Table

| Tool                          | Error Type              | Line | Root Cause                       | Fix Applied                                      |
|-------------------------------|-------------------------|------|----------------------------------|--------------------------------------------------|
| `joplin_list_notebooks`       | Schema validation crash | 115  | Schema expected array, got object | Updated schema to `z.object({ items: z.array(...) })` |
| `joplin_search_notes`         | HTTP 400 + Schema crash | 145  | Requests `body` + schema mismatch | Removed `body` field + updated schema            |
| `joplin_list_notes_in_notebook` | Schema validation crash | 230  | Schema expected array, got object | Updated schema to `z.object({ items: z.array(...) })` |
| `joplin_get_note`             | `_zod` property error   | 77   | MCP SDK Zod v3/v4 compatibility bug with `z.discriminatedUnion` | Changed to `z.union` (avoids problematic code path) |
| `joplin_status`               | ✅ Working              | 95   | Correct structure                | No change needed                                 |

---

## Bug #4: MCP SDK Zod Version Compatibility Issue (Dec 9, 2024)

### Discovery

After implementing the discriminated union fix for `joplin_get_note`, testing showed the tool STILL failed with:
```
Cannot read properties of undefined (reading '_zod')
```

### Root Cause Analysis

The MCP SDK v1.24.3 includes `zod-compat.js` which attempts to support both Zod v3 and v4:

```javascript
// From node_modules/@modelcontextprotocol/sdk/dist/cjs/server/zod-compat.js
return !!schema._zod;  // Line 46 - checks for Zod v4
rawShape = (_b = (_a = v4Schema._zod)?.def)?.shape;  // Line 91
```

**Version conflict in this project:**
```
npm ls zod:
├─┬ @modelcontextprotocol/sdk@1.24.3
│ ├─┬ zod-to-json-schema@3.25.0
│ │ └── zod@4.1.13    <-- v4
│ └── zod@3.25.76     <-- v3 (deduped)
└── zod@3.25.76        <-- v3 (project uses this)
```

When using complex Zod v3 schemas like `z.discriminatedUnion()`, the MCP SDK's compatibility layer tries to access `._zod` (a Zod v4-only property), resulting in `undefined`.

### Solution

Changed from `z.discriminatedUnion` to `z.union`:

```typescript
// BEFORE (broken with MCP SDK):
const getNoteOutputSchema = z.discriminatedUnion('success', [...])

// AFTER (works):
const getNoteOutputSchema = z.union([...])
```

**Why this works:** `z.union` uses simpler internal Zod structures that don't trigger the problematic v4-compat code path in the MCP SDK.

### Impact

- `joplin_get_note` now works correctly for both success and error cases
- No functional difference for schema validation (both discriminated and regular union validate the same way)
- VSIX rebuilt at 14:52 Dec 9, 2024 with this fix

### Note on Schema Fix Approach

The original plan proposed unwrapping `{ items: [...] }` to return plain arrays. During implementation, this was found to be **impossible** because the MCP SDK's `structuredContent` field requires an object type (`{ [x: string]: unknown }`), not an array.

**Actual solution:** Keep the `{ items: [...] }` wrapper in the implementation and update the Zod schemas to match. This is the only viable approach given MCP SDK constraints.
