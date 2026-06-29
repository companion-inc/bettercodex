/**
 * @name Codex Scratchpad
 * @version 0.1.0
 * @description Adds a persistent local scratchpad for notes, constraints, and reusable context that can be inserted into the Codex composer.
 * @author Companion
 */

const PLUGIN_NAME = "Codex Scratchpad";
const ROOT_ID = "bettercodex-scratchpad";
const STYLE_ID = "bettercodex-scratchpad-style";
const NOTE_KEY = "note";

module.exports = class CodexScratchpad {
  start() {
    this.lastEditable = null;
    this.onFocusIn = (event) => {
      if (isEditable(event.target)) this.lastEditable = event.target;
    };
    this.onDocumentClick = (event) => {
      const root = document.getElementById(ROOT_ID);
      if (root && !root.contains(event.target)) this.closePanel();
    };

    document.addEventListener("focusin", this.onFocusIn, true);
    document.addEventListener("click", this.onDocumentClick, true);
    this.render();
  }

  stop() {
    document.removeEventListener("focusin", this.onFocusIn, true);
    document.removeEventListener("click", this.onDocumentClick, true);
    document.getElementById(ROOT_ID)?.remove();
    BdApi.DOM.removeStyle(STYLE_ID);
  }

  render() {
    document.getElementById(ROOT_ID)?.remove();
    BdApi.DOM.addStyle(STYLE_ID, css());

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "bcsp-root";
    root.innerHTML = [
      '<button type="button" class="bcsp-trigger" aria-expanded="false" aria-haspopup="dialog">Notes</button>',
      '<section class="bcsp-panel" aria-label="Codex Scratchpad" hidden>',
      '<div class="bcsp-head">',
      '<div><div class="bcsp-title">Scratchpad</div><div class="bcsp-subtitle">Saved locally in this Codex profile.</div></div>',
      '<button type="button" class="bcsp-icon-button" data-bcsp-close aria-label="Close scratchpad">x</button>',
      '</div>',
      '<textarea class="bcsp-textarea" placeholder="Paste constraints, repo notes, acceptance criteria, or a reusable prompt..."></textarea>',
      '<div class="bcsp-actions">',
      '<button type="button" class="bcsp-secondary" data-bcsp-clear>Clear</button>',
      '<button type="button" class="bcsp-primary" data-bcsp-insert>Insert</button>',
      '</div>',
      "</section>",
    ].join("");

    const textarea = root.querySelector(".bcsp-textarea");
    textarea.value = BdApi.Data.load(NOTE_KEY) || "";
    textarea.addEventListener("input", () => BdApi.Data.save(NOTE_KEY, textarea.value));

    root.querySelector(".bcsp-trigger").addEventListener("click", (event) => {
      event.stopPropagation();
      const panel = root.querySelector(".bcsp-panel");
      const isOpen = !panel.hidden;
      panel.hidden = isOpen;
      event.currentTarget.setAttribute("aria-expanded", String(!isOpen));
      if (!isOpen) setTimeout(() => textarea.focus(), 0);
    });

    root.querySelector("[data-bcsp-close]").addEventListener("click", (event) => {
      event.stopPropagation();
      this.closePanel();
    });

    root.querySelector("[data-bcsp-clear]").addEventListener("click", (event) => {
      event.stopPropagation();
      textarea.value = "";
      BdApi.Data.delete(NOTE_KEY);
      BdApi.UI.showToast("Scratchpad cleared");
      textarea.focus();
    });

    root.querySelector("[data-bcsp-insert]").addEventListener("click", (event) => {
      event.stopPropagation();
      const value = textarea.value.trim();
      if (!value) {
        BdApi.UI.showToast("Scratchpad is empty");
        return;
      }
      if (insertIntoComposer(value, this.lastEditable)) {
        this.closePanel();
        BdApi.UI.showToast("Inserted scratchpad");
      } else {
        BdApi.UI.showToast("Focus the Codex message box first.");
      }
    });

    document.body.appendChild(root);
  }

  closePanel() {
    const root = document.getElementById(ROOT_ID);
    const panel = root?.querySelector(".bcsp-panel");
    const trigger = root?.querySelector(".bcsp-trigger");
    if (!panel || !trigger) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
};

function insertIntoComposer(text, preferredTarget) {
  const target = findComposer(preferredTarget);
  if (!target) return false;

  target.focus();
  if (target.matches("textarea, input")) {
    const start = Number.isInteger(target.selectionStart) ? target.selectionStart : target.value.length;
    const end = Number.isInteger(target.selectionEnd) ? target.selectionEnd : target.value.length;
    const prefix = target.value.slice(0, start);
    const suffix = target.value.slice(end);
    const spacer = prefix && !prefix.endsWith("\n") ? "\n\n" : "";
    target.value = prefix + spacer + text + suffix;
    const cursor = (prefix + spacer + text).length;
    target.setSelectionRange(cursor, cursor);
    target.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: text}));
    target.dispatchEvent(new Event("change", {bubbles: true}));
    return true;
  }

  const selection = window.getSelection();
  if (selection && selection.rangeCount === 0) {
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  document.execCommand("insertText", false, text);
  target.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: text}));
  return true;
}

function findComposer(preferredTarget) {
  if (isEditable(preferredTarget) && isVisible(preferredTarget)) return preferredTarget;
  if (isEditable(document.activeElement) && isVisible(document.activeElement)) return document.activeElement;

  const candidates = Array.from(document.querySelectorAll([
    "textarea",
    "input[type='text']",
    "[contenteditable='true']",
    "[role='textbox']",
    ".cm-content",
  ].join(","))).filter((node) => isEditable(node) && isVisible(node));

  return candidates.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
}

function isEditable(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  if (node.closest("#" + ROOT_ID)) return false;
  if (node.matches("textarea")) return !node.disabled && !node.readOnly;
  if (node.matches("input")) {
    const type = (node.getAttribute("type") || "text").toLowerCase();
    return ["text", "search", "url", "email"].includes(type) && !node.disabled && !node.readOnly;
  }
  return node.isContentEditable || node.getAttribute("role") === "textbox" || node.classList.contains("cm-content");
}

function isVisible(node) {
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function css() {
  return `
    .bcsp-root {
      position: fixed;
      right: 18px;
      bottom: 120px;
      z-index: 2147483644;
      font-family: inherit;
    }
    .bcsp-trigger {
      height: 34px;
      border: 1px solid var(--border-default, rgba(255,255,255,0.12));
      border-radius: 8px;
      background: var(--main-surface-primary, #101014);
      color: var(--text-primary, #f4f4f5);
      box-shadow: 0 8px 24px rgba(0,0,0,0.24);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 0 12px;
      cursor: pointer;
    }
    .bcsp-trigger:hover {
      background: var(--composer-surface-hover, rgba(255,255,255,0.08));
    }
    .bcsp-panel {
      position: absolute;
      right: 0;
      bottom: 42px;
      width: min(380px, calc(100vw - 32px));
      border: 1px solid var(--border-default, rgba(255,255,255,0.12));
      border-radius: 10px;
      background: var(--main-surface-primary, #101014);
      color: var(--text-primary, #f4f4f5);
      box-shadow: 0 18px 44px rgba(0,0,0,0.34);
      padding: 10px;
    }
    .bcsp-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 2px 2px 9px;
    }
    .bcsp-title {
      font-size: 13px;
      font-weight: 600;
      line-height: 18px;
    }
    .bcsp-subtitle {
      color: var(--text-secondary, #a1a1aa);
      font-size: 12px;
      line-height: 17px;
    }
    .bcsp-icon-button {
      width: 26px;
      height: 26px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--text-secondary, #a1a1aa);
      cursor: pointer;
    }
    .bcsp-icon-button:hover {
      background: var(--composer-surface-hover, rgba(255,255,255,0.08));
      color: var(--text-primary, #f4f4f5);
    }
    .bcsp-textarea {
      width: 100%;
      min-height: 160px;
      resize: vertical;
      border: 1px solid var(--border-default, rgba(255,255,255,0.12));
      border-radius: 8px;
      background: var(--composer-surface, rgba(255,255,255,0.04));
      color: var(--text-primary, #f4f4f5);
      font: inherit;
      font-size: 13px;
      line-height: 19px;
      outline: none;
      padding: 10px;
    }
    .bcsp-textarea:focus {
      border-color: var(--border-active, rgba(255,255,255,0.28));
    }
    .bcsp-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 10px;
    }
    .bcsp-primary,
    .bcsp-secondary {
      height: 32px;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 0 12px;
      cursor: pointer;
    }
    .bcsp-primary {
      border: 1px solid var(--text-primary, #f4f4f5);
      background: var(--text-primary, #f4f4f5);
      color: var(--main-surface-primary, #101014);
    }
    .bcsp-secondary {
      border: 1px solid var(--border-default, rgba(255,255,255,0.12));
      background: transparent;
      color: var(--text-primary, #f4f4f5);
    }
    .bcsp-secondary:hover {
      background: var(--composer-surface-hover, rgba(255,255,255,0.08));
    }
  `;
}
