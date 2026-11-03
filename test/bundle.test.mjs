/*
 * Headless harness for the dsh-quote-ref browser bundle.
 *
 * The bundle is a classic script that only registers a factory on window.__ModuleLoader__.
 * This harness stubs the platform seed modules and a minimal cordis context, then exercises
 * the pieces that do not need a live browser: source registration, the submit-time codec,
 * chip construction, the insertion path (primary + degraded), and the DOM selection reader.
 */
import assert from "node:assert/strict";
import fs from "node:fs";

const BUNDLE = new URL("../lib/client.js", import.meta.url);

function stubReact() {
  const react = {
    Fragment: { __fragment: true },
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    },
    useState(initial) { return [typeof initial === "function" ? initial() : initial, function () {}]; },
    useEffect() {},
    useRef(value) { return { current: value }; },
    useMemo(factory) { return factory(); },
    useCallback(fn) { return fn; },
  };
  return react;
}

function loadBundle() {
  const source = fs.readFileSync(BUNDLE, "utf8");
  let registration = null;
  const win = {
    __ModuleLoader__: {
      load(entry) { registration = entry; },
    },
  };
  const requireShim = (specifier) => {
    if (specifier === "react") return stubReact();
    if (specifier === "react-dom") return { createPortal: (child) => child };
    if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return { writeClipboard: () => Promise.resolve(true) };
    throw new Error("unexpected require: " + specifier);
  };
  const runner = new Function("window", "document", "fetch", "requestAnimationFrame", "cancelAnimationFrame", source);
  runner(win, undefined, undefined, () => 0, () => {});
  assert.ok(registration, "bundle must register a factory on window.__ModuleLoader__");
  assert.equal(registration.id, "dsh-quote-ref");
  const exports = registration.factory(requireShim);
  return { exports, test: exports.__test };
}

function interpolate(dict, key, params) {
  const template = dict[key];
  if (template === undefined) throw new Error("missing locale key: " + key);
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole));
}

function makeCtx(services = {}) {
  const record = { effects: [], sources: [], slots: [], dictionaries: {}, injected: null, shell: null };
  const ctx = {
    effect(fn, label) {
      const dispose = fn();
      record.effects.push({ label, dispose });
      return dispose;
    },
    locale: {
      register(namespace, dictionaries) {
        record.dictionaries[namespace] = dictionaries;
        return () => {};
      },
      bind(namespace) {
        return (key, params) => interpolate(record.dictionaries[namespace].zh, key, params);
      },
    },
    inputTriggers: {
      registerSource(source) {
        record.sources.push(source);
        return () => {};
      },
    },
    slots: {
      inject(name, factory) {
        record.injected = name;
        return factory();
      },
      register(options, component) {
        record.slots.push({ options, component });
        return () => {};
      },
    },
    get(name) { return services[name]; },
  };
  return { ctx, record };
}

function makeShell(overrides = {}) {
  const calls = [];
  const shell = {
    calls,
    snapshot: { draft: "", draftRev: 3, phase: "plain", occurrences: [] },
    actions: {
      captureInsertion() { return { start: 0, end: 0, draftRev: 3 }; },
      insertText(text, span) { calls.push({ kind: "insertText", text, span }); return true; },
    },
    insertReference(chip, span) { calls.push({ kind: "insertReference", chip, span }); return true; },
    notify(level, message) { calls.push({ kind: "notify", level, message }); },
    ...overrides,
  };
  return shell;
}

const { test } = await import("node:test");
const { exports: bundleExports, test: api } = loadBundle();

test("bundle exports the cordis plugin shape", () => {
  assert.equal(typeof bundleExports.apply, "function");
  assert.deepEqual(bundleExports.inject, ["slots", "locale", "inputTriggers", "conversation", "sessions"]);
});

test("apply registers the reference source and the composer dock", () => {
  const shell = makeShell();
  const { ctx, record } = makeCtx({
    conversation: { input: { shell() { return shell; } } },
    sessions: { scope() { return undefined; } },
  });
  bundleExports.apply(ctx, undefined);

  assert.equal(record.sources.length, 1, "one input-triggers source");
  const source = record.sources[0];
  assert.equal(source.name, "quote-ref");
  assert.equal(source.trigger, "@");
  assert.equal(typeof source.candidates, "function");
  assert.equal(typeof source.codec.serialize, "function");

  assert.equal(record.injected, "conversation.input.dock");
  assert.equal(record.slots.length, 1, "one dock entry");
  const entry = record.slots[0];
  assert.equal(entry.options.name, "conversation.input.dock");
  assert.equal(entry.options.id, "quote-ref");
  assert.equal(entry.options.order, 30);
  assert.equal(entry.options.locale, "quote-ref");
  const injected = entry.options.inject("session-1");
  assert.equal(typeof injected.insertQuote, "function");
  assert.equal(typeof injected.warn, "function");
  assert.equal(record.dictionaries["quote-ref"] !== undefined, true);
});

test("candidates stay empty so the @ menu shows no quote rows", async () => {
  const { ctx, record } = makeCtx({});
  bundleExports.apply(ctx, undefined);
  const rows = await record.sources[0].candidates();
  assert.deepEqual(rows, []);
});

test("codec.serialize expands a chip ref into the model-facing quote block", async () => {
  const { ctx, record } = makeCtx({});
  bundleExports.apply(ctx, undefined);
  const ref = api.encodeQuote({ text: "第一行\n第二行", turn: 3, role: "assistant" });
  const text = await record.sources[0].codec.serialize(ref);
  assert.equal(text, "\n\n【对话引用 · 第 3 轮 · 助手】\n> 第一行\n> 第二行\n\n");
});

test("codec.serialize degrades to plain text for a non-JSON ref", async () => {
  const { ctx, record } = makeCtx({});
  bundleExports.apply(ctx, undefined);
  const text = await record.sources[0].codec.serialize("裸文本");
  assert.equal(text, "\n\n【对话引用】\n> 裸文本\n\n");
});

test("maxChars truncates the model-facing text only", async () => {
  const { ctx, record } = makeCtx({});
  bundleExports.apply(ctx, { maxChars: 240, includeOrigin: false });
  const long = "x".repeat(500);
  const text = await record.sources[0].codec.serialize(api.encodeQuote({ text: long }));
  assert.equal(text, "\n\n【对话引用】\n> " + "x".repeat(240) + "\u2026\n\n");
});

test("the chip label stays short and never carries the body", () => {
  const label = api.labelFor({ text: "一二三四五六七八九十一二三四五六七八九十" }, (key) => key);
  assert.equal(label, "一二三四五六七八九十一二三四五六…");
  assert.equal(api.labelFor({ text: "   " }, (key) => key), "label.empty");
});

test("chip payload uses the shipped field set and a session glyph", () => {
  const chip = api.buildChip({ text: "正文", turn: 2, role: "user" }, { maxChars: 8000, includeOrigin: true }, (key) => key);
  assert.equal(chip.source, "quote-ref");
  assert.equal(chip.appearance, "session");
  assert.equal(chip.clipboardText, chip.label);
  assert.ok(chip.clipboardText.length > 0);
  const decoded = api.readQuote(chip.ref);
  assert.equal(decoded.text, "正文");
  assert.equal(decoded.turn, 2);
  assert.equal(decoded.role, "user");
});

test("insert uses the reference-chip path when the shell exposes it", () => {
  const shell = makeShell();
  const { ctx, record } = makeCtx({ conversation: { input: { shell() { return shell; } } } });
  bundleExports.apply(ctx, undefined);
  const injected = record.slots[0].options.inject("session-1");
  assert.equal(injected.insertQuote({ text: "选中内容", turn: 4, role: "assistant" }), "ok");
  assert.equal(shell.calls.length, 1);
  assert.equal(shell.calls[0].kind, "insertReference");
  assert.equal(shell.calls[0].chip.source, "quote-ref");
  assert.equal(shell.calls[0].chip.label, "选中内容");
  assert.equal(api.readQuote(shell.calls[0].chip.ref).text, "选中内容");
  assert.deepEqual(shell.calls[0].span, { start: 0, end: 0, draftRev: 3 });
});

test("insert degrades to quoted plain text when insertReference is unavailable", () => {
  const shell = makeShell({ insertReference: undefined });
  const { ctx, record } = makeCtx({ conversation: { input: { shell() { return shell; } } } });
  bundleExports.apply(ctx, undefined);
  const injected = record.slots[0].options.inject("session-1");
  assert.equal(injected.insertQuote({ text: "甲乙", turn: 1 }), "ok");
  assert.equal(shell.calls[0].kind, "insertText");
  assert.equal(shell.calls[0].text, "\n> 甲乙\n");
});

test("insert returns false when no shell exists for the session", () => {
  const { ctx, record } = makeCtx({ conversation: { input: { shell() { return undefined; } } } });
  bundleExports.apply(ctx, undefined);
  const injected = record.slots[0].options.inject("session-x");
  assert.equal(injected.insertQuote({ text: "x" }), "unavailable");
});

test("empty selections are never inserted", () => {
  const shell = makeShell();
  const { ctx, record } = makeCtx({ conversation: { input: { shell() { return shell; } } } });
  bundleExports.apply(ctx, undefined);
  const injected = record.slots[0].options.inject("session-1");
  assert.equal(injected.insertQuote({ text: "   " }), "empty");
  assert.equal(shell.calls.length, 0);
});

function fakeDom({ text, session = "session-1", startInTranscript = true, endInTranscript = true, inComposer = false }) {
  const mk = (attrs, tag) => ({
    nodeType: 1,
    tagName: tag,
    attrs,
    closest(selector) {
      const name = selector.replace(/^\[|\]$/g, "");
      if (name === "data-conversation-content") return attrs[TRANSCRIPT] ? this : null;
      if (name === "data-chat-flow-key") return attrs[ROW] ? this : null;
      if (name === "data-composer-card") return attrs[COMPOSER] ? this : null;
      return null;
    },
    getAttribute(name) { return attrs[name] === undefined ? null : attrs[name]; },
  });
  const TRANSCRIPT = "data-conversation-content";
  const ROW = "data-chat-flow-key";
  const COMPOSER = "data-composer-card";
  const row = mk({
    [TRANSCRIPT]: startInTranscript ? "1" : undefined,
    "data-conversation-session": session,
    [ROW]: "row-1",
    [COMPOSER]: inComposer ? "1" : undefined,
    "data-chat-turn": "4",
    "data-chat-flow-kind": "assistant-step",
    "data-chat-node-key": "node-7",
  }, "div");
  if (!endInTranscript) row.attrs[TRANSCRIPT] = undefined;
  const range = {
    startContainer: row,
    endContainer: row,
    getClientRects() { return [{ left: 10, top: 100, right: 210, bottom: 120, width: 200, height: 20 }]; },
    getBoundingClientRect() { return { left: 10, top: 100, right: 210, bottom: 120, width: 200, height: 20 }; },
  };
  const win = {
    innerWidth: 1200,
    getSelection() {
      return {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt() { return range; },
        toString() { return text; },
        removeAllRanges() {},
      };
    },
  };
  return { win, doc: {} };
}

test("readSelection maps a transcript range to text, turn and role", () => {
  const dom = fakeDom({ text: "选中一段回复" });
  const snapshot = api.readSelection(dom.win, dom.doc);
  assert.equal(snapshot.text, "选中一段回复");
  assert.equal(snapshot.turn, 4);
  assert.equal(snapshot.role, "assistant");
  assert.equal(snapshot.firstRect.width, 200);
  assert.equal(snapshot.lastRect.top, 100);
  assert.equal(snapshot.nodeKey, "node-7");
});

test("readSelection ignores selections outside the transcript", () => {
  const dom = fakeDom({ text: "侧栏文字", startInTranscript: false });
  assert.equal(api.readSelection(dom.win, dom.doc), null);
});

test("readSelection ignores selections inside the composer", () => {
  const dom = fakeDom({ text: "自己输入的", inComposer: true });
  assert.equal(api.readSelection(dom.win, dom.doc), null);
});

test("readSelection ignores blank selections", () => {
  const dom = fakeDom({ text: "   \n  " });
  assert.equal(api.readSelection(dom.win, dom.doc), null);
});

test("the chip ref round-trips the source node key", () => {
  const ref = api.encodeQuote({ text: "原文", turn: 2, role: "user", nodeKey: "node-9" });
  const decoded = api.readQuote(ref);
  assert.equal(decoded.text, "原文");
  assert.equal(decoded.turn, 2);
  assert.equal(decoded.role, "user");
  assert.equal(decoded.nodeKey, "node-9");
});

test("clicking a chip never throws without a DOM", async () => {
  const { ctx, record } = makeCtx({});
  bundleExports.apply(ctx, undefined);
  const source = record.sources[0];
  assert.equal(typeof source.openReference, "function");
  assert.equal(source.openReference({ sessionId: "s" }, { ref: api.encodeQuote({ text: "x", turn: 3 }) }), false);
  assert.equal(source.openReference({ sessionId: "s" }, {}), false);
});
test("a busy composer reports busy instead of a generic failure", () => {
  const shell = makeShell({ insertReference: undefined, snapshot: { draft: "draft", draftRev: 3, phase: "submitting", occurrences: [] } });
  shell.actions.insertText = () => false;
  const { ctx, record } = makeCtx({ conversation: { input: { shell() { return shell; } } } });
  bundleExports.apply(ctx, undefined);
  const injected = record.slots[0].options.inject("session-1");
  assert.equal(injected.insertQuote({ text: "x" }), "busy");
});
test("readSelection ignores a transcript owned by another session", () => {
  const dom = fakeDom({ text: "子智能体的对话", session: "session-2" });
  assert.equal(api.readSelection(dom.win, dom.doc, "session-1"), null);
  assert.notEqual(api.readSelection(dom.win, dom.doc, "session-2"), null);
  assert.notEqual(api.readSelection(dom.win, dom.doc), null);
});
test("locale dictionaries stay key-compatible", () => {
  const zhKeys = Object.keys(api.zh).sort();
  const enKeys = Object.keys(api.en).sort();
  assert.deepEqual(enKeys, zhKeys);
});
