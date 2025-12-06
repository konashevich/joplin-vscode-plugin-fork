FORKING INSTRUCTIONS
===================

This copy was cloned from https://github.com/rxliuli/joplin-vscode-plugin so you can make local edits.

If you'd like to create a GitHub fork under your account and push your changes there, run these steps:

1. On GitHub, click Fork on the original repository page: https://github.com/rxliuli/joplin-vscode-plugin
2. In this directory, add your fork as a new remote (replace <your-user> with your GitHub username):

```bash
git remote add myfork https://github.com/<your-user>/joplin-vscode-plugin.git
```

3. Create a branch for your changes and push it to your fork:

```bash
git checkout -b my-changes
git push myfork my-changes
```

4. Open a Pull Request from your fork to the original repository, or simply continue working on your forked repo.

Notes:
- This repository is archived (read-only) upstream. If you plan to publish your fork, consider renaming or forking to an active repo for ongoing maintenance.
- If you prefer, remove the existing origin remote and add your fork as origin:

```bash
git remote remove origin
git remote add origin https://github.com/<your-user>/joplin-vscode-plugin.git
git push -u origin main
```

Happy hacking!
