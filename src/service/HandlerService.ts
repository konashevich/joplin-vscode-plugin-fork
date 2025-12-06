import * as vscode from 'vscode'
import { TextDocument, Uri } from 'vscode'
import {
  noteActionApi,
  noteApi,
  resourceActionApi,
  resourceApi,
  TypeEnum,
} from 'joplin-api'
import { parse } from 'querystring'
import { JoplinNoteCommandService } from './JoplinNoteCommandService'
import { FolderOrNote } from '../model/FolderOrNote'
import { appConfig } from '../config/AppConfig'
import { BiMultiMap } from '../util/BiMultiMap'
import { JoplinNoteUtil } from '../util/JoplinNoteUtil'
import { OpenFileService } from '../util/OpenFileService'
import { safePromise } from '../util/safePromise'
import { AsyncArray } from '@liuli-util/async'
import path = require('path')
import { i18n } from '../util/I18n'
import { JOPLIN_SCHEME } from '../model/JoplinFileSystemProvider'

/**
 * other service
 */
export class HandlerService {
  constructor(private joplinNoteCommandService: JoplinNoteCommandService) {}

  private readonly openResourceMap = new BiMultiMap<string, string>()

  /**
   * close note watch
   * @param e
   */
  async handleCloseTextDocument(e: TextDocument) {
    console.log('vscode.workspace.onDidCloseTextDocument: ', e)
    const noteId = JoplinNoteUtil.getNoteIdByFileName(e.fileName)
    if (!noteId) {
      return
    }
    console.log('close note: ', noteId)
    // const note = await noteApi.get(noteId)
    await noteActionApi.stopWatching(noteId)
    this.openResourceMap.deleteByKey(noteId)
    const resourceIdList = this.openResourceMap.getByKey(noteId)
    await AsyncArray.forEach(resourceIdList, async (resourceId) => {
      await resourceActionApi.stopWatching(resourceId)
      console.log('resourceActionApi.stopWatching(resourceId): ', resourceId)
    })
    this.openResourceMap.deleteByKey(noteId)
    // vscode.window.showInformationMessage(
    //   i18nLoader.get(
    //     'Turn off monitoring of attachment resources in the note [{{title}}]',
    //     {
    //       title: note.title,
    //     },
    //   ),
    // )
  }

  async uriHandler(uri: Uri) {
    console.log('uriHandler: ', uri)
    const id = parse(uri.query).id as string
    switch (uri.path) {
      case '/open':
        await this.openNote(id)
        break
      case '/resource':
        await this.openResource(id)
        break
      default:
        vscode.window.showErrorMessage(i18n.t('Unprocessable link'))
    }
  }

  private readonly openFileService = new OpenFileService()

  async openResource(id: string) {
    const resource = await safePromise(
      resourceApi.get(id, ['id', 'title', 'filename', 'file_extension']),
    )
    if (!resource) {
      vscode.window.showWarningMessage(i18n.t('Resource does not exist'))
      return
    }
    
    // Use VFS to open the resource - no programProfilePath needed
    const ext = resource.file_extension || 'bin'
    const resourceUri = vscode.Uri.parse(`${JOPLIN_SCHEME}:/_resources/${id}.${ext}`)
    console.log('Opening resource via VFS:', resourceUri.toString())
    
    try {
      // Open the resource in VS Code
      const doc = await vscode.workspace.openTextDocument(resourceUri)
      await vscode.window.showTextDocument(doc)
    } catch (err) {
      console.error('Failed to open resource as text, trying binary viewer:', err)
      // For binary files, try opening with the default editor
      await vscode.commands.executeCommand('vscode.open', resourceUri)
    }
  }

  async openNote(id: string) {
    if (!id) {
      vscode.window.showWarningMessage(i18n.t('id cannot be empty'))
      return
    }
    const item = await safePromise(
      noteApi.get(id, [
        'id',
        'parent_id',
        'title',
        'is_todo',
        'todo_completed',
      ]),
    )
    if (!item) {
      vscode.window.showWarningMessage(i18n.t('Note does not exist'))
      return
    }
    await this.joplinNoteCommandService.openNote(
      new FolderOrNote({
        ...item,
        type_: TypeEnum.Note,
      }) as any,
    )
  }
}
