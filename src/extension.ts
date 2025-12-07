// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import { NoteListProvider } from './model/NoteProvider'
import { JoplinNoteCommandService } from './service/JoplinNoteCommandService'
import { TypeEnum, noteApi, searchApi, folderApi } from 'joplin-api'
import { appConfig } from './config/AppConfig'
import { HandlerService } from './service/HandlerService'
import { checkJoplinServer } from './util/checkJoplinServer'
import MarkdownIt from 'markdown-it'
import { useJoplinLink } from './util/useJoplinLink'
import { uploadResourceService } from './service/UploadResourceService'
import { MDDocumentLinkProvider, MDHoverProvider } from './model/EditorProvider'
import { globalState } from './state/GlobalState'
import { init } from './init'
import { registerCommand } from './util/registerCommand'
import { ClassUtil } from '@liuli-util/object'
import * as path from 'path'
import {
  joplinFileSystemProvider,
  JOPLIN_SCHEME,
} from './model/JoplinFileSystemProvider'
import { i18n } from './util/I18n'

init()

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
// noinspection JSUnusedLocalSymbols
export async function activate(context: vscode.ExtensionContext) {
  globalState.context = context
  if (!(await checkJoplinServer())) {
    return
  }

  //region register Joplin virtual file system
  // This makes Joplin notebooks visible to VS Code's file system API,
  // allowing AI agents and other extensions to discover and read notes.
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(
      JOPLIN_SCHEME,
      joplinFileSystemProvider,
      {
        isCaseSensitive: true,
        isReadonly: false,
      },
    ),
  )
  //endregion

  const noteListProvider = new NoteListProvider()
  const noteListTreeView = vscode.window.createTreeView('joplin-note', {
    treeDataProvider: noteListProvider,
  })
  const joplinNoteCommandService = ClassUtil.bindMethodThis(
    new JoplinNoteCommandService({
      noteViewProvider: noteListProvider,
      noteListTreeView,
    }),
  )
  joplinNoteCommandService.init(appConfig)
  const handlerService = ClassUtil.bindMethodThis(
    new HandlerService(joplinNoteCommandService),
  )
  joplinNoteCommandService.handlerService = handlerService

  //region register commands

  registerCommand(
    'joplinNote.refreshNoteList',
    noteListProvider.refresh.bind(noteListProvider),
  )
  registerCommand('joplinNote.search', joplinNoteCommandService.search)
  registerCommand('joplinNote.openNote', joplinNoteCommandService.openNote)

  registerCommand('joplinNote.createFolder', (item) =>
    joplinNoteCommandService.create(TypeEnum.Folder, item),
  )
  registerCommand('joplinNote.createNote', (item) =>
    joplinNoteCommandService.create(TypeEnum.Note, item),
  )
  registerCommand('joplinNote.rename', joplinNoteCommandService.rename)
  registerCommand('joplinNote.copyLink', joplinNoteCommandService.copyLink)
  registerCommand('joplinNote.remove', joplinNoteCommandService.remove)
  registerCommand('joplinNote.move', joplinNoteCommandService.move)
  registerCommand('joplinNote.paste', joplinNoteCommandService.paste)
  registerCommand(
    'joplinNote.toggleTodoState',
    joplinNoteCommandService.toggleTodoState,
  )
  registerCommand(
    'joplinNote.createResource',
    joplinNoteCommandService.createResource,
  )
  registerCommand(
    'joplinNote.removeResource',
    joplinNoteCommandService.removeResource,
  )
  registerCommand('joplinNote.manageTags', joplinNoteCommandService.manageTags)
  registerCommand('joplinNote.createTag', joplinNoteCommandService.createTag)
  registerCommand('joplinNote.removeTag', joplinNoteCommandService.removeTag)

  const sanitizeName = (name: string): string =>
    name.replace(/[<>:"/\\|?*]/g, '_').trim()

  const findFolderByTitle = (
    folders: any[],
    target: string,
  ): any | undefined => {
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

  registerCommand('joplinNote.api.status', async () => {
    if (!appConfig.token || !appConfig.port) {
      return { connected: false, error: 'Joplin token/port not configured' }
    }
    try {
      await folderApi.listAll()
      return { connected: true }
    } catch (err: any) {
      return { connected: false, error: String(err?.message || err) }
    }
  })

  registerCommand('joplinNote.api.listNotebooks', async () => {
    const folders = await folderApi.listAll()
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
  })

  registerCommand(
    'joplinNote.api.searchNotes',
    async (args?: { query?: string; notebook?: string; limit?: number }) => {
      const query = args?.query?.trim() || ''
      const limit = args?.limit ?? 20
      const notebook = args?.notebook?.trim()

      const { items } = await searchApi.search({
        query,
        type: TypeEnum.Note,
        fields: ['id', 'title', 'parent_id'],
        limit,
        order_by: 'user_updated_time',
        order_dir: 'DESC',
      })

      let notes = items
      if (notebook) {
        const folders = await folderApi.listAll()
        const target = findFolderByTitle(folders, notebook)
        if (target) {
          notes = notes.filter((n) => n.parent_id === target.id)
        }
      }

      return notes.map((note) => ({
        id: note.id,
        title: note.title,
        parentId: note.parent_id,
      }))
    },
  )

  registerCommand(
    'joplinNote.api.getNoteContent',
    async (args?: { noteId?: string }) => {
      if (!args?.noteId) {
        return { error: 'noteId is required' }
      }
      try {
        const note = await noteApi.get(args.noteId, [
          'id',
          'title',
          'body',
          'parent_id',
        ])
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
  registerCommand('joplinNote.showCurrentlyOpenNote', async () => {
    {
      const activeFileName = vscode.window.activeTextEditor?.document.fileName
      if (!activeFileName) {
        return
      }
      await joplinNoteCommandService.onDidChangeActiveTextEditor(activeFileName)
    }
  })
  vscode.window.onDidChangeActiveTextEditor((e) =>
    joplinNoteCommandService.onDidChangeActiveTextEditor(e?.document.fileName),
  )

  //region register Joplin workspace folder commands
  // Commands to add/remove Joplin as a workspace folder for AI agent visibility
  registerCommand('joplinNote.addToWorkspace', async () => {
    const joplinUri = vscode.Uri.parse(`${JOPLIN_SCHEME}:/`)
    const workspaceFolders = vscode.workspace.workspaceFolders || []

    // Check if already added
    const alreadyAdded = workspaceFolders.some(
      (folder) => folder.uri.scheme === JOPLIN_SCHEME,
    )

    if (alreadyAdded) {
      vscode.window.showInformationMessage(
        i18n.t('Joplin is already in the workspace'),
      )
      return
    }

    // Add Joplin as a workspace folder
    const success = vscode.workspace.updateWorkspaceFolders(
      workspaceFolders.length,
      0,
      { uri: joplinUri, name: 'Joplin Notebooks' },
    )

    if (success) {
      vscode.window.showInformationMessage(
        i18n.t(
          'Joplin notebooks added to workspace. AI agents can now access your notes.',
        ),
      )
    } else {
      vscode.window.showErrorMessage(
        i18n.t('Failed to add Joplin to workspace'),
      )
    }
  })

  registerCommand('joplinNote.removeFromWorkspace', async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders || []

    const joplinFolderIndex = workspaceFolders.findIndex(
      (folder) => folder.uri.scheme === JOPLIN_SCHEME,
    )

    if (joplinFolderIndex === -1) {
      vscode.window.showInformationMessage(
        i18n.t('Joplin is not in the workspace'),
      )
      return
    }

    const success = vscode.workspace.updateWorkspaceFolders(
      joplinFolderIndex,
      1,
    )

    if (success) {
      vscode.window.showInformationMessage(
        i18n.t('Joplin notebooks removed from workspace'),
      )
    } else {
      vscode.window.showErrorMessage(
        i18n.t('Failed to remove Joplin from workspace'),
      )
    }
  })
  //endregion

  //endregion

  //region register MCP server definition provider

  const lm = (vscode as any).lm
  const McpStdioServerDefinition = (vscode as any)
    .McpStdioServerDefinition as
    | undefined
    | (new (
        label: string,
        command: string,
        args?: string[],
        env?: Record<string, string | number | null>,
        version?: string,
      ) => any)

  if (lm?.registerMcpServerDefinitionProvider && McpStdioServerDefinition) {
    const serverScript = context.asAbsolutePath(
      path.join('out', 'mcp-server', 'index.js'),
    )

    const provider = {
      provideMcpServerDefinitions: () => {
        const env: Record<string, string> = {
          JOPLIN_TOKEN: appConfig.token ?? '',
          JOPLIN_PORT: String(appConfig.port ?? 41184),
        }

        return [
          new McpStdioServerDefinition(
            'Joplin Notes MCP Server',
            process.execPath,
            [serverScript],
            env,
            '1',
          ),
        ]
      },
      resolveMcpServerDefinition: async (server: any) => {
        if (!appConfig.token) {
          vscode.window.showWarningMessage(
            i18n.t('Configure the Joplin token to start the MCP server'),
          )
          return undefined
        }

        server.env = {
          ...(server.env || {}),
          JOPLIN_TOKEN: appConfig.token,
          JOPLIN_PORT: String(appConfig.port ?? 41184),
        }

        return server
      },
    }

    context.subscriptions.push(
      lm.registerMcpServerDefinitionProvider('joplin.mcpServer', provider),
    )
  }

  //endregion

  //region register image upload

  registerCommand(
    'joplinNote.uploadImageFromClipboard',
    uploadResourceService.uploadImageFromClipboard.bind(uploadResourceService),
  )
  registerCommand(
    'joplinNote.uploadImageFromExplorer',
    uploadResourceService.uploadImageFromExplorer.bind(uploadResourceService),
  )
  registerCommand(
    'joplinNote.uploadFileFromExplorer',
    uploadResourceService.uploadFileFromExplorer.bind(uploadResourceService),
  )

  //endregion

  //region register other service

  vscode.workspace.onDidCloseTextDocument(
    handlerService.handleCloseTextDocument,
  )
  vscode.window.registerUriHandler({
    handleUri: handlerService.uriHandler,
  })
  const docFilter = {
    language: 'markdown',
  }
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      docFilter,
      new MDDocumentLinkProvider(),
    ),
    vscode.languages.registerHoverProvider(docFilter, new MDHoverProvider()),
  )

  //endregion

  //region register markdown support

  return {
    // Standard VS Code markdown preview API
    extendMarkdownIt(md: MarkdownIt) {
      return md.use(useJoplinLink())
    },
    // markdown-preview-enhanced API
    extendMarkdownItConfig(md: MarkdownIt) {
      return md.use(useJoplinLink())
    },
  }

  //endregion
}

// this method is called when your extension is deactivated
export function deactivate() {}
