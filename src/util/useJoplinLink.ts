import MarkdownIt from 'markdown-it'
import { TypeEnum } from 'joplin-api'
import { JoplinLinkRegex, JoplinResourceRegex } from './constant'
import { appConfig } from '../config/AppConfig'
import { JOPLIN_SCHEME } from '../model/JoplinFileSystemProvider'

export function wrapLink(id: string, type: TypeEnum.Resource | TypeEnum.Note) {
  const q = encodeURIComponent(`id=${id}`)
  // Use the new extension ID
  const extensionId = 'local.joplin-vscode-plugin-ai'
  switch (type) {
    case TypeEnum.Resource:
      return `vscode://${extensionId}/resource?${q}`
    case TypeEnum.Note:
      return `vscode://${extensionId}/open?${q}`
    default:
      throw new Error('无法处理的链接类型')
  }
}

export function useJoplinLink() {
  return function (md: MarkdownIt) {
    // Handle links (<a> tags)
    const defaultLinkRender =
      md.renderer.rules.link_open ||
      function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options)
      }

    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
      for (const attr of ['href', 'data-href']) {
        const aIndex = tokens[idx].attrIndex(attr)
        if (aIndex >= 0) {
          const linkUrl = tokens[idx].attrs![aIndex][1]
          // 匹配 joplin 内部引用链接
          if (JoplinLinkRegex.test(linkUrl)) {
            tokens[idx].attrs![aIndex][1] = wrapLink(
              linkUrl.match(JoplinLinkRegex)![1],
              TypeEnum.Note,
            )
          } else if (JoplinResourceRegex.test(linkUrl)) {
            tokens[idx].attrs![aIndex][1] = wrapLink(
              linkUrl.match(JoplinResourceRegex)![1],
              TypeEnum.Resource,
            )
          }
        }
      }

      // pass token to default renderer.
      return defaultLinkRender(tokens, idx, options, env, self)
    }

    // Handle images (<img> tags)
    const defaultImageRender =
      md.renderer.rules.image ||
      function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options)
      }

    md.renderer.rules.image = function (tokens, idx, options, env, self) {
      const token = tokens[idx]
      const aIndex = token.attrIndex('src')
      if (aIndex >= 0) {
        const src = token.attrs![aIndex][1]
        console.log('[joplin] Processing image src:', src)
        // Check if it's a Joplin resource link (:/id)
        if (JoplinLinkRegex.test(src)) {
          const id = src.match(JoplinLinkRegex)![1]
          // Rewrite to Joplin VFS URL
          const newSrc = `${JOPLIN_SCHEME}:/_resources/${id}.png`
          console.log('[joplin] Rewriting image:', src, '->', newSrc)
          token.attrs![aIndex][1] = newSrc
        } else if (JoplinResourceRegex.test(src)) {
          const id = src.match(JoplinResourceRegex)![1]
          const newSrc = `${JOPLIN_SCHEME}:/_resources/${id}.png`
          console.log('[joplin] Rewriting resource image:', src, '->', newSrc)
          token.attrs![aIndex][1] = newSrc
        }
      }
      return defaultImageRender(tokens, idx, options, env, self)
    }

    return md
  }
}
