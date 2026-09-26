const fs = require("fs");

const files = ["src/db.ts", "src/sync.ts", "src/pairing.ts"];
for (const f of files) {
  console.log(`\n\n========== ${f} ==========`);
  console.log(fs.readFileSync(f, "utf8"));
}

console.log("\n\n========== App.tsx (first 200 lines) ==========");
console.log(fs.readFileSync("src/App.tsx", "utf8").split("\n").slice(0, 200).join("\n"));
