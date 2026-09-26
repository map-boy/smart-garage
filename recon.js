const XLSX = require("xlsx");
const FILE = "C:\\Users\\user\\Downloads\\VOLKSWAGEN SEP.xlsx";
const wb = XLSX.readFile(FILE, { cellDates: true });
const dateRe = /^\s*(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})/;
const show = (a, c) => `${a}=${JSON.stringify(c.v)}[t:${c.t}${c.z ? ",z:" + c.z : ""}${c.w !== undefined ? ",w:" + c.w : ""}]`;

console.log("SHEETS:", JSON.stringify(wb.SheetNames));
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  if (!ws["!ref"]) { console.log(`\n##### ${name}: EMPTY`); continue; }
  const rg = XLSX.utils.decode_range(ws["!ref"]);
  console.log(`\n##### SHEET "${name}" ref=${ws["!ref"]} (cols 0..${rg.e.c}, rows 0..${rg.e.r}) merges=${JSON.stringify(ws["!merges"] || [])}`);

  console.log("\n--- FIRST 10 ROWS (all columns) ---");
  for (let r = 0; r <= Math.min(9, rg.e.r); r++) {
    const parts = [];
    for (let c = 0; c <= rg.e.c; c++) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a]) parts.push(show(a, ws[a])); }
    console.log(`row ${r + 1}: ${parts.join("  ") || "(empty)"}`);
  }

  console.log("\n--- COLUMN DATE STATS ---");
  for (let c = 0; c <= rg.e.c; c++) {
    let nd = 0, nfmt = 0, nstr = 0, tot = 0; const samples = [];
    for (let r = 0; r <= rg.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (!cell) continue; tot++;
      if (cell.t === "d") { nd++; if (samples.length < 3) samples.push(show(XLSX.utils.encode_cell({ r, c }), cell)); }
      else if (cell.t === "n" && cell.z && /[dmy]/i.test(cell.z) && !/^0|General|#/.test(cell.z)) { nfmt++; if (samples.length < 3) samples.push(show(XLSX.utils.encode_cell({ r, c }), cell)); }
      else if (cell.t === "s" && dateRe.test(cell.v)) { nstr++; if (samples.length < 3) samples.push(show(XLSX.utils.encode_cell({ r, c }), cell)); }
    }
    console.log(`col ${XLSX.utils.encode_col(c)} (${c}): cells=${tot} dateType=${nd} dateFormatted=${nfmt} dateLikeText=${nstr} ${samples.join(" ; ")}`);
  }

  console.log("\n--- NON-DATA ROWS (no plate in col C, but other cells filled; first 60) ---");
  let shown = 0;
  for (let r = 0; r <= rg.e.r && shown < 60; r++) {
    const plate = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    if (plate && String(plate.v).trim()) continue;
    const parts = [];
    for (let c = 0; c <= rg.e.c; c++) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a] && String(ws[a].v).trim() !== "") parts.push(show(a, ws[a])); }
    if (parts.length) { console.log(`row ${r + 1}: ${parts.join("  ")}`); shown++; }
  }

  console.log("\n--- COLUMNS G+ (beyond F) sample, first 15 filled cells ---");
  let n = 0;
  for (const k of Object.keys(ws)) { if (k[0] === "!") continue; const c = XLSX.utils.decode_cell(k); if (c.c > 5 && n < 15) { console.log(show(k, ws[k])); n++; } }
  if (!n) console.log("(none)");

  console.log("\n--- LAST 6 ROWS ---");
  for (let r = Math.max(0, rg.e.r - 5); r <= rg.e.r; r++) {
    const parts = [];
    for (let c = 0; c <= rg.e.c; c++) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a]) parts.push(show(a, ws[a])); }
    console.log(`row ${r + 1}: ${parts.join("  ") || "(empty)"}`);
  }
}
