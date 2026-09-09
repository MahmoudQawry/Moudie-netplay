const fs = require("fs");
const path = require("path");
const src = fs.readFileSync("lib/language.tsx", "utf8");
const blocks = {};
for (const loc of ["en", "ar", "fr"]) {
  const m = src.match(new RegExp("\\n  " + loc + ": \\{([\\s\\S]*?)\\n  \\},"));
  const keys = new Set([...(m ? m[1] : "").matchAll(/^ {4}([A-Za-z][A-Za-z0-9]*):/gm)].map((x) => x[1]));
  blocks[loc] = keys;
}
const used = new Set();
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?)$/.test(e.name)) {
      const c = fs.readFileSync(p, "utf8");
      for (const m of c.matchAll(/t\("([A-Za-z0-9]+)"\)/g)) used.add(m[1]);
    }
  }
}
walk("app");
walk("components");
walk("lib");
// Ignore common false positives like import("jsnes") or map.get("state").
const ignored = new Set(["jsnes", "peerjs", "error", "code", "state", "sessionToken"]);
const missing = [...used].filter((k) => !ignored.has(k) && !blocks.en.has(k));
console.log("dict sizes en/ar/fr:", [...["en","ar","fr"]].map((l) => blocks[l].size).join("/"));
console.log("used keys:", used.size);
console.log("missing from dict:", JSON.stringify(missing));
const parity = [...blocks.en].filter((k) => !blocks.ar.has(k) || !blocks.fr.has(k));
console.log("parity gaps:", JSON.stringify(parity));
