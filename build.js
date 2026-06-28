#!/usr/bin/env node
/* Bundles index.html + all CSS/JS into a single standalone.html
   (no build tools, no dependencies). Run: node build.js */
"use strict";
const fs = require("fs");

let html = fs.readFileSync("index.html", "utf8");

// Inline <link rel="stylesheet" href="assets/....css?v=..">
html = html.replace(/<link rel="stylesheet" href="(assets\/[^"?]+)(\?[^"]*)?"\s*\/>/g, function (m, p) {
  return "<style>\n" + fs.readFileSync(p, "utf8") + "\n</style>";
});

// Inline <script src="assets/....js?v=.."></script> in document order
html = html.replace(/<script src="(assets\/[^"?]+)(\?[^"]*)?"><\/script>/g, function (m, p) {
  var js = fs.readFileSync(p, "utf8").replace(/<\/script>/g, "<\\/script>");
  return "<script>\n" + js + "\n</script>";
});

fs.writeFileSync("standalone.html", html);
console.log("Wrote standalone.html (" + html.length + " bytes)");
