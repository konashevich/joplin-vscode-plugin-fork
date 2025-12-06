Local fork — joplin-vscode-plugin (workspace copy)
===============================================

This is a workspace-local copy of rxliuli/joplin-vscode-plugin created so you can make changes and experiment without affecting the upstream archive.

Quick start
-----------

1. Open this folder in VS Code:

   File → Open Folder → /mnt/merged_ssd/joplin-vscode-plugin-fork

2. Install dependencies

   Recommended: yarn (the repo includes a yarn.lock)

   ```bash
   cd /mnt/merged_ssd/joplin-vscode-plugin-fork
   yarn install
   ```

3. Build the extension

   ```bash
   yarn run compile
   ```

4. Run in the Extension Development Host (F5 in VS Code)

Tips
----
- You're currently on the `local-fork` branch.
- Use `FORKING_INSTRUCTIONS.md` for guidance on pushing to your GitHub account as a proper remote/fork.
- The upstream repository is archived and read-only; if you plan to publish and maintain changes, create a fork under your account and push to it.

Happy hacking! If you want, I can also create a remote on this clone pointing to your GitHub — tell me the username or the remote URL.
