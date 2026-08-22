import fs from "node:fs/promises";
import { createRequire } from "node:module";

const runtimeRequire = createRequire(
  "file:///C:/Users/10319/.codex/visualizations/2026/08/21/01a0265e-5ae8-7211-9862-7ba1b66a7e1e/spreadsheet-work/package.json",
);
const { SpreadsheetFile, Workbook } = runtimeRequire("@oai/artifact-tool");

const outputDir = "D:/Guanghui_AI_System/CRMAPP/outputs/01a0265e-5ae8-7211-9862-7ba1b66a7e1e";
const previewDir = "C:/Users/10319/.codex/visualizations/2026/08/21/01a0265e-5ae8-7211-9862-7ba1b66a7e1e/spreadsheet-work/previews";
const outputPath = `${outputDir}/光輝系統_產品批次匯入範本.xlsx`;

const columns = [
  ["品牌", "文字", "", "例：JBL", 14],
  ["產品名稱", "文字", "必填", "CRM 產品名稱；同一系列的各 SKU 可寫各自完整名稱", 30],
  ["型號", "文字", "建議必填", "第一比對鍵，不可重複；每個變體要有自己的型號", 20],
  ["主分類", "文字", "", "找不到時系統會自動建立", 14],
  ["次分類", "文字", "", "需與主分類成對填寫", 16],
  ["單位", "文字", "", "預設「台」", 9],
  ["建議售價", "數字", "", "只填數字，不要輸入逗號或貨幣符號", 13],
  ["成本", "數字", "", "只填數字", 12],
  ["寬cm", "數字", "", "產品寬度，單位 cm", 9],
  ["深cm", "數字", "", "產品深度，單位 cm", 9],
  ["高cm", "數字", "", "產品高度，單位 cm", 9],
  ["備註", "文字", "", "CRM 內部備註", 24],
  ["啟用", "是／否", "", "預設是", 9],
  ["官網SKU", "文字", "建議必填", "第二比對鍵；每個變體要有自己的 SKU", 18],
  ["官網分類", "文字", "", "多個分類用逗號分隔", 22],
  ["官網售價", "數字", "", "官網顯示售價", 13],
  ["官網產品介紹", "文字／HTML", "", "對應官網單一商品頁的主要產品介紹", 42],
  ["系列代碼", "文字", "變體時必填", "同商品的不同顏色／配件填相同代碼", 18],
  ["變體屬性", "文字", "變體時必填", "例：顏色、麥克風款式；未填時預設顏色", 16],
  ["變體選項", "文字", "變體時必填", "例：黑色、白色、耳掛式、手持式", 16],
  ["系列主商品", "是／否", "變體時必填", "每個系列只能一筆填「是」；父商品圖文以此筆為準", 13],
  ["規格HTML", "文字／HTML", "", "可放 HTML 規格表", 38],
  ["BSMI字號", "文字", "", "如適用請填寫", 16],
  ["NCC字號", "文字", "", "如適用請填寫", 16],
  ["上架", "是／否", "", "建議先填「否」，匯入 CRM 檢查後再同步官網", 9],
  ["產品特色", "清單", "", "多項用半形 | 分隔；每項最多 5 字、最多 10 項", 30],
  ["篩選規格", "規格清單", "", "格式：規格=值｜規格=值；同規格多值用逗號", 48],
  ["主圖網址", "網址", "", "公開 http(s) 圖片網址；系統會轉成 600×600 WebP", 40],
  ["其他圖片網址", "網址清單", "", "多張圖片網址用半形 | 分隔", 40],
];

const headers = columns.map((c) => c[0]);
const notes = columns.map((c) => c[3]);
const lastColumn = "AC";
const blankRows = Array.from({ length: 200 }, () => Array(headers.length).fill(""));

const workbook = Workbook.create();
const importSheet = workbook.worksheets.add("產品匯入");
const exampleSheet = workbook.worksheets.add("變體範例");
const fieldSheet = workbook.worksheets.add("欄位說明");
const helpSheet = workbook.worksheets.add("使用說明");

function styleHeader(sheet, rowNumber) {
  sheet.getRange(`A${rowNumber}:M${rowNumber}`).format = {
    fill: "#183153",
    font: { bold: true, color: "#FFFFFF", size: 10 },
    verticalAlignment: "center",
    horizontalAlignment: "center",
    wrapText: true,
    borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
  };
  sheet.getRange(`N${rowNumber}:Y${rowNumber}`).format = {
    fill: "#2563EB",
    font: { bold: true, color: "#FFFFFF", size: 10 },
    verticalAlignment: "center",
    horizontalAlignment: "center",
    wrapText: true,
    borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
  };
  sheet.getRange(`Z${rowNumber}:AC${rowNumber}`).format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF", size: 10 },
    verticalAlignment: "center",
    horizontalAlignment: "center",
    wrapText: true,
    borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
  };
  sheet.getRange(`A${rowNumber}:${lastColumn}${rowNumber}`).format.rowHeight = 32;
}

function applyColumnWidths(sheet, startRow, endRow) {
  columns.forEach((col, index) => {
    const letter = columnLetter(index + 1);
    sheet.getRange(`${letter}${startRow}:${letter}${endRow}`).format.columnWidth = col[4];
  });
}

function columnLetter(number) {
  let value = number;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

// 第一張工作表必須維持匯入程式可直接讀取的結構：第 1 列表頭，第 2 列說明。
importSheet.getRange("A1:AC1").values = [headers];
importSheet.getRange("A2:AC2").values = [notes];
importSheet.getRange("A3:AC202").values = blankRows;
styleHeader(importSheet, 1);
importSheet.getRange("A2:M2").format.fill = "#E8EEF6";
importSheet.getRange("N2:Y2").format.fill = "#EAF1FF";
importSheet.getRange("Z2:AC2").format.fill = "#E6F5F1";
importSheet.getRange("A2:AC2").format.font = { italic: true, color: "#52606D", size: 9 };
importSheet.getRange("A2:AC2").format.wrapText = true;
importSheet.getRange("A2:AC2").format.rowHeight = 48;
importSheet.getRange("A3:AC202").format = {
  fill: "#FFFFFF",
  font: { color: "#1F2937", size: 10 },
  verticalAlignment: "top",
  borders: { preset: "inside", style: "thin", color: "#E5E7EB" },
};
importSheet.getRange("B3:B202").format.fill = "#FFF7D6";
importSheet.getRange("C3:C202").format.numberFormat = "@";
importSheet.getRange("N3:N202").format.numberFormat = "@";
importSheet.getRange("G3:H202").format.numberFormat = "#,##0";
importSheet.getRange("I3:K202").format.numberFormat = "0.0";
importSheet.getRange("P3:P202").format.numberFormat = "#,##0";
for (const range of ["M3:M202", "U3:U202", "Y3:Y202"]) {
  importSheet.getRange(range).dataValidation = { rule: { type: "list", values: ["是", "否"] } };
}
importSheet.freezePanes.freezeRows(1);
importSheet.showGridLines = false;
applyColumnWidths(importSheet, 1, 202);

// 變體範例：一組配件變體與一組顏色變體。
exampleSheet.getRange("A1:AC1").merge();
exampleSheet.getRange("A1").values = [["變體填寫範例（複製需要的資料列到「產品匯入」工作表）"]];
exampleSheet.getRange("A2:AC2").merge();
exampleSheet.getRange("A2").values = [["重點：同系列填相同「系列代碼」，每個 SKU 的型號與官網 SKU 要不同，而且每個系列只能一筆「系列主商品＝是」。"]];
exampleSheet.getRange("A4:AC4").values = [headers];
styleHeader(exampleSheet, 4);

const accessoryPrimary = [
  "光輝", "AMP100 移動式擴音機－耳掛麥克風", "AMP100-H", "擴音設備", "移動式擴音機", "台",
  19800, 12000, 30, 25, 45, "含耳掛式麥克風", "是", "AMP100-H", "移動式擴音機", 19800,
  "<p>AMP100 移動式擴音機，提供耳掛式與手持式麥克風組合可選。</p>", "AMP100", "麥克風款式", "耳掛式", "是",
  "<table><tr><th>輸出功率</th><td>100W</td></tr></table>", "", "", "否",
  "攜帶方便|聲音清晰|公司貨", "speaker_type=全音域｜input_interface=XLR,RCA｜continuous_power_w=100",
  "https://example.com/amp100-h.jpg", "https://example.com/amp100-side.jpg|https://example.com/amp100-back.jpg",
];
const accessorySecondary = [
  "光輝", "AMP100 移動式擴音機－手持麥克風", "AMP100-M", "擴音設備", "移動式擴音機", "台",
  20800, 12800, 30, 25, 45, "含手持式麥克風", "是", "AMP100-M", "移動式擴音機", 20800,
  "", "AMP100", "麥克風款式", "手持式", "否", "", "", "", "否",
  "攜帶方便|聲音清晰|公司貨", "speaker_type=全音域｜input_interface=XLR,RCA｜continuous_power_w=100",
  "https://example.com/amp100-m.jpg", "",
];
const colorPrimary = [
  "JBL", "JBL Stage A130 書架喇叭－黑色", "STAGE-A130-BK", "喇叭", "書架喇叭", "對",
  12000, 8000, 18, 25, 32, "黑色", "是", "JBL-A130-BK", "書架喇叭", 12000,
  "<p>JBL Stage A130 書架喇叭，黑色與白色可選。</p>", "JBL-A130", "顏色", "黑色", "是",
  "<table><tr><th>型式</th><td>二音路</td></tr></table>", "", "", "否",
  "高音清晰|低頻扎實|公司貨", "speaker_type=書架型｜input_interface=香蕉插,裸線",
  "https://example.com/a130-black.jpg", "",
];
const colorSecondary = [
  "JBL", "JBL Stage A130 書架喇叭－白色", "STAGE-A130-WH", "喇叭", "書架喇叭", "對",
  12000, 8000, 18, 25, 32, "白色", "是", "JBL-A130-WH", "書架喇叭", 12000,
  "", "JBL-A130", "顏色", "白色", "否", "", "", "", "否",
  "高音清晰|低頻扎實|公司貨", "speaker_type=書架型｜input_interface=香蕉插,裸線",
  "https://example.com/a130-white.jpg", "",
];
exampleSheet.getRange("A5:AC8").values = [accessoryPrimary, accessorySecondary, colorPrimary, colorSecondary];
exampleSheet.getRange("A5:AC8").format = {
  font: { color: "#1F2937", size: 10 },
  verticalAlignment: "top",
  wrapText: true,
  borders: { preset: "inside", style: "thin", color: "#E5E7EB" },
};
exampleSheet.getRange("A5:AC6").format.fill = "#F0F7FF";
exampleSheet.getRange("A7:AC8").format.fill = "#F0FDF4";
exampleSheet.getRange("G5:H8").format.numberFormat = "#,##0";
exampleSheet.getRange("I5:K8").format.numberFormat = "0.0";
exampleSheet.getRange("P5:P8").format.numberFormat = "#,##0";
exampleSheet.getRange("A5:AC8").format.rowHeight = 56;
exampleSheet.getRange("A1:AC1").format = { fill: "#0F172A", font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center" };
exampleSheet.getRange("A1:AC1").format.rowHeight = 32;
exampleSheet.getRange("A2:AC2").format = { fill: "#FEF3C7", font: { color: "#92400E", size: 10 }, wrapText: true, verticalAlignment: "center" };
exampleSheet.getRange("A2:AC2").format.rowHeight = 34;
exampleSheet.freezePanes.freezeRows(4);
exampleSheet.showGridLines = false;
applyColumnWidths(exampleSheet, 1, 8);

// 欄位說明。
fieldSheet.getRange("A1:E1").merge();
fieldSheet.getRange("A1").values = [["光輝系統產品批次匯入－欄位說明"]];
fieldSheet.getRange("A3:E3").values = [["欄位", "資料型態", "必要性", "填寫說明", "欄位區"]];
const fieldRows = columns.map((column, index) => [
  column[0], column[1], column[2], column[3], index < 13 ? "CRM 主檔" : index < 25 ? "官網商品" : "特色／篩選／圖片",
]);
fieldSheet.getRange(`A4:E${3 + fieldRows.length}`).values = fieldRows;
fieldSheet.getRange("A1:E1").format = { fill: "#0F172A", font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center" };
fieldSheet.getRange("A1:E1").format.rowHeight = 32;
fieldSheet.getRange("A3:E3").format = { fill: "#2563EB", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
fieldSheet.getRange(`A4:E${3 + fieldRows.length}`).format = {
  font: { color: "#1F2937", size: 10 },
  verticalAlignment: "top",
  wrapText: true,
  borders: { preset: "inside", style: "thin", color: "#E5E7EB" },
};
fieldSheet.getRange(`C4:C${3 + fieldRows.length}`).format.fill = "#FFF7D6";
fieldSheet.getRange(`E4:E${3 + fieldRows.length}`).format.fill = "#EEF2FF";
fieldSheet.getRange("A1:A32").format.columnWidth = 22;
fieldSheet.getRange("B1:B32").format.columnWidth = 16;
fieldSheet.getRange("C1:C32").format.columnWidth = 16;
fieldSheet.getRange("D1:D32").format.columnWidth = 64;
fieldSheet.getRange("E1:E32").format.columnWidth = 22;
fieldSheet.freezePanes.freezeRows(3);
fieldSheet.showGridLines = false;

// 使用流程與防呆規則。
helpSheet.getRange("A1:F1").merge();
helpSheet.getRange("A1").values = [["產品批次匯入使用說明"]];
helpSheet.getRange("A3:B3").values = [["步驟", "操作"]];
const steps = [
  [1, "在「產品匯入」工作表第 3 列開始填資料，一列代表一個 SKU。請勿修改第 1 列表頭。"],
  [2, "先填 CRM 主檔資料；產品名稱必填，型號與官網 SKU 建議都填，避免重複新增。"],
  [3, "同商品不同顏色或配件：系列代碼相同、變體選項不同，而且每列型號與官網 SKU 必須不同。"],
  [4, "每個系列只有一列「系列主商品」填是；官網父商品的名稱、介紹、分類與共用圖片以該列為準。"],
  [5, "篩選規格寫法：解析度=4K UHD｜輸入介面=HDMI,RCA｜亮度=5000。數值規格只填數字。"],
  [6, "第一次匯入時建議「上架」填否：先匯入光輝 CRM，預覽並確認新增／更新，再同步 WooCommerce 草稿。"],
  [7, "確認商品圖文、價格、變體與篩選器都正確後，再於系統內將商品正式上架官網。"],
];
helpSheet.getRange("A4:B10").values = steps;
helpSheet.getRange("A12:F12").merge();
helpSheet.getRange("A12").values = [["常用格式"]];
helpSheet.getRange("A13:B18").values = [
  ["是／否欄位", "是、否、Y、N、TRUE、FALSE"],
  ["多個官網分類", "投影機,商用投影機"],
  ["產品特色", "高音清晰|低頻扎實|公司貨"],
  ["多張圖片", "https://example.com/1.jpg|https://example.com/2.jpg"],
  ["多個篩選規格", "解析度=4K UHD｜輸入介面=HDMI,RCA｜亮度=5000"],
  ["變體範例", "系列代碼=AMP100；變體屬性=麥克風款式；變體選項=耳掛式／手持式"],
];
helpSheet.getRange("A20:F20").merge();
helpSheet.getRange("A20").values = [["重要提醒"]];
helpSheet.getRange("A21:F23").merge(true);
helpSheet.getRange("A21:F23").values = [
  ["• 官網產品介紹會對應官網單一商品頁的主要產品介紹欄位。"],
  ["• 圖片網址必須是可公開讀取的 http(s) 網址；系統會轉成 600×600 WebP 並存入 WordPress 媒體庫。"],
  ["• 匯入前系統會先顯示預覽，可逐筆決定新增、更新或跳過，確認後才會寫入。"],
];
helpSheet.getRange("A1:F1").format = { fill: "#0F172A", font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center" };
helpSheet.getRange("A1:F1").format.rowHeight = 34;
for (const range of ["A3:B3", "A12:F12", "A20:F20"]) {
  helpSheet.getRange(range).format = { fill: "#2563EB", font: { bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
}
helpSheet.getRange("A4:A10").format = { fill: "#EAF1FF", font: { bold: true, color: "#1D4ED8" }, horizontalAlignment: "center" };
helpSheet.getRange("A4:B10").format.borders = { preset: "inside", style: "thin", color: "#D7E0EA" };
helpSheet.getRange("A4:B10").format.wrapText = true;
helpSheet.getRange("A13:B18").format.borders = { preset: "inside", style: "thin", color: "#D7E0EA" };
helpSheet.getRange("A13:A18").format = { fill: "#ECFDF5", font: { bold: true, color: "#047857" } };
helpSheet.getRange("A13:B18").format.wrapText = true;
helpSheet.getRange("A21:F23").format = { fill: "#FFF7D6", font: { color: "#7C2D12" }, wrapText: true, verticalAlignment: "center" };
helpSheet.getRange("A1:A23").format.columnWidth = 18;
helpSheet.getRange("B1:B23").format.columnWidth = 88;
helpSheet.getRange("C1:F23").format.columnWidth = 14;
helpSheet.getRange("A4:B10").format.rowHeight = 34;
helpSheet.getRange("A13:B18").format.rowHeight = 28;
helpSheet.getRange("A21:F23").format.rowHeight = 28;
helpSheet.showGridLines = false;

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const checks = [];
checks.push((await workbook.inspect({ kind: "region", sheetId: "產品匯入", range: "A1:AC5", maxChars: 5000 })).ndjson);
checks.push((await workbook.inspect({ kind: "region", sheetId: "變體範例", range: "A1:AC8", maxChars: 8000 })).ndjson);
checks.push((await workbook.inspect({ kind: "region", sheetId: "欄位說明", range: "A1:E32", maxChars: 6000 })).ndjson);
checks.push((await workbook.inspect({ kind: "region", sheetId: "使用說明", range: "A1:F23", maxChars: 6000 })).ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});

const previews = [
  ["import-left.png", "產品匯入", "A1:K8"],
  ["import-middle.png", "產品匯入", "L1:V8"],
  ["import-right.png", "產品匯入", "W1:AC8"],
  ["examples-left.png", "變體範例", "A1:K8"],
  ["examples-middle.png", "變體範例", "L1:V8"],
  ["examples-right.png", "變體範例", "W1:AC8"],
  ["fields.png", "欄位說明", "A1:E32"],
  ["help.png", "使用說明", "A1:F23"],
];
for (const [fileName, sheetName, range] of previews) {
  const preview = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(`${previewDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({ outputPath, checks, formulaErrors: errors.ndjson, previewDir }, null, 2));
