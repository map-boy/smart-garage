const fs = require("fs");

console.log("========== Cargo.toml ==========");
console.log(fs.readFileSync("src-tauri/Cargo.toml", "utf8"));

const text = fs.readFileSync("src-tauri/src/main.rs", "utf8");

console.log("\n========== ALTER TABLE / migration statements ==========");
(text.match(/ALTER TABLE[^;]*;/gis) || []).forEach(s => console.log(s.replace(/\s+/g," ")));

function block(name) {
  const re = new RegExp(`fn\\s+${name}\\s*\\([\\s\\S]*?\\n}\\n`, "m");
  const m = text.match(re);
  return m ? m[0] : `!!! ${name} not found by this regex !!!`;
}

console.log("\n========== fn add_client ==========");
console.log(block("add_client"));
console.log("\n========== fn list_clients ==========");
console.log(block("list_clients"));
console.log("\n========== fn add_visit ==========");
console.log(block("add_visit"));
console.log("\n========== fn queue_pending ==========");
console.log(block("queue_pending"));

console.log("\n========== struct Db / setup / migrate fn (first 150 lines of file) ==========");
console.log(text.split("\n").slice(0, 150).join("\n"));
