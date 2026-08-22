const GH_SHEET_NAME = '產品匯入';
const GH_FIRST_DATA_ROW = 3;
const GH_PRODUCT_COLUMN_COUNT = 32;
const GH_PROP_BASE_URL = 'GH_CRM_BASE_URL';
const GH_PROP_SECRET = 'GH_PRODUCT_SYNC_SECRET';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('光輝系統')
    .addItem('設定同步連線', 'setupProductSync')
    .addSeparator()
    .addItem('同步目前選取列', 'syncSelectedRows')
    .addItem('同步全部待處理資料', 'syncPendingRows')
    .addItem('從 CRM 更新試算表', 'pullProductsFromCrm')
    .addToUi();
}

function setupProductSync() {
  const ui = SpreadsheetApp.getUi();
  const current = PropertiesService.getScriptProperties();
  const basePrompt = ui.prompt(
    '設定光輝系統網址',
    '請輸入正式系統網址，例如：https://crmapp-topaz.vercel.app',
    ui.ButtonSet.OK_CANCEL,
  );
  if (basePrompt.getSelectedButton() !== ui.Button.OK) return;
  const baseUrl = basePrompt.getResponseText().trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('系統網址必須使用 https://');

  const secretPrompt = ui.prompt(
    '設定同步密鑰',
    '請貼上 Vercel 的 GOOGLE_PRODUCT_SYNC_SECRET。密鑰只會存放在 Apps Script 屬性中。',
    ui.ButtonSet.OK_CANCEL,
  );
  if (secretPrompt.getSelectedButton() !== ui.Button.OK) return;
  const secret = secretPrompt.getResponseText().trim();
  if (secret.length < 24) throw new Error('同步密鑰至少需要 24 個字元');

  current.setProperties({
    [GH_PROP_BASE_URL]: baseUrl,
    [GH_PROP_SECRET]: secret,
  });

  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'syncPendingRows')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('syncPendingRows').timeBased().everyMinutes(1).create();
  ui.alert('設定完成', '已啟用每分鐘批次同步。請先執行「從 CRM 更新試算表」。', ui.ButtonSet.OK);
}

function onEdit(event) {
  if (!event || !event.range) return;
  const sheet = event.range.getSheet();
  if (sheet.getName() !== GH_SHEET_NAME) return;
  if (event.range.getRow() < GH_FIRST_DATA_ROW) return;
  if (event.range.getColumn() > GH_PRODUCT_COLUMN_COUNT) return;

  const headers = headerMap_(sheet);
  const statusColumn = headers['同步狀態'];
  const messageColumn = headers['同步訊息'];
  if (!statusColumn) return;

  const rowCount = event.range.getNumRows();
  sheet.getRange(event.range.getRow(), statusColumn, rowCount, 1).setValue('待同步');
  if (messageColumn) sheet.getRange(event.range.getRow(), messageColumn, rowCount, 1).clearContent();
}

function syncSelectedRows() {
  const sheet = activeProductSheet_();
  const range = sheet.getActiveRange();
  if (!range) throw new Error('請先選取要同步的資料列');
  const start = Math.max(range.getRow(), GH_FIRST_DATA_ROW);
  const end = range.getLastRow();
  if (end < start) throw new Error('請選取第 3 列之後的產品資料');
  pushRows_(sheet, range_(start, end));
}

function syncPendingRows() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(GH_SHEET_NAME);
  if (!sheet) return;
  const headers = headerMap_(sheet);
  const statusColumn = headers['同步狀態'];
  const productNameColumn = headers['產品名稱'];
  if (!statusColumn || !productNameColumn || sheet.getLastRow() < GH_FIRST_DATA_ROW) return;

  const rowCount = sheet.getLastRow() - GH_FIRST_DATA_ROW + 1;
  const statuses = sheet.getRange(GH_FIRST_DATA_ROW, statusColumn, rowCount, 1).getDisplayValues();
  const names = sheet.getRange(GH_FIRST_DATA_ROW, productNameColumn, rowCount, 1).getDisplayValues();
  const pending = [];
  for (let index = 0; index < rowCount && pending.length < 100; index += 1) {
    if (statuses[index][0] === '待同步' && names[index][0].trim()) pending.push(GH_FIRST_DATA_ROW + index);
  }
  if (pending.length) pushRows_(sheet, pending);
}

function pullProductsFromCrm() {
  const sheet = activeProductSheet_();
  const config = config_();
  const spreadsheetId = SpreadsheetApp.getActive().getId();
  const response = UrlFetchApp.fetch(
    `${config.baseUrl}/api/products/google-sync/pull?sheetId=${encodeURIComponent(spreadsheetId)}`,
    {
      method: 'get',
      muteHttpExceptions: true,
      headers: { 'x-gh-product-sync-secret': config.secret },
    },
  );
  const payload = parseResponse_(response);
  const remoteRows = payload.rows || [];
  const headers = headerList_(sheet);
  const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));
  const idIndex = headerIndex['CRM產品ID'];
  const statusIndex = headerIndex['同步狀態'];
  const modelIndex = headerIndex['型號'];
  const skuIndex = headerIndex['官網SKU'];
  if (idIndex == null || statusIndex == null) throw new Error('找不到同步系統欄位');

  const lastRow = Math.max(sheet.getLastRow(), GH_FIRST_DATA_ROW - 1);
  const existing = lastRow >= GH_FIRST_DATA_ROW
    ? sheet.getRange(GH_FIRST_DATA_ROW, 1, lastRow - GH_FIRST_DATA_ROW + 1, headers.length).getValues()
    : [];
  const byId = new Map();
  const byModel = new Map();
  const bySku = new Map();
  existing.forEach((row, index) => {
    const rowNo = GH_FIRST_DATA_ROW + index;
    const id = normalize_(row[idIndex]);
    const model = normalize_(row[modelIndex]);
    const sku = normalize_(row[skuIndex]);
    if (id) byId.set(id, rowNo);
    if (model) byModel.set(model, rowNo);
    if (sku) bySku.set(sku, rowNo);
  });

  let appended = Math.max(lastRow + 1, GH_FIRST_DATA_ROW);
  let updated = 0;
  let skipped = 0;
  remoteRows.forEach(remote => {
    const values = remote.values || {};
    const id = normalize_(values['CRM產品ID']);
    const model = normalize_(values['型號']);
    const sku = normalize_(values['官網SKU']);
    const rowNo = byId.get(id) || byModel.get(model) || bySku.get(sku) || appended++;
    const currentStatus = String(sheet.getRange(rowNo, statusIndex + 1).getDisplayValue() || '');
    if (['待同步', '衝突'].includes(currentStatus)) {
      skipped += 1;
      return;
    }
    const rowValues = headers.map(header => sheetSafeValue_(values[header] == null ? '' : values[header]));
    sheet.getRange(rowNo, 1, 1, headers.length).setValues([rowValues]);
    byId.set(id, rowNo);
    if (model) byModel.set(model, rowNo);
    if (sku) bySku.set(sku, rowNo);
    updated += 1;
  });

  SpreadsheetApp.getUi().alert(
    'CRM 更新完成',
    `已更新 ${updated} 筆${skipped ? `，保留 ${skipped} 筆待同步／衝突資料` : ''}。`,
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}

function pushRows_(sheet, rowNumbers) {
  if (!rowNumbers.length) return;
  const config = config_();
  const headers = headerList_(sheet);
  const spreadsheetId = SpreadsheetApp.getActive().getId();
  const rows = rowNumbers.slice(0, 100).map(rowNo => {
    const cells = sheet.getRange(rowNo, 1, 1, headers.length).getValues()[0];
    const values = {};
    headers.forEach((header, index) => { if (header) values[header] = jsonValue_(cells[index]); });
    return { rowNo, values };
  });
  const response = UrlFetchApp.fetch(`${config.baseUrl}/api/products/google-sync/push`, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-gh-product-sync-secret': config.secret },
    payload: JSON.stringify({ sheetId: spreadsheetId, rows }),
  });
  const payload = parseResponse_(response);
  writeResults_(sheet, payload.results || []);
}

function writeResults_(sheet, results) {
  const headers = headerMap_(sheet);
  results.forEach(result => {
    const row = Number(result.rowNo);
    // 衝突時不可偷偷換成 CRM 的新版本號，否則下一次編輯可能繞過重新拉取保護。
    if (result.ok && headers['CRM產品ID'] && result.id) sheet.getRange(row, headers['CRM產品ID']).setValue(result.id);
    if (result.ok && headers['CRM更新時間'] && result.updatedAt) sheet.getRange(row, headers['CRM更新時間']).setValue(result.updatedAt);
    if (headers['同步狀態']) sheet.getRange(row, headers['同步狀態']).setValue(result.status || (result.ok ? '已同步' : '錯誤'));
    if (headers['最後同步時間']) sheet.getRange(row, headers['最後同步時間']).setValue(new Date());
    if (headers['同步訊息']) sheet.getRange(row, headers['同步訊息']).setValue(result.message || '');
  });
}

function parseResponse_(response) {
  const text = response.getContentText();
  let payload;
  try { payload = JSON.parse(text); } catch (error) { throw new Error(`系統回應不是 JSON（HTTP ${response.getResponseCode()}）`); }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(payload.error || `同步失敗（HTTP ${response.getResponseCode()}）`);
  }
  return payload;
}

function config_() {
  const properties = PropertiesService.getScriptProperties();
  const baseUrl = properties.getProperty(GH_PROP_BASE_URL);
  const secret = properties.getProperty(GH_PROP_SECRET);
  if (!baseUrl || !secret) throw new Error('尚未設定同步連線，請先執行「光輝系統 → 設定同步連線」');
  return { baseUrl, secret };
}

function activeProductSheet_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(GH_SHEET_NAME);
  if (!sheet) throw new Error(`找不到工作表：${GH_SHEET_NAME}`);
  return sheet;
}

function headerList_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(value => value.trim());
}

function headerMap_(sheet) {
  return Object.fromEntries(headerList_(sheet).map((header, index) => [header, index + 1]));
}

function range_(start, end) {
  const rows = [];
  for (let row = start; row <= end; row += 1) rows.push(row);
  return rows;
}

function normalize_(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function jsonValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return '';
  if (typeof value === 'object') return '';
  return value;
}

function sheetSafeValue_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? `'${value}` : value;
}
