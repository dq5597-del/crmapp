"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProductXlsx = parseProductXlsx;
const product_import_1 = require("@/lib/product-import");
const MAX_ROWS = 1000;
const EMBEDDED_IMAGE_KEYS = new Set([
    'embedded_main_image',
    'embedded_gallery_images',
    'embedded_description_images',
]);
function cellText(value) {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'object') {
        if ('richText' in value)
            return (value.richText ?? []).map((part) => part.text).join('');
        if ('text' in value)
            return String(value.text ?? '');
        if ('result' in value)
            return String(value.result ?? '');
        if ('hyperlink' in value)
            return String(value.hyperlink ?? '');
        if (value instanceof Date)
            return value.toISOString();
    }
    return String(value).trim();
}
function imageBytes(image) {
    if (image.buffer)
        return new Uint8Array(image.buffer);
    if (!image.base64)
        return null;
    const encoded = image.base64.includes(',') ? image.base64.split(',').pop() ?? '' : image.base64;
    const decoded = atob(encoded);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++)
        bytes[index] = decoded.charCodeAt(index);
    return bytes;
}
function toArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
/** 在瀏覽器解析 XLSX，避免內嵌圖片讓整份活頁簿再次傳往伺服器。 */
async function parseProductXlsx(file) {
    const ExcelJS = (await Promise.resolve().then(() => __importStar(require('exceljs')))).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2)
        throw new Error('檔案沒有資料列');
    const headers = [];
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
        headers[column] = cellText(cell.value);
    });
    const unknownHeaders = headers.filter(Boolean).filter(header => !(0, product_import_1.columnForHeader)(header));
    const rows = [];
    for (let rowNo = 2; rowNo <= worksheet.rowCount && rows.length < MAX_ROWS; rowNo++) {
        const row = worksheet.getRow(rowNo);
        const raw = {};
        let empty = true;
        row.eachCell({ includeEmpty: false }, (cell, column) => {
            const header = headers[column];
            if (!header)
                return;
            const value = cellText(cell.value);
            if (value !== '')
                empty = false;
            raw[header] = value;
        });
        if (empty)
            continue;
        const joined = Object.values(raw).join('');
        if (/^必填|^比對鍵|^例：|^數字，免打逗號/.test(String(raw['產品名稱'] ?? '')))
            continue;
        if (String(raw['產品名稱'] ?? '') === 'JBL Stage A130 書架喇叭' && String(raw['型號'] ?? '') === 'STAGE-A130')
            continue;
        if (!joined.trim())
            continue;
        rows.push((0, product_import_1.parseRow)(rowNo, raw));
    }
    const seenModels = new Map();
    for (const row of rows) {
        const model = String(row.product.model ?? '').trim().toUpperCase();
        if (!model)
            continue;
        if (seenModels.has(model))
            row.errors.push(`型號「${row.product.model}」與第 ${seenModels.get(model)} 列重複`);
        else
            seenModels.set(model, row.rowNo);
    }
    const warnings = [];
    const rowsByNumber = new Map(rows.map(row => [row.rowNo, row]));
    const counters = new Map();
    const embeddedPhotos = [];
    const images = worksheet.getImages().slice().sort((left, right) => (left.range.tl.nativeRow - right.range.tl.nativeRow
        || left.range.tl.nativeCol - right.range.tl.nativeCol
        || left.range.tl.nativeRowOff - right.range.tl.nativeRowOff
        || left.range.tl.nativeColOff - right.range.tl.nativeColOff));
    for (const imageRef of images) {
        const rowNo = imageRef.range.tl.nativeRow + 1;
        const columnNo = imageRef.range.tl.nativeCol + 1;
        const column = (0, product_import_1.columnForHeader)(headers[columnNo] ?? '');
        if (!column || !EMBEDDED_IMAGE_KEYS.has(column.key))
            continue;
        const parsedRow = rowsByNumber.get(rowNo);
        if (!parsedRow)
            continue;
        const identifier = String(parsedRow.product.model ?? parsedRow.product.web_sku ?? '').trim();
        if (!identifier) {
            warnings.push(`第 ${rowNo} 列有內嵌圖片，但沒有型號或官網 SKU，無法配對。`);
            continue;
        }
        const image = workbook.getImage(Number(imageRef.imageId));
        const bytes = imageBytes(image);
        if (!bytes?.length) {
            warnings.push(`第 ${rowNo} 列有一張圖片無法讀取。`);
            continue;
        }
        const extension = image.extension === 'jpeg' ? 'jpg' : image.extension;
        const mimeType = image.extension === 'jpeg' ? 'image/jpeg' : `image/${image.extension}`;
        const role = column.key === 'embedded_description_images' ? 'description' : 'product';
        const counterKey = `${rowNo}:${column.key}`;
        const sequence = (counters.get(counterKey) ?? 0) + 1;
        counters.set(counterKey, sequence);
        const order = column.key === 'embedded_main_image' ? 1
            : column.key === 'embedded_gallery_images' ? sequence + 1
                : sequence;
        const marker = role === 'description' ? `_DESC_${String(order).padStart(2, '0')}` : `_${String(order).padStart(2, '0')}`;
        embeddedPhotos.push(new File([toArrayBuffer(bytes)], `${identifier}${marker}.${extension}`, { type: mimeType, lastModified: Date.now() + embeddedPhotos.length }));
    }
    return {
        rows,
        unknownHeaders,
        embeddedPhotos,
        warnings,
        truncated: worksheet.rowCount - 1 > MAX_ROWS,
    };
}
