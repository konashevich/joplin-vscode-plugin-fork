import { JoplinLinkRegex, JoplinResourceRegex } from './constant'
import { appConfig } from '../config/AppConfig'

/**
 * Transform Joplin resource links in markdown to HTTP URLs that can be loaded in the preview
 * This converts:
 *   ![image](:/resourceId)  ->  ![image](http://localhost:port/resources/resourceId/file?token=...)
 *   ![image](resources/resourceId.ext) -> ![image](http://localhost:port/resources/resourceId/file?token=...)
 */
export function transformMarkdownImageLinks(markdownContent: string): string {
  const port = appConfig.port || 41184
  const token = encodeURIComponent(appConfig.token || '')

  // Transform Joplin internal links: ![text](:/resourceId)
  let transformed = markdownContent.replace(
    /!\[([^\]]*)\]\(:\/([\w]{32})\)/g,
    (_match, altText, resourceId) => {
      const httpUrl = `http://localhost:${port}/resources/${resourceId}/file?token=${token}`
      console.log(`[joplin-transform-links] Transformed :/image link: ${resourceId} -> ${httpUrl}`)
      return `![${altText}](${httpUrl})`
    },
  )

  // Transform resources/ links: ![text](resources/resourceId.ext)
  transformed = transformed.replace(
    /!\[([^\]]*)\]\(resources\/([\w]{32})\.(\w+)\)/g,
    (_match, altText, resourceId) => {
      const httpUrl = `http://localhost:${port}/resources/${resourceId}/file?token=${token}`
      console.log(`[joplin-transform-links] Transformed resources/ link: ${resourceId} -> ${httpUrl}`)
      return `![${altText}](${httpUrl})`
    },
  )

  return transformed
}
