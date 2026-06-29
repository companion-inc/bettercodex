/**
 * @name Codex Workflow Kit
 * @version 0.1.0
 * @description Adds one-click workflow prompts for debugging, reviews, pull requests, research, and thread checkpoints.
 * @author Companion
 */

const PLUGIN_NAME = "Codex Workflow Kit";
const ROOT_ID = "bettercodex-workflow-kit";
const STYLE_ID = "bettercodex-workflow-kit-style";

const PROMPTS = [
  {
    label: "Fix failing test",
    body: "Find the failing test or smallest repro first. Read the relevant code, identify the root cause, make the smallest correct fix, run the focused test, then run the relevant full check. Report what changed and what remains unverified.",
  },
  {
    label: "Review current diff",
    body: "Review the current git diff as a code review. Lead with bugs, regressions, security issues, and missing tests, with file and line references. Then give a brief summary. Do not rewrite code unless I ask.",
  },
  {
    label: "PR ready",
    body: "Prepare this branch for PR: inspect git status and diff, run the relevant checks, update docs or status notes when needed, commit focused changes, push, and summarize CI state.",
  },
  {
    label: "Research Reddit",
    body: "Research Reddit and primary sources for: <topic>. Separate direct evidence from inference, cite sources, compare the strongest arguments, and end with the decision I should make.",
  },
  {
    label: "Thread checkpoint",
    body: "Write a concise checkpoint for this thread: current goal, completed work, important files, verification, blockers, and exact next commands.",
  },
];

module.exports = class CodexWorkflowKit {
  start() {
    this.lastEditable = null;
    this.onFocusIn = (event) => {
      if (isEditable(event.target)) this.lastEditable = event.target;
    };
    this.onDocumentClick = (event) => {
      const root = document.getElementById(ROOT_ID);
      if (root && !root.contains(event.target)) this.closeMenu();
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
    root.className = "bcwk-root";
    root.innerHTML = [
      '<button type="button" class="bcwk-trigger" aria-expanded="false" aria-haspopup="menu">Prompts</button>',
      '<div class="bcwk-menu" role="menu" hidden>',
      '<div class="bcwk-title">Codex workflows</div>',
      ...PROMPTS.map((prompt, index) => (
        '<button type="button" class="bcwk-item" role="menuitem" data-bcwk-prompt="' + index + '">' +
          '<span class="bcwk-item-label">' + escapeHtml(prompt.label) + '</span>' +
          '<span class="bcwk-item-desc">' + escapeHtml(prompt.body) + '</span>' +
        '</button>'
      )),
      "</div>",
    ].join("");

    root.querySelector(".bcwk-trigger").addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = root.querySelector(".bcwk-menu");
      const isOpen = !menu.hidden;
      menu.hidden = isOpen;
      event.currentTarget.setAttribute("aria-expanded", String(!isOpen));
    });

    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-bcwk-prompt]");
      if (!button) return;
      event.stopPropagation();
      const prompt = PROMPTS[Number(button.dataset.bcwkPrompt)];
      if (!prompt) return;
      if (insertIntoComposer(prompt.body, this.lastEditable)) {
        this.closeMenu();
        BdApi.UI.showToast("Inserted " + prompt.label);
      } else {
        BdApi.UI.showToast("Focus the Codex message box first.");
      }
    });

    document.body.appendChild(root);
  }

  closeMenu() {
    const root = document.getElementById(ROOT_ID);
    const menu = root?.querySelector(".bcwk-menu");
    const trigger = root?.querySelector(".bcwk-trigger");
    if (!menu || !trigger) return;
    menu.hidden = true;
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
    .bcwk-root {
      position: fixed;
      right: 18px;
      bottom: 78px;
      z-index: 2147483645;
      font-family: inherit;
    }
    .bcwk-trigger {
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
    .bcwk-trigger:hover {
      background: var(--composer-surface-hover, rgba(255,255,255,0.08));
    }
    .bcwk-menu {
      position: absolute;
      right: 0;
      bottom: 42px;
      width: min(360px, calc(100vw - 32px));
      max-height: min(430px, calc(100vh - 160px));
      overflow: auto;
      border: 1px solid var(--border-default, rgba(255,255,255,0.12));
      border-radius: 10px;
      background: var(--main-surface-primary, #101014);
      color: var(--text-primary, #f4f4f5);
      box-shadow: 0 18px 44px rgba(0,0,0,0.34);
      padding: 8px;
    }
    .bcwk-title {
      color: var(--text-secondary, #a1a1aa);
      font-size: 12px;
      font-weight: 600;
      padding: 5px 7px 8px;
    }
    .bcwk-item {
      display: block;
      width: 100%;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: inherit;
      font: inherit;
      padding: 9px;
      text-align: left;
      cursor: pointer;
    }
    .bcwk-item:hover {
      background: var(--composer-surface-hover, rgba(255,255,255,0.08));
    }
    .bcwk-item-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      line-height: 18px;
    }
    .bcwk-item-desc {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      color: var(--text-secondary, #a1a1aa);
      font-size: 12px;
      line-height: 17px;
      margin-top: 2px;
    }
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
