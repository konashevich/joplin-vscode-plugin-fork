import * as vscode from 'vscode'
import { DocumentLinkProvider, HoverProvider } from 'vscode'
import { matchAll, getReferenceAtPosition } from '../util/utils'
import { isInFencedCodeBlock, isInCodeSpan } from '../util/externalUtils'
import { JoplinLinkRegex, JoplinResourceRegex } from '../util/constant'
import { wrapLink } from '../util/useJoplinLink'
import { TypeEnum, noteApi, resourceApi } from 'joplin-api'
import { formatSize } from '../util/formatSize'
import { JoplinNoteUtil } from '../util/JoplinNoteUtil'
import {
  joplinFileSystemProvider,
  JOPLIN_SCHEME,
} from './JoplinFileSystemProvider'

export class MDDocumentLinkProvider implements DocumentLinkProvider {
  async provideDocumentLinks(document: vscode.TextDocument) {
    const results: vscode.DocumentLink[] = []
    const links: Array<{
      range: vscode.Range
      markdownTokenLink: string
      isImage: boolean
    }> = []

    // First pass: collect all links
    document
      .getText()
      .split(/\r?\n/g)
      .forEach((lineText, lineNum) => {
        // noinspection RegExpRedundantEscape
        for (const match of matchAll(/(!?\[.*\]\()(.+)\)/g, lineText)) {
          const markdownTokenLink = match[2]
          if (markdownTokenLink) {
            const offset = (match.index || 0) + match[1].length

            if (
              isInFencedCodeBlock(document, lineNum) ||
              isInCodeSpan(document, lineNum, offset)
            ) {
              continue
            }

            const linkStart = new vscode.Position(lineNum, offset)
            const linkEnd = new vscode.Position(
              lineNum,
              offset + markdownTokenLink.length,
            )

            const isImage = match[1].startsWith('![')

            links.push({
              range: new vscode.Range(linkStart, linkEnd),
              markdownTokenLink,
              isImage,
            })
          }
        }
      })

    // Second pass: resolve all links (async)
    for (const { range, markdownTokenLink, isImage } of links) {
      let linkUri: vscode.Uri | undefined

      if (JoplinLinkRegex.test(markdownTokenLink)) {
        const id = JoplinLinkRegex.exec(markdownTokenLink)![1]
        linkUri = await this.resolveJoplinId(id, isImage)
      } else if (JoplinResourceRegex.test(markdownTokenLink)) {
        const id = JoplinResourceRegex.exec(markdownTokenLink)![1]
        // Use vscode:// for resources to open them externally
        linkUri = vscode.Uri.parse(wrapLink(id, TypeEnum.Resource))
        console.log('是资源: ', linkUri.toString())
      } else {
        linkUri = vscode.Uri.parse(markdownTokenLink)
        console.log('是普通链接：', linkUri.toString())
      }

      if (linkUri) {
        const documentLink = new vscode.DocumentLink(range, linkUri)
        documentLink.tooltip = 'Follow link'
        results.push(documentLink)
      }
    }

    return results
  }

  private async resolveJoplinId(
    id: string,
    isImage: boolean,
  ): Promise<vscode.Uri | undefined> {
    // First try note
    try {
      const note = await noteApi.get(id, ['id', 'parent_id', 'title'])
      if (note) {
        const noteUri = await joplinFileSystemProvider.getNoteUri(id)
        if (noteUri) {
          console.log('是笔记链接: ', id, '->', noteUri.toString())
          return noteUri
        }
        // fallback to command handler
        const fallback = vscode.Uri.parse(wrapLink(id, TypeEnum.Note))
        console.log('是笔记链接(后备): ', id, '->', fallback.toString())
        return fallback
      }
    } catch (err: any) {
      // If 404, maybe it is a resource
    }

    // Try resource
    try {
      const res = await resourceApi.get(id, ['id'])
      if (res) {
        // For images in markdown and for resource clicks, go through VFS so no programProfilePath is required
        const uri = vscode.Uri.parse(`${JOPLIN_SCHEME}:/_resources/${id}.png`)
        console.log('是资源(图片): ', id, '->', uri.toString())
        return uri
      }
    } catch (err: any) {
      console.error('resolveJoplinId failed for', id, err)
    }

    return undefined
  }
}

export class MDHoverProvider implements HoverProvider {
  async provideHover(document: vscode.TextDocument, position: vscode.Position) {
    const markdownTokenLink = getReferenceAtPosition(document, position)
    if (!markdownTokenLink) {
      return
    }
    let content: string[]
    if (JoplinLinkRegex.test(markdownTokenLink)) {
      const id = JoplinLinkRegex.exec(markdownTokenLink)![1]
      // link = wrapLink(id, TypeEnum.Note)
      const note = await noteApi.get(id)
      const title = note.title
      content = [JoplinNoteUtil.trimTitleStart(title)]
    } else if (JoplinResourceRegex.test(markdownTokenLink)) {
      const id = JoplinResourceRegex.exec(markdownTokenLink)![1]
      const resource = await resourceApi.get(id, ['id', 'title', 'size'])
      content = [resource.title, formatSize(resource.size)]
    } else {
      content = [markdownTokenLink]
    }
    console.log('provideHover: ', content)
    return new vscode.Hover(content)
  }
}
