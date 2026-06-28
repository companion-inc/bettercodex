/**
 * @name Hello Codex
 * @version 0.1.0
 * @description Adds a small Store-installed greeting action.
 * @author Companion
 */
module.exports = class HelloCodex {
  start() {
    BdApi.UI.showToast("Hello from BetterCodex");
  }

  stop() {}
};
