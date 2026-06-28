"use strict";

const {markerEnd, markerStart} = require("./constants");

function patchBootstrapSource(source, loaderPath) {
  const block = [
    markerStart,
    "try {",
    `  require(${JSON.stringify(loaderPath)});`,
    "} catch (error) {",
    "  console.error('[BetterCodex] failed to load runtime', error);",
    "}",
    markerEnd,
    "",
  ].join("\n");

  if (hasLoader(source)) {
    return source.replace(loaderRegex(), block);
  }
  return `${block}${source}`;
}

function stripLoader(source) {
  return source.replace(loaderRegex(), "");
}

function hasLoader(source) {
  return source.includes(markerStart) && source.includes(markerEnd);
}

function loaderRegex() {
  return new RegExp(`${escapeRegex(markerStart)}[\\s\\S]*?${escapeRegex(markerEnd)}\\n?\\n?`, "m");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  hasLoader,
  patchBootstrapSource,
  stripLoader,
};
