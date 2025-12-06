// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import { NoteListProvider } from './model/NoteProvider'
import { JoplinNoteCommandService } from './service/JoplinNoteCommandService'
import { TypeEnum } from 'joplin-api'
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
