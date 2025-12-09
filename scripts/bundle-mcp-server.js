const esbuild = require('esbuild')
const path = require('path')

esbuild.build({
  entryPoints: [path.join(__dirname, '../src/mcp-server/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(__dirname, '../out/mcp-server/index.js'),
  format: 'cjs',
  sourcemap: true,
  external: [
    // Keep vscode as external since it's provided by VS Code
    'vscode',
  ],
  // Ensure all dependencies are bundled
  packages: 'bundle',
}).then(() => {
  console.log('MCP server bundled successfully')
}).catch((err) => {
  console.error('Failed to bundle MCP server:', err)
  process.exit(1)
})
