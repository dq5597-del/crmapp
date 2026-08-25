/**
 * 產品匯入表排序 — 光輝影音科技
 *
 * 排序規則：品牌 A→Z → 型號 A→Z
 *   - 英文／數字開頭排在前，中文排在後
 *   - 中文依筆畫由少到多（zh-Hant 預設即為筆畫序）
 *
 * 重要：本檔以 setValues() 程式化寫入，不會觸發 onEdit(),
 * 因此排序不會把資料列標記成「待同步」，也不會觸發每分鐘的
 * syncPendingRows 把整表回推 CRM。請勿改用手動排序或
 * Range.sort() 以外的 UI 操作。
 */

const GH_SORT_SHEET_NAME = '產品匯入';
const GH_SORT_FIRST_DATA_ROW = 3;

// 同系列變體商品是否要黏在一起（品牌 → 系列代碼 → 型號）。
// 預設 false＝完全照「品牌→型號」排，同系列可能被拆散。
const GH_SORT_KEEP_VARIANT_GROUPS = false;

function sortProductsByBrand() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActive().getSheetByName(GH_SORT_SHEET_NAME);
  if (!sheet) throw new Error('找不到工作表：' + GH_SORT_SHEET_NAME);

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const rowCount = lastRow - GH_SORT_FIRST_DATA_ROW + 1;
  if (rowCount < 2) {
    ui.alert('沒有需要排序的資料列');
    return;
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  const idx = {};
  headers.forEach(function (h, i) { idx[h] = i; });

  ['品牌', '型號'].forEach(function (h) {
    if (idx[h] == null) throw new Error('表頭缺少必要欄位：' + h);
  });

  // 排序前先擋掉未同步的資料，避免順序變動後對不上人工記憶
  const statusCol = idx['同步狀態'];
  const range = sheet.getRange(GH_SORT_FIRST_DATA_ROW, 1, rowCount, lastCol);
  const values = range.getValues();

  if (statusCol != null) {
    const blocked = values.filter(function (r) {
      const s = String(r[statusCol] || '').trim();
      return s === '待同步' || s === '衝突';
    }).length;
    if (blocked > 0) {
      const answer = ui.alert(
        '仍有未同步的資料',
        '有 ' + blocked + ' 列處於「待同步／衝突」狀態。\n' +
        '建議先完成同步再排序，以免之後難以核對。\n\n要繼續排序嗎？',
        ui.ButtonSet.YES_NO
      );
      if (answer !== ui.Button.YES) return;
    }
  }

  const collator = ghSortCollator_();
  const keyCols = GH_SORT_KEEP_VARIANT_GROUPS && idx['系列代碼'] != null
    ? [idx['品牌'], idx['系列代碼'], idx['型號']]
    : [idx['品牌'], idx['型號']];

  // 空白品牌／型號一律沉到最底，不與有資料的列交錯
  const decorated = values.map(function (row, i) {
    return { row: row, i: i, empty: keyCols.every(function (c) { return !String(row[c] || '').trim(); }) };
  });

  decorated.sort(function (a, b) {
    if (a.empty !== b.empty) return a.empty ? 1 : -1;
    for (let k = 0; k < keyCols.length; k += 1) {
      const c = ghSortCompare_(collator, a.row[keyCols[k]], b.row[keyCols[k]]);
      if (c !== 0) return c;
    }
    return a.i - b.i; // 穩定排序：其餘維持原順序
  });

  range.setValues(decorated.map(function (d) { return d.row; }));
  SpreadsheetApp.flush();

  ui.alert(
    '排序完成',
    '已依「品牌 → 型號」重新排列 ' + rowCount + ' 列。' +
    (collator ? '' : '\n\n⚠ 這個環境不支援 Intl.Collator，中文改用碼位順排列，不是筆畫順。請回報這個訊息。'),
    ui.ButtonSet.OK
  );
}

function ghSortCollator_() {
  // zh-Hant 預設排序法即為筆畫序（少→多）；numeric 讓 QL2 排在 QL10 前面
  try {
    return new Intl.Collator('zh-Hant-u-co-stroke', { numeric: true, sensitivity: 'base' });
  } catch (e) {
    return null;
  }
}

function ghSortCompare_(collator, a, b) {
  const x = String(a == null ? '' : a).trim();
  const y = String(b == null ? '' : b).trim();
  if (!x && !y) return 0;
  if (!x) return 1;   // 空值排最後
  if (!y) return -1;

  // 英文／數字開頭排在中文之前
  const ax = ghSortIsLatin_(x) ? 0 : 1;
  const ay = ghSortIsLatin_(y) ? 0 : 1;
  if (ax !== ay) return ax - ay;

  if (collator) return collator.compare(x, y);
  return x.toUpperCase() < y.toUpperCase() ? -1 : x.toUpperCase() > y.toUpperCase() ? 1 : 0;
}

function ghSortIsLatin_(s) {
  return /^[A-Za-z0-9]/.test(s);
}

/**
 * 資料健檢 — 只提報問題，不修改任何資料。
 * 結果寫進一張「資料檢查」工作表。
 */
function checkProductData() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(GH_SORT_SHEET_NAME);
  if (!sheet) throw new Error('找不到工作表：' + GH_SORT_SHEET_NAME);

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const rowCount = lastRow - GH_SORT_FIRST_DATA_ROW + 1;
  if (rowCount < 1) { ui.alert('沒有資料可檢查'); return; }

  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
  const idx = {};
  headers.forEach(function (h, i) { idx[h] = i; });
  const values = sheet.getRange(GH_SORT_FIRST_DATA_ROW, 1, rowCount, lastCol).getValues();

  const issues = [];
  const seenModel = new Map();
  const seenSku = new Map();
  const brandVariants = new Map();

  values.forEach(function (row, i) {
    const rowNo = GH_SORT_FIRST_DATA_ROW + i;
    const name = ghText_(row[idx['產品名稱']]);
    const brand = ghText_(row[idx['品牌']]);
    const model = ghText_(row[idx['型號']]);
    const sku = idx['官網SKU'] != null ? ghText_(row[idx['官網SKU']]) : '';
    if (!name && !brand && !model) return; // 空列略過

    if (!name) issues.push([rowNo, '缺產品名稱', brand + ' ' + model]);
    if (!brand) issues.push([rowNo, '缺品牌', name]);
    if (!model) issues.push([rowNo, '缺型號', brand + ' ' + name]);

    if (model) {
      const key = model.toUpperCase();
      if (seenModel.has(key)) issues.push([rowNo, '型號重複', '與第 ' + seenModel.get(key) + ' 列相同：' + model]);
      else seenModel.set(key, rowNo);
    }
    if (sku) {
      const key = sku.toUpperCase();
      if (seenSku.has(key)) issues.push([rowNo, '官網SKU重複', '與第 ' + seenSku.get(key) + ' 列相同：' + sku]);
      else seenSku.set(key, rowNo);
    }

    // 品牌名大小寫／空白不一致
    if (brand) {
      const norm = brand.replace(/\s+/g, '').toUpperCase();
      if (!brandVariants.has(norm)) brandVariants.set(norm, new Map());
      const m = brandVariants.get(norm);
      m.set(brand, (m.get(brand) || 0) + 1);
    }

    const price = ghNum_(row[idx['建議售價']]);
    const cost = ghNum_(row[idx['成本']]);
    if (price != null && cost != null && price > 0 && cost > 0 && cost > price) {
      issues.push([rowNo, '成本高於售價', '售價 ' + price + ' / 成本 ' + cost]);
    }
    if (price === 0 && name) issues.push([rowNo, '售價為 0', name]);
  });

  brandVariants.forEach(function (m) {
    if (m.size > 1) {
      issues.push(['—', '品牌名寫法不一致', Array.from(m.keys()).join(' ｜ ')]);
    }
  });

  let out = ss.getSheetByName('資料檢查');
  if (!out) out = ss.insertSheet('資料檢查');
  out.clear();
  out.getRange(1, 1, 1, 3).setValues([['列號', '問題類型', '說明']]).setFontWeight('bold');
  if (issues.length) {
    out.getRange(2, 1, issues.length, 3).setValues(issues);
  } else {
    out.getRange(2, 1).setValue('沒有發現問題');
  }
  out.autoResizeColumns(1, 3);
  ui.alert('檢查完成', '共發現 ' + issues.length + ' 項問題，結果在「資料檢查」工作表。', ui.ButtonSet.OK);
}

function ghText_(v) { return String(v == null ? '' : v).trim(); }

function ghNum_(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[,\s$]/g, ''));
  return isNaN(n) ? null : n;
}
