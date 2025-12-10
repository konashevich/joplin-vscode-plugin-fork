import { config, folderApi, noteApi, searchApi, TypeEnum } from 'joplin-api'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

config.token = process.env.JOPLIN_TOKEN || ''
config.port = process.env.JOPLIN_PORT ? Number(process.env.JOPLIN_PORT) : 41184

const sanitizeName = (name: string): string =>
  name.replace(/[<>:"/\\|?*]/g, '_').trim()

const buildFolderPaths = (
  folders: any[],
): Array<{ id: string; title: string; parentId: string; path: string }> => {
  const results: Array<{
    id: string
    title: string
    parentId: string
    path: string
  }> = []
  const walk = (nodes: any[], parentPath: string = '') => {
    for (const node of nodes) {
      const path = parentPath
        ? `${parentPath}/${sanitizeName(node.title)}`
        : `/${sanitizeName(node.title)}`
      results.push({
        id: node.id,
        title: node.title,
        parentId: node.parent_id || '',
        path,
      })
      if (node.children && node.children.length > 0) {
        walk(node.children, path)
      }
    }
  }
  walk(folders)
  return results
}

const findFolderByTitle = (folders: any[], target: string): any | undefined => {
  for (const f of folders) {
    if (f.title?.toLowerCase() === target.toLowerCase()) {
      return f
    }
    if (f.children) {
      const res = findFolderByTitle(f.children, target)
      if (res) {
        return res
      }
    }
  }
  return undefined
}

const server = new McpServer({ name: 'joplin-mcp-server', version: '1.0.0' })

const statusOutputSchema = z.object({
  connected: z.boolean(),
  error: z.string().optional(),
})
const listNotebooksOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      parentId: z.string(),
      path: z.string(),
    }),
  ),
})
const searchNotesOutputSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), title: z.string(), parentId: z.string() }),
  ),
})
// Use a flat object with optional fields to avoid MCP SDK Zod union issues
const getNoteOutputSchema = z.object({
  success: z.boolean(),
  id: z.string().optional(),
  title: z.string().optional(),
  body: z.string().nullish(),
  parentId: z.string().optional(),
  error: z.string().optional(),
})
const listNotesOutputSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), title: z.string(), parentId: z.string() }),
  ),
})

const requireConfigured = () => {
  if (!config.token || !config.port) {
    throw new Error('Joplin token/port not configured')
  }
}

server.registerTool(
  'joplin_status',
  {
    description: 'Check connectivity to Joplin Web Clipper API',
    inputSchema: z.object({}).strict(),
    outputSchema: statusOutputSchema,
  },
  async () => {
    try {
      requireConfigured()
      await folderApi.listAll()
      return { content: [], structuredContent: { connected: true } }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [],
        structuredContent: { connected: false, error: message },
      }
    }
  },
)

server.registerTool(
  'joplin_list_notebooks',
  {
    description: 'List all Joplin notebooks with paths',
    inputSchema: z.object({}).strict(),
    outputSchema: listNotebooksOutputSchema,
  },
  async () => {
    requireConfigured()
    const folders = await folderApi.listAll()
    return {
      content: [],
      structuredContent: { items: buildFolderPaths(folders) },
    }
  },
)

const searchNotesInput = z.object({
  query: z.string(),
  notebook: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
})

server.registerTool(
  'joplin_search_notes',
  {
    description: 'Search notes by query, optionally scoped to a notebook',
    inputSchema: searchNotesInput,
    outputSchema: searchNotesOutputSchema,
  },
  async (input: z.infer<typeof searchNotesInput>) => {
    const parsed = searchNotesInput.parse(input)
    requireConfigured()
    const { items } = await searchApi.search({
      query: parsed.query,
      type: TypeEnum.Note,
      fields: ['id', 'title', 'parent_id'],
      limit: parsed.limit ?? 20,
      order_by: 'user_updated_time',
      order_dir: 'DESC',
    })

    let notes = items
    if (parsed.notebook) {
      const folders = await folderApi.listAll()
      const target = findFolderByTitle(folders, parsed.notebook)
      if (target) {
        notes = notes.filter((n) => n.parent_id === target.id)
      }
    }

    return {
      content: [],
      structuredContent: {
        items: notes.map((n) => ({
          id: n.id,
          title: n.title,
          parentId: n.parent_id,
        })),
      },
    }
  },
)

const getNoteInput = z.object({ noteId: z.string() })

server.registerTool(
  'joplin_get_note',
  {
    description: 'Get full content of a note by ID',
    inputSchema: getNoteInput,
    outputSchema: getNoteOutputSchema,
  },
  async (input: z.infer<typeof getNoteInput>) => {
    const parsed = getNoteInput.parse(input)
    requireConfigured()
    try {
      const note = await noteApi.get(parsed.noteId, [
        'id',
        'title',
        'body',
        'parent_id',
      ])
      return {
        content: [],
        structuredContent: {
          success: true as const,
          id: note.id,
          title: note.title,
          body: note.body,
          parentId: note.parent_id,
        },
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [], structuredContent: { success: false as const, error: message } }
    }
  },
)

const listNotesInput = z.object({
  notebookId: z.string(),
  limit: z.number().int().positive().max(200).optional(),
})

server.registerTool(
  'joplin_list_notes_in_notebook',
  {
    description: 'List notes in a specific notebook',
    inputSchema: listNotesInput,
    outputSchema: listNotesOutputSchema,
  },
  async (input: z.infer<typeof listNotesInput>) => {
    const parsed = listNotesInput.parse(input)
    requireConfigured()
    const notes = await folderApi.notesByFolderId(parsed.notebookId, [
      'id',
      'title',
      'parent_id',
      'user_updated_time',
    ])
    const sliced = parsed.limit ? notes.slice(0, parsed.limit) : notes
    return {
      content: [],
      structuredContent: {
        items: sliced.map((n) => ({
          id: n.id,
          title: n.title,
          parentId: n.parent_id,
        })),
      },
    }
  },
)

const transport = new StdioServerTransport()

server.connect(transport).catch((err: unknown) => {
  console.error('Failed to start Joplin MCP server', err)
  process.exit(1)
})
