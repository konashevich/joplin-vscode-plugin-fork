import { config, folderApi, noteApi, searchApi, TypeEnum } from 'joplin-api'
import { Server } from '@modelcontextprotocol/sdk/server'
import { z } from 'zod'

config.token = process.env.JOPLIN_TOKEN || ''
config.port = process.env.JOPLIN_PORT ? Number(process.env.JOPLIN_PORT) : undefined

const sanitizeName = (name: string): string => name.replace(/[<>:"/\\|?*]/g, '_').trim()

const buildFolderPaths = (folders: any[]): Array<{ id: string; title: string; parentId: string; path: string }> => {
  const results: Array<{ id: string; title: string; parentId: string; path: string }> = []
  const walk = (nodes: any[], parentPath: string = '') => {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath}/${sanitizeName(node.title)}` : `/${sanitizeName(node.title)}`
      results.push({ id: node.id, title: node.title, parentId: node.parent_id || '', path })
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

const server = new Server({ name: 'joplin-mcp-server' })

const requireConfigured = () => {
  if (!config.token || !config.port) {
    throw new Error('Joplin token/port not configured')
  }
}

server.tool(
  {
    name: 'joplin_status',
    description: 'Check connectivity to Joplin Web Clipper API',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  async () => {
    try {
      requireConfigured()
      await folderApi.listAll()
      return { connected: true }
    } catch (err: any) {
      return { connected: false, error: String(err?.message || err) }
    }
  },
)

server.tool(
  {
    name: 'joplin_list_notebooks',
    description: 'List all Joplin notebooks with paths',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  async () => {
    requireConfigured()
    const folders = await folderApi.listAll()
    return buildFolderPaths(folders)
  },
)

const searchNotesInput = z.object({
  query: z.string(),
  notebook: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
})

server.tool(
  {
    name: 'joplin_search_notes',
    description: 'Search notes by query, optionally scoped to a notebook',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        notebook: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  async (input) => {
    const parsed = searchNotesInput.parse(input)
    requireConfigured()
    const { items } = await searchApi.search({
      query: parsed.query,
      type: TypeEnum.Note,
      fields: ['id', 'title', 'parent_id', 'body'],
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

    return notes.map((n) => ({ id: n.id, title: n.title, parentId: n.parent_id }))
  },
)

const getNoteInput = z.object({ noteId: z.string() })

server.tool(
  {
    name: 'joplin_get_note',
    description: 'Get full content of a note by ID',
    inputSchema: {
      type: 'object',
      properties: { noteId: { type: 'string' } },
      required: ['noteId'],
    },
  },
  async (input) => {
    const parsed = getNoteInput.parse(input)
    requireConfigured()
    try {
      const note = await noteApi.get(parsed.noteId, ['id', 'title', 'body', 'parent_id'])
      return {
        id: note.id,
        title: note.title,
        body: note.body,
        parentId: note.parent_id,
      }
    } catch (err: any) {
      return { error: String(err?.message || err) }
    }
  },
)

const listNotesInput = z.object({ notebookId: z.string(), limit: z.number().int().positive().max(200).optional() })

server.tool(
  {
    name: 'joplin_list_notes_in_notebook',
    description: 'List notes in a specific notebook',
    inputSchema: {
      type: 'object',
      properties: {
        notebookId: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['notebookId'],
    },
  },
  async (input) => {
    const parsed = listNotesInput.parse(input)
    requireConfigured()
    const notes = await folderApi.notesByFolderId(parsed.notebookId, [
      'id',
      'title',
      'parent_id',
      'user_updated_time',
    ])
    const sliced = parsed.limit ? notes.slice(0, parsed.limit) : notes
    return sliced.map((n) => ({ id: n.id, title: n.title, parentId: n.parent_id }))
  },
)

server.start().catch((err) => {
  console.error('Failed to start Joplin MCP server', err)
  process.exit(1)
})
