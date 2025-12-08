# Joplin AI Enhanced (Fork)

**Special Feature: AI Agent Visibility**

This is a modified version of the Joplin VS Code plugin designed specifically to make your notes visible to AI coding agents (like GitHub Copilot, Cursor, etc.).

## Why this fork?

Standard Joplin extensions display notes in a custom "Tree View" sidebar. While great for humans, this is invisible to AI agents because they only scan the file system of your workspace.

This fork introduces a **Virtual File System (VFS)** that bridges Joplin and VS Code:

- **AI Visibility:** Maps your Joplin notebooks and notes to a virtual drive (`joplin:/`) that looks like a standard folder structure to VS Code.
- **Full Interaction:** AI agents can **Read**, **Write**, **Create**, and **Delete** notes directly.
- **Workspace Integration:** Adds a command to mount your Joplin notes as a workspace folder.

## How to use with AI

1. Install this extension.
2. Open the Command Palette (`Ctrl+Shift+P`).
3. Run **"Joplin: Add Joplin to Workspace (for AI agents)"**.
4. Your notes will appear in the File Explorer as a folder named "Joplin Notebooks".
5. You can now ask your AI agent questions like "Summarize my notes on React" or "Create a new note about this code snippet".

---

> Migrate to [joplin-utils](https://github.com/rxliuli/joplin-utils/)

# joplin-vscode-plugin

> [English](https://github.com/rxliuli/joplin-vscode-plugin/blob/master/README.md), [简体中文](https://github.com/rxliuli/joplin-vscode-plugin/blob/master/README.ZH_CN.md)  
> [![install](https://img.shields.io/visual-studio-marketplace/i/rxliuli.joplin-vscode-plugin) VSCode Plugin Marketplace](https://marketplace.visualstudio.com/items?itemName=rxliuli.joplin-vscode-plugin)

## Overview

`joplin-vscode-plugin` offers editing and management of Joplin notes with the power and flexibility of VSCode.

Joplin Web Clipper is designed to communicate with browser extensions by sharing Notes, Notebooks, Tags, etc. through a REST web API. `joplin-vscode-plugin` connects to that same REST endpoint to freely make changes to your notes without ever leaving the editor.

> Why does this plugin exist? Read [my motivation](https://rxliuli.com/joplin-vscode-plugin/#/_navbar/other/why) for developing it.
>
> What can it do? The [roadmap](https://rxliuli.com/joplin-vscode-plugin/#/_navbar/other/roadmap) lists both existing and planned features.
>
> Never heard of [Joplin](https://joplinapp.org/)? You're missing out on a great [opensource synchronized note taking app](https://joplinapp.org/).

## Requirements

- Joplin version > v1.4.19
- VSCode version > v1.45.0
- Joplin Web Clipper enabled
- Basic familiarity with using both Joplin and VS Code

## Install Joplin VSCode plugin

Search for "Joplin" in the VSCode Marketplace. Find "joplin-vscode-plugin" and click Install.

![install plugin](https://github.com/rxliuli/joplin-vscode-plugin/blob/master/docs/_media/install-plugin.png?raw=true)

## Configure

To access the Joplin database, we need a connection to the API endpoint opened by Joplin Web Clipper. That means Joplin must be running and Web Clipper must be enabled.

> For help with Web Clipper refer to: [Joplin Web Clipper](https://joplinapp.org/clipper/).

Three settings need attention to get up and running.

`Port`

- Copy the port number from Joplin settings and paste it here. The active port displays when Web Clipper is enabled:  
  **Web Clipper -> Step 1: Enable the clipper service -> Status**

`Token`

- Copy your Authorization token from Joplin settings and paste it here:  
  **Web Clipper -> Advanced options -> Authorization Token**

`Program Profile Path`

This setting is required if you wish to use attachment-related features.

In general, if you are using a portable application, it should be the `. /JoplinProfile` directory, in which you should see the _resources_, _templates_, and _tmp_ directories.

![install plugin](https://github.com/rxliuli/joplin-vscode-plugin/blob/master/docs/_media/joplin-settings.png?raw=true)

## Restart VSCode

Currently configuration edits do not trigger a fresh connection. Simply close VSCode and it should connect to Joplin the next time you start.

---

## Say Hello Joplin

Type the key chord <kbd>Ctrl</kbd>+<kbd>J</kbd> <kbd>Ctrl</kbd>+<kbd>J</kbd> and celebrate. :tada: That hotkey combo activates the _View: Show Joplin_ command, opening the Sidebar to reveal all your Notebooks.

## Usage

All your Notes and Noteboks can be found in the Sidebar. Unfold the Notebooks to see Subnotebooks and Notes beneath.

_Click on a Note to open a working copy in the Editor. Save it to push changes back to Joplin._

You have full access to create, edit, and delete both Notes and Notebooks, at your whim. And it doesn't even stop there. The power is yours now. 🦸‍♀️

> Tip: Explore the results of typing "joplin" in the Command Palette to find out what great features I didn't tell you about.

## Commands and keybindings

VSCode has _a lot_ of keybindings. To avoid constantly clashing with all the built in settings, we laid claim to just one desirable hotekey, <kbd>Ctrl</kbd>+<kbd>J</kbd>, and turned that into the trigger for a key chord.

> Claiming <kbd>Ctrl</kbd>+<kbd>J</kbd> displaced the native binding for `workbench.action.togglePanel` (_View: Toggle Panel_). For your convenience a sane replacement binding is already added at <kbd>Ctrl</kbd>+<kbd>K</kbd> <kbd>Ctrl</kbd>+<kbd>J</kbd>.

Type `Joplin` into the Command Palette (<kbd>Ctrl</kbd>+<kbd>P</kbd>) to see all the new commands available to you. Some of them already have keybindings. Assign new bindings under the <kbd>Ctrl</kbd>+<kbd>J</kbd> namespace to fit your needs.

> You can check the documentation to learn more: [Document website](https://rxliuli.com/joplin-vscode-plugin/)

## AI agents and MCP

This fork bundles a Model Context Protocol (MCP) server plus non-interactive API commands so AI agents can read and search your Joplin notes without extra setup.

- **Auto-registered MCP:** On activation, the extension registers a stdio MCP server. Agents that support MCP (e.g., Copilot Agent mode) should see `Joplin Notes` automatically.
- **Prereqs:** Joplin desktop running, Web Clipper enabled, and the extension settings `token` and `port` set to match Web Clipper. Restart VS Code after configuring.
- **Tools exposed:** `joplin_status`, `joplin_list_notebooks`, `joplin_search_notes`, `joplin_get_note`, and `joplin_list_notes_in_notebook`. Fallback VS Code commands: `joplinNote.api.status`, `joplinNote.api.listNotebooks`, `joplinNote.api.searchNotes`, `joplinNote.api.getNoteContent`.
- **Manual validation steps:** In VS Code, open the Command Palette and run `Developer: Inspect MCP Servers` to confirm the `Joplin Notes` entry. In an agent chat, ask it to run `joplin_status` and `joplin_search_notes` with a test query.
- **Troubleshooting:** If the MCP server is missing, ensure VS Code >= 1.96, the extension is enabled, and `token`/`port` are configured. If a tool returns a connection error, start Joplin and re-run `joplin_status`. Avoid installing the Joplin CLI; use the MCP tools or `joplinNote.api.*` commands instead.
- **More help:** See `docs/TROUBLESHOOTING.md` and `docs/VALIDATION_CHECKLIST.md` for detailed fixes and validation steps.
