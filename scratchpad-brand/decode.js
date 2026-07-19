const fs = require("fs");
let s = fs.readFileSync("brand-guidelines.html", "utf8");
let d = s
  .replace(/\\u003c/gi, "<")
  .replace(/\\u003e/gi, ">")
  .replace(/\\u0026/gi, "&")
  .replace(/\\u002f/gi, "/")
  .replace(/\\n/g, "\n")
  .replace(/\\t/g, "\t")
  .replace(/\\"/g, '"')
  .replace(/\\\//g, "/");
fs.writeFileSync("brand-decoded.html", d);
console.log("decoded bytes:", d.length);
