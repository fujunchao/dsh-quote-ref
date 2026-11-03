/*
 * dsh-quote-ref --- browser half.
 *
 * Select text inside the conversation transcript, then insert it into the composer as a
 * compact, atomic reference chip. The composer only ever shows the short chip label; the
 * quoted原文 travels inside the chip ref and is expanded by our input-triggers codec at
 * submit time (SessionInputShell.sinkSerialized -> inputTriggers.serializeReference).
 *
 * Zero-build bundle: window.__ModuleLoader__.load({ id, factory }) with a classic CJS body
 * (no import statements, no JSX). Only the platform seed modules may be required.
 */
window.__ModuleLoader__.load({
  id: "dsh-quote-ref",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var reactDom = require("react-dom");
    var uiPrimitives = null;
    try {
      uiPrimitives = require("@deepseek-ai/dsh-client-ui-primitives");
    } catch (error) {
      uiPrimitives = null; /* the seed module is present in the shell; stay safe anyway */
    }

    var h = React.createElement;
    var createPortal = reactDom && typeof reactDom.createPortal === "function"
      ? reactDom.createPortal
      : function (child) { return child; };

    /** Locale namespace owned by this plugin. */
    var NS = "quote-ref";
    /** input-triggers source name; also the chip.source routing key. */
    var SOURCE = "quote-ref";
    /** Slot cell id inside conversation.input.dock (todo=0, goal=10, queue=20, us=30). */
    var DOCK_ID = "quote-ref";
    var DOCK_ORDER = 30;
    var PLUGIN_ID = "dsh-quote-ref";

    /** Hard cap for one quoted passage; the ref travels into localStorage with the draft. */
    var DEFAULT_MAX_CHARS = 4000;
    var HARD_MAX_CHARS = 40000;

    var TRANSCRIPT_ATTR = "data-conversation-content";
    var ROW_ATTR = "data-chat-flow-key";
    var COMPOSER_ATTR = "data-composer-card";

    var EMPTY = [];

    /** The dock entry that currently owns the floating bar (one bar across all occurrences). */
    var toolbarOwner = null;

    // ---------------------------------------------------------------- copy
    var zh = {
      "toolbar.quote": "引用",
      "toolbar.copy": "复制",
      "toolbar.quoteTitle": "把选中的对话作为引用插入输入框：输入框只显示简短引用，发送时自动附上原文",
      "toolbar.copyTitle": "复制选中的文字",
      "toolbar.copied": "已复制",
      "summary.one": "1 条对话引用",
      "summary.n": "{n} 条对话引用",
      "summary.hint": "发送时自动附上引用原文",
      "label.empty": "引用",
      "error.insert": "无法插入引用：请先把光标放进输入框再重试",
      "error.busy": "消息正在发送，稍后再引用",
      "error.empty": "没有选中文字",
    };
    var en = {
      "toolbar.quote": "Quote",
      "toolbar.copy": "Copy",
      "toolbar.quoteTitle": "Insert the selected conversation text as a quote reference (the composer shows only a short chip; the full text goes with the message)",
      "toolbar.copyTitle": "Copy the selected text",
      "toolbar.copied": "Copied",
      "summary.one": "1 conversation quote",
      "summary.n": "{n} conversation quotes",
      "summary.hint": "The quoted text is attached when you send",
      "label.empty": "Quote",
      "error.insert": "Could not insert the quote: focus the composer and try again",
      "error.busy": "A message is being sent; quote again in a moment",
      "error.empty": "Nothing is selected",
    };

    // --------------------------------------------------------------- style
    var CSS = [
      ".qr-bar{display:flex;align-items:center;gap:2px;padding:3px;border-radius:10px;",
      "background:var(--dsw-alias-bg-layer-3,#26282d);",
      "border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.24));",
      "box-shadow:0 10px 28px rgba(0,0,0,.34);backdrop-filter:blur(10px);",
      "font:inherit;user-select:none;}",
      ".qr-action{appearance:none;border:0;background:transparent;border-radius:7px;",
      "color:var(--dsw-alias-label-secondary,#c8c9cc);font:inherit;font-size:12px;line-height:20px;",
      "padding:2px 9px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;}",
      ".qr-action:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18));",
      "color:var(--dsw-alias-label-primary,#fff);}",
      ".qr-action[data-primary=true]{color:var(--dsw-alias-label-primary,#fff);}",
      ".qr-action[data-primary=true]:hover{background:var(--dsw-alias-state-business-tertiary,rgba(49,91,255,.28));}",
      ".qr-glyph{font-size:11px;line-height:1;opacity:.85;}",
      ".qr-sep{width:1px;height:14px;background:var(--dsw-alias-border-l2,rgba(127,127,127,.24));margin:0 2px;}",
      ".qr-summary{display:flex;align-items:center;gap:8px;width:calc(100% - var(--dsh-composer-side-clearance,16px)*2);",
      "max-width:var(--dsh-composer-card-max-width,100%);margin:0 auto;padding:0 2px 6px;box-sizing:border-box;}",
      ".qr-pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;",
      "background:var(--dsw-alias-bg-module-platform,rgba(127,127,127,.14));",
      "color:var(--dsw-alias-label-secondary,#b7b8bc);font-size:12px;line-height:24px;white-space:nowrap;}",
      ".qr-pill-glyph{font-size:11px;opacity:.8;}",
      ".qr-hint{color:var(--dsw-alias-label-tertiary,#8a8b90);font-size:11px;line-height:16px;}",
    ].join("");
    var CSS_ID = PLUGIN_ID + "/quote-ref.css";

    function installStyles() {
      if (typeof document === "undefined" || !document.head) return;
      var selector = "style[data-plugin-css=\"" + CSS_ID + "\"]";
      if (document.querySelector(selector) !== null) return;
      var tag = document.createElement("style");
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ------------------------------------------------------------- helpers
    function isString(value) {
      return typeof value === "string";
    }

    function normalizeText(value) {
      return String(value === null || value === undefined ? "" : value).replace(/\r\n/g, "\n").trim();
    }

    function positiveInt(value) {
      var parsed = Number(value);
      return isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
    }

    function readRole(value) {
      return value === "user" || value === "assistant" ? value : undefined;
    }

    /** Owner-private identity string stored on the chip; carries the quoted text itself. */
    function encodeQuote(quote) {
      var payload = { v: 1, t: normalizeText(quote.text) };
      if (quote.turn) payload.turn = positiveInt(quote.turn);
      if (quote.role) payload.role = readRole(quote.role);
      if (quote.nodeKey) payload.node = String(quote.nodeKey);
      if (quote.at) payload.at = positiveInt(quote.at);
      return JSON.stringify(payload);
    }

    function readQuote(ref) {
      if (!isString(ref) || ref === "") return { text: "" };
      if (ref.charAt(0) === "{") {
        try {
          var parsed = JSON.parse(ref);
          if (parsed && typeof parsed === "object") {
            return {
              text: normalizeText(parsed.t),
              turn: positiveInt(parsed.turn),
              role: readRole(parsed.role),
              nodeKey: isString(parsed.node) && parsed.node !== "" ? parsed.node : undefined,
            };
          }
        } catch (error) {
          /* not JSON: fall through and treat the ref as the raw text */
        }
      }
      return { text: normalizeText(ref) };
    }

    /** Short label rendered inside the composer chip (never the full text). */
    function labelFor(quote, t) {
      var flat = normalizeText(quote && quote.text).replace(/\s+/g, " ");
      if (flat === "") return t("label.empty");
      var chars = Array.from(flat);
      if (chars.length > 16) return chars.slice(0, 16).join("") + "\u2026";
      return flat;
    }

    /**
     * The model-facing form; the submit pipeline substitutes this for the chip.
     *
     * Deliberately locale-free: the prompt a model sees must not change when the UI language
     * changes (it would churn prompt caches and split transcripts).
     */
    function formatForModel(quote, options) {
      var text = normalizeText(quote && quote.text);
      if (text === "") return "";
      if (text.length > options.maxChars) text = text.slice(0, options.maxChars) + "\u2026";
      var origin = "";
      if (options.includeOrigin) {
        var parts = [];
        if (quote.turn) parts.push("\u7b2c " + quote.turn + " \u8f6e");
        if (quote.role) parts.push(quote.role === "user" ? "\u7528\u6237" : "\u52a9\u624b");
        if (parts.length > 0) origin = " \u00b7 " + parts.join(" \u00b7 ");
      }
      var body = text.split("\n").map(function (line) { return "> " + line; }).join("\n");
      return "\n\n\u3010\u5bf9\u8bdd\u5f15\u7528" + origin + "\u3011\n" + body + "\n\n";
    }

    // --------------------------------------------------- selection geometry
    function elementOf(node) {
      if (!node) return null;
      if (node.nodeType === 1) return node;
      return node.parentElement || null;
    }

    function closestOf(element, attribute) {
      if (!element || typeof element.closest !== "function") return null;
      return element.closest("[" + attribute + "]");
    }

    function readRow(element) {
      var row = closestOf(element, ROW_ATTR);
      if (!row) return null;
      return {
        turn: positiveInt(row.getAttribute("data-chat-turn")),
        kind: row.getAttribute("data-chat-flow-kind") || undefined,
        nodeKey: row.getAttribute("data-chat-node-key") || undefined,
      };
    }

    function roleOfKind(kind) {
      if (kind === "user" || kind === "steering") return "user";
      if (kind === "assistant-step" || kind === "assistant") return "assistant";
      return undefined;
    }

    /**
     * One read of the live DOM selection, or null when it is not a quotable transcript range.
     *
     * expectedSessionId keeps the embedded occurrences of conversation.content (the right-hand
     * subagent chat renders another transcript with its own composer) from feeding this one.
     */
    function readSelection(win, doc, expectedSessionId) {
      if (!win || !doc) return null;
      var selection = typeof win.getSelection === "function" ? win.getSelection() : null;
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
      var range = selection.getRangeAt(0);
      var text = normalizeText(selection.toString());
      if (text === "") return null;
      var startElement = elementOf(range.startContainer);
      var endElement = elementOf(range.endContainer);
      if (!startElement || !endElement) return null;
      var startRoot = closestOf(startElement, TRANSCRIPT_ATTR);
      var endRoot = closestOf(endElement, TRANSCRIPT_ATTR);
      if (!startRoot || startRoot !== endRoot) return null;
      if (expectedSessionId !== undefined) {
        var rootSession = startRoot.getAttribute("data-conversation-session");
        if (rootSession !== null && rootSession !== "" && rootSession !== expectedSessionId) return null;
      }
      if (closestOf(startElement, COMPOSER_ATTR) || closestOf(endElement, COMPOSER_ATTR)) return null;
      var rects = typeof range.getClientRects === "function" ? range.getClientRects() : null;
      var list = rects && rects.length > 0 ? rects : null;
      var first = list ? list[0] : range.getBoundingClientRect();
      var last = list ? list[list.length - 1] : first;
      if (!first || !last) return null;
      var row = readRow(startElement) || readRow(endElement);
      return {
        text: text,
        firstRect: { left: first.left, top: first.top, right: first.right, bottom: first.bottom, width: first.width, height: first.height },
        lastRect: { left: last.left, top: last.top, right: last.right, bottom: last.bottom, width: last.width, height: last.height },
        turn: row ? row.turn : undefined,
        role: row ? roleOfKind(row.kind) : undefined,
        nodeKey: row ? row.nodeKey : undefined,
      };
    }
    function clearSelection(win) {
      try {
        var selection = win && typeof win.getSelection === "function" ? win.getSelection() : null;
        if (selection && typeof selection.removeAllRanges === "function") selection.removeAllRanges();
      } catch (error) {
        /* removing the selection is best effort */
      }
    }

    // ------------------------------------------------------- shell plumbing
    function serviceOf(ctx, name) {
      try {
        if (typeof ctx.get === "function") return ctx.get(name);
        return ctx[name];
      } catch (error) {
        return undefined;
      }
    }

    function resolveShell(ctx, sessionId) {
      var conversation = serviceOf(ctx, "conversation");
      var input = conversation && conversation.input;
      if (!input) return undefined;
      try {
        if (typeof input.shell === "function") return input.shell(sessionId);
        if (typeof input.for === "function") {
          var sessions = serviceOf(ctx, "sessions");
          var actx = sessions && typeof sessions.scope === "function" ? sessions.scope(sessionId) : undefined;
          return actx ? input.for(actx) : undefined;
        }
      } catch (error) {
        return undefined;
      }
      return undefined;
    }

    function notify(ctx, sessionId, level, message) {
      try {
        var shell = resolveShell(ctx, sessionId);
        if (shell && typeof shell.notify === "function") shell.notify(level, message);
      } catch (error) {
        /* notifications are best effort */
      }
    }

    function buildChip(quote, options, t) {
      var text = normalizeText(quote && quote.text);
      if (text.length > options.maxChars) text = text.slice(0, options.maxChars);
      var label = labelFor({ text: text }, t);
      return {
        source: SOURCE,
        ref: encodeQuote({ text: text, turn: quote.turn, role: quote.role, nodeKey: quote.nodeKey, at: quote.at }),
        label: label,
        appearance: "session",
        clipboardText: label,
      };
    }

    /**
     * Insert one quote chip into the composer draft.
     *
     * Primary path: SessionInputShell.insertReference(chip, span) --- the same call the
     * @-reference pick path uses (undocumented but shipped). Degrades to plain text when the
     * shell does not expose it.
     */
    function insertQuoteChip(ctx, sessionId, quote, options, tRef) {
      var text = normalizeText(quote && quote.text);
      if (text === "") return "empty";
      var shell = resolveShell(ctx, sessionId);
      if (!shell) return "unavailable";
      var chip = buildChip(quote, options, tRef);
      var actions = shell.actions || {};
      var span;
      try {
        span = typeof actions.captureInsertion === "function" ? actions.captureInsertion() : undefined;
      } catch (error) {
        span = undefined;
      }
      if (span && typeof shell.insertReference === "function") {
        try {
          if (shell.insertReference(chip, span) === true) return "ok";
        } catch (error) {
          /* fall through to the plain-text degradation */
        }
      }
      if (span && typeof actions.insertText === "function") {
        var block = normalizeText(text).split("\n").map(function (line) { return "> " + line; }).join("\n");
        try {
          if (actions.insertText("\n" + block + "\n", span) === true) return "ok";
        } catch (error) {
          return "failed";
        }
      }
      var phase = shell.snapshot && shell.snapshot.phase;
      if (phase === "adjudicating" || phase === "submitting") return "busy";
      return "failed";
    }

    /** Whether a painted aria-modal dialog currently covers the transcript. */
    function hasOpenModal(doc) {
      if (!doc || typeof doc.querySelectorAll !== "function") return false;
      try {
        var nodes = doc.querySelectorAll("[role=\"dialog\"][aria-modal=\"true\"]");
        for (var index = 0; index < nodes.length; index++) {
          var node = nodes[index];
          if (typeof node.getClientRects === "function" && node.getClientRects().length > 0) return true;
        }
      } catch (error) {
        return false;
      }
      return false;
    }

    /** Click on a quote chip: bring the quoted message back into view. */
    function scrollToQuote(ref) {
      try {
        if (typeof document === "undefined" || !document.querySelector) return false;
        var quote = readQuote(ref);
        var selector = quote.nodeKey
          ? "[data-chat-flow-key][data-chat-node-key=\"" + String(quote.nodeKey).replace(/"/g, "") + "\"]"
          : quote.turn
            ? "[data-chat-flow-key][data-chat-turn=\"" + quote.turn + "\"]"
            : "";
        if (selector === "") return false;
        var row = document.querySelector(selector);
        if (!row || typeof row.scrollIntoView !== "function") return false;
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        return true;
      } catch (error) {
        return false;
      }
    }

    /** Copy through the shell clipboard helper (falls back to the async Clipboard API). */
    function copyText(win, text) {
      try {
        if (uiPrimitives && typeof uiPrimitives.writeClipboard === "function") {
          return Promise.resolve(uiPrimitives.writeClipboard(text)).catch(function () { return false; });
        }
      } catch (error) {
        /* fall through to the platform clipboard */
      }
      try {
        if (win && win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === "function") {
          return Promise.resolve(win.navigator.clipboard.writeText(text)).then(function () { return true; }, function () { return false; });
        }
      } catch (error) {
        /* clipboard permissions are best effort */
      }
      return Promise.resolve(false);
    }
    // ---------------------------------------------------------- components
    /**
     * Composer extension entry: a floating quote toolbar for transcript selections plus a
     * one-line summary of the quote chips currently in the draft.
     */
    /**
     * Composer extension entry: a floating quote toolbar for transcript selections plus a
     * one-line summary of the quote chips currently in the draft.
     *
     * The dock entry renders once per mounted composer, including the embedded occurrence the
     * right-hand subagent chat owns, so every read of the live selection is filtered by this
     * entry's own sessionId and only one entry may own the floating bar at a time.
     */
    function QuoteDock(props) {
      var t = props.t;
      var useInput = props.useInput;
      var sessionId = props.sessionId;
      var insertQuote = props.insertQuote;
      var warn = props.warn;

      var occurrences = typeof useInput === "function"
        ? useInput(function (state) { return state && state.occurrences ? state.occurrences : EMPTY; })
        : EMPTY;
      var quotes = [];
      for (var index = 0; index < occurrences.length; index++) {
        if (occurrences[index] && occurrences[index].source === SOURCE) quotes.push(occurrences[index]);
      }

      var pendingPair = React.useState(null);
      var pending = pendingPair[0];
      var setPending = pendingPair[1];
      var copiedPair = React.useState(false);
      var copied = copiedPair[0];
      var setCopied = copiedPair[1];
      var token = React.useRef(null);
      if (token.current === null) token.current = {};
      var lastSnapshot = React.useRef(null);
      var copyTimer = React.useRef(null);

      function publish(next) {
        var self = token.current;
        if (next !== null) {
          if (toolbarOwner !== null && toolbarOwner !== self) next = null;
          else toolbarOwner = self;
        } else if (toolbarOwner === self) {
          toolbarOwner = null;
        }
        var previous = lastSnapshot.current;
        if (previous === next) return;
        if (previous !== null && next !== null
          && previous.text === next.text
          && previous.turn === next.turn
          && previous.role === next.role
          && previous.nodeKey === next.nodeKey
          && previous.firstRect.left === next.firstRect.left
          && previous.firstRect.top === next.firstRect.top
          && previous.lastRect.top === next.lastRect.top
          && previous.lastRect.width === next.lastRect.width) return;
        lastSnapshot.current = next;
        setPending(next);
      }

      React.useEffect(function () {
        if (typeof window === "undefined" || typeof document === "undefined") return undefined;
        var raf = 0;
        function read() {
          try {
            return readSelection(window, document, sessionId);
          } catch (error) {
            return null;
          }
        }
        function sync() {
          publish(read());
        }
        function schedule() {
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(function () {
            raf = 0;
            sync();
          });
        }
        function onPointerDown(event) {
          var target = event && event.target;
          if (target && typeof target.closest === "function" && target.closest("[data-quote-toolbar]")) return;
          publish(null);
        }
        function onKeyDown(event) {
          if (event && event.key === "Escape") publish(null);
        }
        document.addEventListener("mousedown", onPointerDown, true);
        document.addEventListener("mouseup", schedule, true);
        document.addEventListener("keyup", schedule, true);
        document.addEventListener("selectionchange", schedule);
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("scroll", schedule, true);
        window.addEventListener("resize", schedule);
        return function () {
          if (raf) cancelAnimationFrame(raf);
          if (copyTimer.current !== null) clearTimeout(copyTimer.current);
          if (toolbarOwner === token.current) toolbarOwner = null;
          document.removeEventListener("mousedown", onPointerDown, true);
          document.removeEventListener("mouseup", schedule, true);
          document.removeEventListener("keyup", schedule, true);
          document.removeEventListener("selectionchange", schedule);
          document.removeEventListener("keydown", onKeyDown, true);
          document.removeEventListener("scroll", schedule, true);
          window.removeEventListener("resize", schedule);
        };
      }, [sessionId]);

      function commit() {
        if (!pending) return;
        var fresh = null;
        try {
          fresh = readSelection(window, document, sessionId);
        } catch (error) {
          fresh = null;
        }
        publish(null);
        clearSelection(window);
        if (!fresh) return;
        var outcome = "failed";
        try {
          if (typeof insertQuote === "function") {
            var result = insertQuote({
              text: fresh.text,
              turn: fresh.turn,
              role: fresh.role,
              nodeKey: fresh.nodeKey,
              at: Date.now(),
            });
            outcome = typeof result === "string" ? result : result === true ? "ok" : "failed";
          }
        } catch (error) {
          outcome = "failed";
        }
        if (outcome !== "ok" && typeof warn === "function") {
          warn(t(outcome === "busy" ? "error.busy" : outcome === "empty" ? "error.empty" : "error.insert"));
        }
      }

      function copy() {
        if (!pending) return;
        var text = pending.text;
        publish(null);
        copyText(window, text).then(function (ok) {
          if (!ok) return;
          setCopied(true);
          if (copyTimer.current !== null) clearTimeout(copyTimer.current);
          copyTimer.current = window.setTimeout(function () {
            copyTimer.current = null;
            setCopied(false);
          }, 1200);
        });
      }

      var toolbar = null;
      var modalOpen = hasOpenModal(typeof document === "undefined" ? undefined : document);
      if (pending && !modalOpen && typeof document !== "undefined") {
        var viewportWidth = (typeof window !== "undefined" && window.innerWidth) || 1024;
        var below = pending.firstRect.top < 64;
        var anchor = below ? pending.lastRect : pending.firstRect;
        var center = anchor.left + anchor.width / 2;
        var left = Math.min(Math.max(center, 92), Math.max(92, viewportWidth - 92));
        var style = {
          position: "fixed",
          left: Math.round(left) + "px",
          top: Math.round(below ? anchor.bottom + 10 : anchor.top - 10) + "px",
          transform: below ? "translateX(-50%)" : "translate(-50%, -100%)",
          zIndex: 1100,
        };
        toolbar = createPortal(
          h("div", {
            className: "qr-bar",
            style: style,
            "data-quote-toolbar": "",
            role: "toolbar",
            onMouseDown: function (event) { event.preventDefault(); },
          },
            h("button", {
              type: "button",
              className: "qr-action",
              "data-primary": "true",
              title: t("toolbar.quoteTitle"),
              onClick: commit,
            }, h("span", { className: "qr-glyph", "aria-hidden": "true" }, "\u275d"), t("toolbar.quote")),
            h("span", { className: "qr-sep", "aria-hidden": "true" }),
            h("button", {
              type: "button",
              className: "qr-action",
              title: copied ? t("toolbar.copied") : t("toolbar.copyTitle"),
              onClick: copy,
            }, copied ? t("toolbar.copied") : t("toolbar.copy"))
          ),
          document.body
        );
      }

      var summary = null;
      if (quotes.length > 0) {
        summary = h("div", { className: "qr-summary", "data-quote-summary": "" },
          h("span", { className: "qr-pill" },
            h("span", { className: "qr-pill-glyph", "aria-hidden": "true" }, "\u275d"),
            quotes.length === 1 ? t("summary.one") : t("summary.n", { n: quotes.length })
          ),
          h("span", { className: "qr-hint" }, t("summary.hint"))
        );
      }

      if (!summary && !toolbar) return null;
      return h(React.Fragment, null, summary, toolbar);
    }
    // --------------------------------------------------------------- apply
    function readOptions(config) {
      var source = config && typeof config === "object" ? config : {};
      var maxChars = Number(source.maxChars);
      if (!isFinite(maxChars) || maxChars < 200) maxChars = DEFAULT_MAX_CHARS;
      return {
        maxChars: Math.min(Math.floor(maxChars), HARD_MAX_CHARS),
        includeOrigin: source.includeOrigin !== false,
        probeUrl: isString(source.probeUrl) ? source.probeUrl : "",
      };
    }

    function sendProbe(url, detail) {
      try {
        if (typeof fetch !== "function") return;
        var endpoint = url + (url.indexOf("?") < 0 ? "?" : "&")
          + "plugin=" + encodeURIComponent(PLUGIN_ID)
          + "&detail=" + encodeURIComponent(String(detail || ""))
          + "&at=" + Date.now();
        fetch(endpoint, { method: "GET", cache: "no-store", mode: "cors" }).catch(function () { return undefined; });
      } catch (error) {
        /* diagnostics only */
      }
    }

    function apply(ctx, config) {
      var options = readOptions(config);
      installStyles();

      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-quote-ref: dictionaries");
      var t = ctx.locale.bind(NS);

      /** Reference source: routing key for chip.source and the submit-time codec owner. */
      var source = {
        trigger: "@",
        name: SOURCE,
        order: 1000,
        showGroupTitle: false,
        candidates: function () { return Promise.resolve(EMPTY); },
        openReference: function (session, reference) {
          return scrollToQuote(reference ? reference.ref : undefined);
        },
        codec: {
          clipboardText: function (ref) { return labelFor(readQuote(ref), t); },
          serialize: function (ref) { return Promise.resolve(formatForModel(readQuote(ref), options)); },
        },
      };
      ctx.effect(function () {
        return ctx.inputTriggers.registerSource(source);
      }, "dsh-quote-ref: reference source");

      ctx.effect(function () {
        return ctx.slots.inject("conversation.input.dock", function () {
          return ctx.slots.register({
            name: "conversation.input.dock",
            id: DOCK_ID,
            order: DOCK_ORDER,
            locale: NS,
            inject: function (sessionId) {
              return {
                insertQuote: function (quote) {
                  return insertQuoteChip(ctx, sessionId, quote, options, t);
                },
                warn: function (message, level) {
                  notify(ctx, sessionId, level === "info" ? "info" : "error", message);
                },
              };
            },
          }, QuoteDock);
        });
      }, "dsh-quote-ref: composer dock");

      /** Debug handle: lets the Web console drive the same insertion path by hand. */
      if (typeof window !== "undefined") {
        window.__DSH_QUOTE_REF__ = {
          version: "0.1.0",
          source: SOURCE,
          insert: function (sessionId, text, meta) {
            var quote = {
              text: text,
              turn: meta && meta.turn,
              role: meta && meta.role,
              nodeKey: meta && meta.nodeKey,
              at: Date.now(),
            };
            return insertQuoteChip(ctx, sessionId, quote, options, t);
          },
          read: function (ref) { return readQuote(ref); },
          probe: function () { return readSelection(window, document); },
          format: function (ref) { return formatForModel(readQuote(ref), options); },
        };
      }

      if (options.probeUrl !== "") sendProbe(options.probeUrl, "loaded");
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "inputTriggers", "conversation", "sessions"];
    exports.__test = {
      NS: NS,
      SOURCE: SOURCE,
      zh: zh,
      en: en,
      encodeQuote: encodeQuote,
      readQuote: readQuote,
      labelFor: labelFor,
      formatForModel: formatForModel,
      readSelection: readSelection,
      buildChip: buildChip,
      insertQuoteChip: insertQuoteChip,
      readOptions: readOptions,
      QuoteDock: QuoteDock,
      apply: apply,
      inject: ["slots", "locale", "inputTriggers", "conversation", "sessions"],
    };
    return module.exports;
  },
});
