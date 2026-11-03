# dsh-quote-ref

[![CI](https://github.com/fujunchao/dsh-quote-ref/actions/workflows/ci.yml/badge.svg)](https://github.com/fujunchao/dsh-quote-ref/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DeepSeekRuntime-0.2.x-315bff.svg)](https://github.com/deepseek-ai/deepseek-harness)

> Quote what you are reading instead of retyping it.

Select any text in the conversation transcript -- an answer, a reasoning block, an earlier user message --
and drop it into the composer as **one compact chip**. The composer shows only a short label; the quoted
passage travels inside the chip and reaches the model in full when you send.

**中文**：在对话正文里拖选一段文字，直接引用进输入框；输入框只显示一条短标签，发送时自动把原文作为引用块交给模型。
这不是「把全文粘进输入框」，而是 DSH 原生的**原子引用 chip**（与 @文件 / @对话 引用同一套机制）：
它能随草稿持久化、能整块删除、并且由插件决定「界面显示什么」与「模型看到什么」。

---

## Why

Long conversations make you repeat yourself: *the third point in your last answer*, *the paragraph about
the API key*. Copy-pasting the paragraph is noisy, and the input box becomes unreadable.

This plugin puts a **reference** in the input instead of the text: the chip is atomic, the label is short,
and the model still receives the exact passage together with its origin (turn + role).

| Feature | Behaviour |
| --- | --- |
| Select to quote | Drag-select anywhere in the transcript; a floating **Quote / Copy** bar appears next to the selection |
| Short chip | The composer holds one chip labelled with the first 16 characters -- never the whole passage |
| Full text on send | The chip expands to a block quote at submit time, at the chip's position in your draft |
| Several quotes | Insert as many passages as you like; each is its own chip and its own block |
| Survives reloads | Chips persist with the draft, so a page refresh or a session switch keeps them working |
| Undo friendly | Chips are atomic nodes: Backspace removes one whole, Ctrl+Z restores the insert |
| Jump back | Click a chip to scroll to the message it came from |
| Fails soft | If a future DSH drops the chip API, quotes degrade to inline blockquote text instead of breaking the turn |
| Session scoped | The embedded subagent transcript never feeds the main composer; one floating bar at most |

## Requirements

- DeepSeekRuntime desktop **0.2.x** (developed and verified against `0.2.1-rc.5` on Windows 11 x64).
- The desktop app manages its own profile; this plugin installs into `%USERPROFILE%\.dsh\plugins` and adds
  one row to `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`.
- No build step, no npm dependencies, no network calls (unless you opt into `probeUrl`).

## Install

### 1. One command (recommended)

```powershell
git clone https://github.com/fujunchao/dsh-quote-ref.git
cd dsh-quote-ref
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

The script copies the plugin to `%USERPROFILE%\.dsh\plugins\dsh-quote-ref`, backs up
`cordis.patch.yml` to `cordis.patch.yml.bak-before-quote-ref`, appends one `insert` row that points at
the copied `lib/index.js` (so **no `pnpm install` and no `package.json` edit is needed**), validates the
generated block against the shipped `web` profile, and prints the restart instructions.

Options: `-Profile <name>` (default `desktop`), `-SkipValidate`.

### 2. Manual

Copy this folder to `C:\Users\<you>\.dsh\plugins\dsh-quote-ref`, then append to
`C:\Users\<you>\.dsh\profiles\desktop\cordis.patch.yml`:

```yaml
# dsh-quote-ref
- insert:
    - id: quote-ref
      name: 'file:///C:/Users/<you>/.dsh/plugins/dsh-quote-ref/lib/index.js'
      config:
        maxChars: 4000
        includeOrigin: true
```

### 3. As a linked package (same shape as other third-party plugins)

```powershell
# profile package.json -> dependencies:
#   "dsh-quote-ref": "link:C:/Users/<you>/.dsh/plugins/dsh-quote-ref"
cd "$env:USERPROFILE\.dsh\profiles\desktop"
pnpm install            # or: dsh plugin --profile desktop install
# cordis.patch.yml -> name: 'dsh-quote-ref'   (no path)
```

### Activate

Quit DeepSeekRuntime from the tray menu (**Exit**, not `taskkill`) and start it again. After the first
load, editing `lib/client.js` no longer needs a restart: `client-hmr` polls the bundle and hot-swaps it.

### Verify

Open DevTools (**F12**) and run:

```js
__DSH_BOOT__.entries.some(e => e.id === 'dsh-quote-ref')   // true  -> host served the plugin
window.__DSH_QUOTE_REF__?.version                          // '0.1.0' -> browser half is live
```

Then select a sentence in any answer -- the floating bar appears; press **Quote** and a chip lands in the
composer. Send it and the message shows the expanded quote block.

## What the model sees

Each chip is replaced, at submit time, by a block quote carrying the origin of the passage:

```text
【对话引用 · 第 3 轮 · 助手】
> 安装完成并验证通过。过程如下：
> 1. 安装：用项目自带的 scripts/install_blender_addon.py …
```

The block is inserted exactly where the chip sat in your draft, so `chip + your question` becomes
`quote block + your question`. The header is deliberately **locale-free** (it never changes when the UI
language changes), which keeps prompt caches stable. Set `includeOrigin: false` to drop the
「第 N 轮 · 助手」 suffix.

## Configuration

All keys are optional, under the `config:` block of the profile row:

| Key | Default | Meaning |
| --- | --- | --- |
| `maxChars` | `4000` | Maximum characters of one quoted passage sent to the model (200-40000); longer text is truncated. Chips live in `localStorage`, so keep this modest |
| `includeOrigin` | `true` | Append 「第 N 轮 · 用户/助手」 to the quote header |
| `probeUrl` | `""` | Diagnostics only: when set, the browser half sends one GET beacon on load |

## How it works

The plugin reuses DSH's own reference-chip machinery -- the same one `@file` and `@session` mentions use:

| Step | Mechanism |
| --- | --- |
| Selection | Document-level `mouseup` / `selectionchange` (rAF-debounced), scoped to `[data-conversation-content]` and filtered by `data-conversation-session` |
| Floating bar | `react-dom.createPortal` into `document.body`, `position: fixed`, z-index 1100, hidden while a painted `aria-modal` dialog is open |
| Chip insert | `ctx.get('conversation').input.shell(sessionId).insertReference(chip, shell.actions.captureInsertion())` -- the same entry the `@` pick path uses |
| UI seat | A list entry on `conversation.input.dock` (order 30, after todo 0 / goal 10 / queue 20) |
| Serialization | `ctx.inputTriggers.registerSource({ trigger: '@', name: 'quote-ref', ..., codec: { serialize(ref) } })`; the submit pipeline routes each chip by `chip.source` |
| Summary row | `useInput(s => s.occurrences)` filtered by `source === 'quote-ref'` |

Two of those interfaces are **not documented** in DSH (see *Known limitations*), everything else is public
service surface. The bundle is hand-written classic JavaScript (`window.__ModuleLoader__.load({ id, factory })`),
so there is no build step and no bundler in the loop.

## Development

```powershell
node --test                # 21 headless assertions, no browser needed
```

The suite stubs the platform seed modules (`react`, `react-dom`, `dsh-client-ui-primitives`) and a minimal
cordis context, then exercises the pieces that do not need a live browser: source registration, the
submit-time codec, chip construction, the insertion path plus its degraded form, the selection reader
(including the cross-session guard), and zh/en locale key parity.

Layout:

```text
lib/index.js     host-side stub (a Loader row must be importable; the empty apply is intentional)
lib/client.js    the whole browser plugin (source, dock entry, toolbar, codec, i18n, styles)
scripts/         install.ps1 / uninstall.ps1 (idempotent, backed up, path-discovering)
test/            node --test suite for the bundle
```

## Known limitations

- **Two undocumented hooks**: `SessionInputShell.insertReference` and `InputState.occurrences` exist in the
  shipped bundle but not in the published READMEs. If a future DSH renames them, quoting degrades to inline
  blockquote text and the summary row disappears -- the turn still sends.
- **Transcript shows the expanded block**: sent messages contain the serialized quote (the framework
  serializes before it records history), so only the composer shows the short chip.
- **Cross-message selections** are quoted as one passage; the origin label is taken from the first row.
- **Debug handle**: `window.__DSH_QUOTE_REF__` is exposed for manual verification and troubleshooting.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall.ps1
```

It restores `cordis.patch.yml` from the backup (or strips the generated block), renames the plugin folder
to `*.bak-<timestamp>`, and reminds you to restart. Remove any leftover quote chip from an old draft first:
with the plugin gone, the framework cannot find its codec and would refuse that send.

## Credits

Built against the DeepSeekRuntime client architecture: the `@file` / `@session` reference source in
`@deepseek-ai/dsh-client-ui-reference` was the reference implementation for the codec and chip shape, and
`@deepseek-ai/dsh-client-ui-conversation` owns the composer, the chip node, and the submit pipeline.

## License

[MIT](LICENSE) (c) 2026 Fu Junchao
