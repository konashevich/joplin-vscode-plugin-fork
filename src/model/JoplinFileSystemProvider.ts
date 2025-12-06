import * as vscode from 'vscode'
import { folderApi, noteApi, resourceApi, TypeEnum, config } from 'joplin-api'
import { FolderListAllRes } from 'joplin-api/dist/modal/FolderListAllRes'
import { treeEach } from '@liuli-util/tree'
import { transformMarkdownImageLinks } from '../util/transformMarkdownLinks'

/**
 * Virtual FileSystem Provider for Joplin notebooks.
 * This makes Joplin folders and notes visible to VS Code's file system API,
 * allowing AI agents and other extensions to discover and read notes.
 *
 * URI scheme: joplin:/
 * Structure:
 *   joplin:/                          - root (lists all notebooks)
 *   joplin:/FolderName                - a notebook folder
 *   joplin:/FolderName/SubFolder      - nested folder
 *   joplin:/FolderName/NoteName.md    - a note (always .md extension)
 */
export class JoplinFileSystemProvider implements vscode.FileSystemProvider {
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this
    ._emitter.event

  // Cache for folder structure
  private folderList: FolderListAllRes[] = []
  private folderMap = new Map<string, FolderListAllRes>()
  private folderPathMap = new Map<string, FolderListAllRes>() // path -> folder
  private folderIdToPath = new Map<string, string>() // id -> path
  private noteCache = new Map<
    string,
    { id: string; title: string; parent_id: string; body?: string }
  >()
  private lastRefresh = 0
  private readonly CACHE_TTL = 5000 // 5 seconds cache

  constructor() {
    // Defer refresh until config (token/port) is available
  }

  /**
   * Refresh the folder/note cache from Joplin
   */
  async refresh(): Promise<void> {
    // Avoid hitting API without valid config
    if (!config.token || !config.port) {
      return
    }

    const now = Date.now()
    if (now - this.lastRefresh < this.CACHE_TTL) {
      return
    }
    this.lastRefresh = now

    try {
      this.folderList = await folderApi.listAll()
      this.folderMap.clear()
      this.folderPathMap.clear()
      this.folderIdToPath.clear()

      // Build path mappings
      const buildPaths = (
        folders: FolderListAllRes[],
        parentPath: string = '',
      ) => {
        for (const folder of folders) {
          const path = parentPath
            ? `${parentPath}/${this.sanitizeName(folder.title)}`
            : `/${this.sanitizeName(folder.title)}`
          this.folderMap.set(folder.id, folder)
          this.folderPathMap.set(path, folder)
          this.folderIdToPath.set(folder.id, path)
          if (folder.children && folder.children.length > 0) {
            buildPaths(folder.children, path)
          }
        }
      }
      buildPaths(this.folderList)
    } catch (err) {
      console.error(
        'JoplinFileSystemProvider: Failed to refresh folder list',
        err,
      )
    }
  }

  /**
   * Get the URI for a specific note
   */
  async getNoteUri(noteId: string): Promise<vscode.Uri | undefined> {
    await this.refresh()

    try {
      // We need to find the note's parent folder to construct the path
      // Since we don't cache all notes, we might need to fetch the note info first
      const note = await noteApi.get(noteId, ['id', 'parent_id', 'title'])
      if (!note) {
        return undefined
      }

      const parentPath = this.folderIdToPath.get(note.parent_id)
      const safeTitle = this.sanitizeName(note.title)
      const notePath = parentPath
        ? `${parentPath}/${safeTitle}.md`
        : `/${safeTitle}.md`

      const uri = vscode.Uri.parse(`${JOPLIN_SCHEME}:${notePath}`)
      return uri
    } catch (err) {
      console.error('Failed to get note URI', noteId, err)
      // As a fallback, return a direct-by-id URI so the link still works
      return vscode.Uri.parse(`${JOPLIN_SCHEME}:/__by_id/${noteId}.md`)
    }
  }

  /**
   * Sanitize folder/note names for use in file paths
   */
  private sanitizeName(name: string): string {
    // Replace characters that are invalid in file paths
    return name.replace(/[<>:"/\\|?*]/g, '_').trim()
  }

  /**
   * Parse a URI path to determine what it points to
   */
  private async parsePath(
    uri: vscode.Uri,
  ): Promise<{
    type: 'root' | 'folder' | 'note' | 'resource' | 'notfound'
    folder?: FolderListAllRes
    noteId?: string
    noteName?: string
    resourceId?: string
  }> {
    await this.refresh()

    // Normalize path: VS Code encodes spaces as %20 in Uri.path; decode to match our stored keys
    const path = decodeURIComponent(uri.path)

    // Root
    if (path === '' || path === '/') {
      return { type: 'root' }
    }

    // Direct note-by-id path fallback: /__by_id/<id>.md
    if (path.startsWith('/__by_id/')) {
      const idPart = path.replace('/__by_id/', '')
      const id = idPart.replace(/\.md$/, '')
      if (this.isNoteId(id)) {
        return { type: 'note', noteId: id, noteName: id }
      }
    }

    // Check for resources
    if (path.startsWith('/_resources/')) {
      const parts = path.split('/')
      if (parts.length >= 3) {
        const resourceId = parts[2].split('.')[0] // Remove extension if any
        return { type: 'resource', resourceId }
      }
    }

    // Check if it's a folder
    const folder = this.folderPathMap.get(path)
    if (folder) {
      return { type: 'folder', folder }
    }

    // Check if it's a note (ends with .md)
    if (path.endsWith('.md')) {
      const parentPath = path.substring(0, path.lastIndexOf('/'))
      const noteName = path.substring(
        path.lastIndexOf('/') + 1,
        path.length - 3,
      ) // remove .md

      const parentFolder =
        parentPath === '' ? null : this.folderPathMap.get(parentPath)

      if (parentFolder || parentPath === '') {
        // Look for note in this folder
        const folderId = parentFolder?.id || ''
        const notes = await this.getNotesInFolder(folderId)
        const note = notes.find((n) => this.sanitizeName(n.title) === noteName)
        if (note) {
          return {
            type: 'note',
            noteId: note.id,
            noteName: note.title,
            folder: parentFolder || undefined,
          }
        }
      }
    }

    // Also check if it might be a folder without finding it (could be a note without .md)
    const parentPath = path.substring(0, path.lastIndexOf('/')) || '/'
    const itemName = path.substring(path.lastIndexOf('/') + 1)
    const parentFolder =
      parentPath === '/' ? null : this.folderPathMap.get(parentPath)

    if (parentFolder || parentPath === '/') {
      const folderId = parentFolder?.id || ''
      const notes = await this.getNotesInFolder(folderId)
      const note = notes.find((n) => this.sanitizeName(n.title) === itemName)
      if (note) {
        return {
          type: 'note',
          noteId: note.id,
          noteName: note.title,
          folder: parentFolder || undefined,
        }
      }
    }

    return { type: 'notfound' }
  }

  private isNoteId(id: string): boolean {
    return /^[A-Za-z0-9]{32}$/.test(id)
  }

  /**
   * Get notes in a folder
   */
  private async getNotesInFolder(
    folderId: string,
  ): Promise<Array<{ id: string; title: string; parent_id: string }>> {
    try {
      if (folderId === '') {
        // Root level notes (notes without a parent folder) - typically none in Joplin
        return []
      }
      const notes = await folderApi.notesByFolderId(folderId, [
        'id',
        'title',
        'parent_id',
      ])
      return notes
    } catch (err) {
      console.error('Failed to get notes in folder', folderId, err)
      return []
    }
  }

  // FileSystemProvider implementation

  watch(
    uri: vscode.Uri,
    options: { recursive: boolean; excludes: string[] },
  ): vscode.Disposable {
    // We don't actually watch for changes from Joplin in real-time
    // but we could implement polling here if needed
    return new vscode.Disposable(() => {})
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const parsed = await this.parsePath(uri)

    switch (parsed.type) {
      case 'root':
      case 'folder':
        return {
          type: vscode.FileType.Directory,
          ctime: 0,
          mtime: Date.now(),
          size: 0,
        }
      case 'note':
      case 'resource':
        return {
          type: vscode.FileType.File,
          ctime: 0,
          mtime: Date.now(),
          size: 0, // Size is unknown without fetching content
        }
      default:
        throw vscode.FileSystemError.FileNotFound(uri)
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const parsed = await this.parsePath(uri)
    const results: [string, vscode.FileType][] = []

    if (parsed.type === 'root') {
      // List all top-level folders
      for (const folder of this.folderList) {
        results.push([
          this.sanitizeName(folder.title),
          vscode.FileType.Directory,
        ])
      }
    } else if (parsed.type === 'folder' && parsed.folder) {
      // List subfolders
      if (parsed.folder.children) {
        for (const child of parsed.folder.children) {
          results.push([
            this.sanitizeName(child.title),
            vscode.FileType.Directory,
          ])
        }
      }
      // List notes in this folder
      const notes = await this.getNotesInFolder(parsed.folder.id)
      for (const note of notes) {
        results.push([
          `${this.sanitizeName(note.title)}.md`,
          vscode.FileType.File,
        ])
      }
    } else {
      throw vscode.FileSystemError.FileNotFound(uri)
    }

    return results
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const parsed = await this.parsePath(uri)

    if (parsed.type === 'resource' && parsed.resourceId) {
      try {
        console.log(
          'Reading resource:',
          parsed.resourceId,
          'from URI:',
          uri.toString(),
        )
        const content = await resourceApi.fileByResourceId(parsed.resourceId)
        console.log('Resource read successfully, size:', content?.length || 0)
        return new Uint8Array(content as any)
      } catch (err) {
        console.error('Failed to read resource', parsed.resourceId, err)
        throw vscode.FileSystemError.FileNotFound(uri)
      }
    }

    if (parsed.type !== 'note' || !parsed.noteId) {
      throw vscode.FileSystemError.FileNotFound(uri)
    }

    try {
      const note = await noteApi.get(parsed.noteId, ['id', 'title', 'body'])
      let content = note.body || ''
      // Transform Joplin resource links to HTTP URLs for markdown preview
      content = transformMarkdownImageLinks(content)
      return new TextEncoder().encode(content)
    } catch (err) {
      console.error('Failed to read note', parsed.noteId, err)
      throw vscode.FileSystemError.FileNotFound(uri)
    }
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    const parsed = await this.parsePath(uri)
    const body = new TextDecoder().decode(content)

    if (parsed.type === 'note' && parsed.noteId) {
      // Update existing note
      try {
        await noteApi.update({ id: parsed.noteId, body })
        this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }])
      } catch (err) {
        console.error('Failed to update note', parsed.noteId, err)
        throw vscode.FileSystemError.NoPermissions(uri)
      }
    } else if (options.create) {
      // Create new note
      const parentPath = uri.path.substring(0, uri.path.lastIndexOf('/'))
      let noteName = uri.path.substring(uri.path.lastIndexOf('/') + 1)
      if (noteName.endsWith('.md')) {
        noteName = noteName.slice(0, -3)
      }

      const parentFolder =
        parentPath === '' || parentPath === '/'
          ? null
          : this.folderPathMap.get(parentPath)
      const parentId = parentFolder?.id || ''

      try {
        await noteApi.create({
          title: noteName,
          body,
          parent_id: parentId,
        })
        this.lastRefresh = 0 // Force refresh on next access
        this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }])
      } catch (err) {
        console.error('Failed to create note', noteName, err)
        throw vscode.FileSystemError.NoPermissions(uri)
      }
    } else {
      throw vscode.FileSystemError.FileNotFound(uri)
    }
  }

  async delete(
    uri: vscode.Uri,
    options: { recursive: boolean },
  ): Promise<void> {
    const parsed = await this.parsePath(uri)

    if (parsed.type === 'note' && parsed.noteId) {
      try {
        await noteApi.remove(parsed.noteId)
        this.lastRefresh = 0 // Force refresh
        this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }])
      } catch (err) {
        console.error('Failed to delete note', parsed.noteId, err)
        throw vscode.FileSystemError.NoPermissions(uri)
      }
    } else if (parsed.type === 'folder' && parsed.folder) {
      try {
        await folderApi.remove(parsed.folder.id)
        this.lastRefresh = 0
        this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }])
      } catch (err) {
        console.error('Failed to delete folder', parsed.folder.id, err)
        throw vscode.FileSystemError.NoPermissions(uri)
      }
    } else {
      throw vscode.FileSystemError.FileNotFound(uri)
    }
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): Promise<void> {
    const parsed = await this.parsePath(oldUri)

    let newName = newUri.path.substring(newUri.path.lastIndexOf('/') + 1)
    if (newName.endsWith('.md')) {
      newName = newName.slice(0, -3)
    }

    if (parsed.type === 'note' && parsed.noteId) {
      try {
        await noteApi.update({ id: parsed.noteId, title: newName })
        this.lastRefresh = 0
        this._emitter.fire([
          { type: vscode.FileChangeType.Deleted, uri: oldUri },
          { type: vscode.FileChangeType.Created, uri: newUri },
        ])
      } catch (err) {
        console.error('Failed to rename note', parsed.noteId, err)
        throw vscode.FileSystemError.NoPermissions(oldUri)
      }
    } else if (parsed.type === 'folder' && parsed.folder) {
      try {
        await folderApi.update({ id: parsed.folder.id, title: newName })
        this.lastRefresh = 0
        this._emitter.fire([
          { type: vscode.FileChangeType.Deleted, uri: oldUri },
          { type: vscode.FileChangeType.Created, uri: newUri },
        ])
      } catch (err) {
        console.error('Failed to rename folder', parsed.folder.id, err)
        throw vscode.FileSystemError.NoPermissions(oldUri)
      }
    } else {
      throw vscode.FileSystemError.FileNotFound(oldUri)
    }
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const parentPath = uri.path.substring(0, uri.path.lastIndexOf('/'))
    const folderName = uri.path.substring(uri.path.lastIndexOf('/') + 1)

    const parentFolder =
      parentPath === '' || parentPath === '/'
        ? null
        : this.folderPathMap.get(parentPath)
    const parentId = parentFolder?.id || ''

    try {
      await folderApi.create({
        title: folderName,
        parent_id: parentId,
      })
      this.lastRefresh = 0
      this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }])
    } catch (err) {
      console.error('Failed to create folder', folderName, err)
      throw vscode.FileSystemError.NoPermissions(uri)
    }
  }

  /**
   * Force a refresh of the file system view
   */
  fireDidChangeFile(uri?: vscode.Uri): void {
    this.lastRefresh = 0
    if (uri) {
      this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }])
    }
  }
}

// Export singleton instance
export const joplinFileSystemProvider = new JoplinFileSystemProvider()

// Export the URI scheme
export const JOPLIN_SCHEME = 'joplin'
