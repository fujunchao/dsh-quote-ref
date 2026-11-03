# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-03

### Added

- Select text anywhere in the conversation transcript and insert it into the composer as an
  atomic **quote reference chip**; the composer shows only a short label while the full text
  reaches the model on send.
- Floating `Quote` / `Copy` toolbar anchored to the live selection, with automatic flip below
  when the selection is near the top of the viewport.
- `N conversation quotes` summary row above the composer, driven by the draft's chip
  occurrences.
- Submit-time expansion through an `input-triggers` reference source: each chip serializes to
  a locale-free block quote with its origin turn and role (`【对话引用 · 第 3 轮 · 助手】`).
- Chips survive page reloads and session switches (they persist with the draft), and clicking
  a chip scrolls back to the quoted message.
- Graceful degradation: falls back to an inline block quote when the host does not expose
  `SessionInputShell.insertReference`, and reports `busy` / `empty` / `unavailable` separately.
- Session-scoped selection guard so the embedded subagent transcript never feeds the main
  composer, plus a single-owner rule that keeps exactly one floating bar on screen.
- Zero-build browser bundle (`lib/client.js`), headless test suite (21 assertions), and
  install/uninstall PowerShell scripts with automatic profile backups.

[Unreleased]: https://github.com/fujunchao/dsh-quote-ref/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/fujunchao/dsh-quote-ref/releases/tag/v0.1.0
