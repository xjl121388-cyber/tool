import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const inputPath = path.join(projectRoot, "data", "pH标定参数-校准曲线.xlsx");
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheets = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 20,
  tableMaxCols: 20,
  tableMaxCellChars: 120,
});
console.log("=== WORKBOOK ===");
console.log(sheets.ndjson);

const sheetList = await workbook.inspect({ kind: "sheet", include: "id,name" });
console.log("=== SHEETS ===");
console.log(sheetList.ndjson);

const parsedSheets = sheetList.ndjson
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
  .filter((item) => item.name);

for (const item of parsedSheets) {
  const sheetName = item.name;
  const used = workbook.worksheets.getItem(sheetName).getUsedRange();
  console.log(`=== ${sheetName} USED RANGE ===`);
  console.log(used.address);
  const region = await workbook.inspect({
    kind: "region",
    sheetId: sheetName,
    range: used.address.replace(/^.*!/, ""),
    maxChars: 20000,
  });
  console.log(region.ndjson);

  const formulas = await workbook.inspect({
    kind: "formula",
    sheetId: sheetName,
    range: used.address.replace(/^.*!/, ""),
    maxChars: 16000,
    options: { maxResults: 300 },
  });
  console.log(`=== ${sheetName} FORMULAS ===`);
  console.log(formulas.ndjson);

  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 2,
    format: "png",
  });
  await fs.writeFile(
    path.join(projectRoot, "work", sheetName + "-preview.png"),
    new Uint8Array(await preview.arrayBuffer()),
  );
}
