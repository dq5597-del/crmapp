"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wordpressMediaConfig = wordpressMediaConfig;
exports.isAllowedWordPressImageType = isAllowedWordPressImageType;
exports.isConfiguredWordPressMediaUrl = isConfiguredWordPressMediaUrl;
exports.safeWordPressFileName = safeWordPressFileName;
exports.prepareWordPressImage = prepareWordPressImage;
exports.uploadWordPressMedia = uploadWordPressMedia;
const sharp_1 = __importDefault(require("sharp"));
const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);
const WORDPRESS_IMAGE_SIZE = 600;
const WORDPRESS_CONTENT_MAX_WIDTH = 1800;
const WORDPRESS_CONTENT_MAX_HEIGHT = 2600;
const WORDPRESS_WEBP_QUALITY = 84;
const WORDPRESS_CONTENT_WEBP_QUALITY = 90;
function wordpressMediaConfig() {
    const store = (process.env.WC_STORE_URL ?? '').replace(/\/$/, '');
    const username = process.env.WP_MEDIA_USERNAME ?? '';
    const applicationPassword = process.env.WP_MEDIA_APPLICATION_PASSWORD ?? '';
    return { store, username, applicationPassword };
}
function isAllowedWordPressImageType(mimeType) {
    return ALLOWED_IMAGE_TYPES.has(mimeType.toLowerCase());
}
function isConfiguredWordPressMediaUrl(url) {
    const { store } = wordpressMediaConfig();
    return !!store && url.startsWith(`${store}/wp-content/uploads/`);
}
function safeWordPressFileName(name) {
    const dot = name.lastIndexOf('.');
    const extension = dot >= 0 ? name.slice(dot).toLowerCase() : '';
    const base = (dot >= 0 ? name.slice(0, dot) : name)
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '');
    return `${base || `product-${Date.now()}`}${extension}`;
}
/**
 * product：商品主圖／相簿統一為 600 × 600，不裁切產品內容。
 * content：商品介紹與型錄頁保留長寬比，最長邊限制在 1800 × 2600。
 * 兩者都依 EXIF 方向旋轉並輸出 WebP。
 */
async function prepareWordPressImage(data, preset = 'product') {
    const image = (0, sharp_1.default)(data, { animated: false }).rotate();
    if (preset === 'content') {
        return image
            .resize(WORDPRESS_CONTENT_MAX_WIDTH, WORDPRESS_CONTENT_MAX_HEIGHT, {
            fit: 'inside',
            withoutEnlargement: true,
        })
            .webp({ quality: WORDPRESS_CONTENT_WEBP_QUALITY })
            .toBuffer();
    }
    return image
        .resize(WORDPRESS_IMAGE_SIZE, WORDPRESS_IMAGE_SIZE, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
        withoutEnlargement: false,
    })
        .webp({ quality: WORDPRESS_WEBP_QUALITY })
        .toBuffer();
}
async function uploadWordPressMedia(options) {
    const { store, username, applicationPassword } = wordpressMediaConfig();
    if (!store || !username || !applicationPassword) {
        throw new Error('尚未設定 WordPress 媒體上傳帳號。請設定 WP_MEDIA_USERNAME 與 WP_MEDIA_APPLICATION_PASSWORD。');
    }
    if (!isAllowedWordPressImageType(options.mimeType)) {
        throw new Error('僅支援 JPG、PNG、WebP 或 GIF 圖片');
    }
    const uploadData = await prepareWordPressImage(options.data, options.preset);
    const uploadMimeType = 'image/webp';
    const uploadFileName = options.fileName.replace(/\.[^.]+$/, '') + '.webp';
    const filename = safeWordPressFileName(uploadFileName);
    const auth = Buffer.from(`${username}:${applicationPassword}`).toString('base64');
    const upload = await fetch(`${store}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': uploadMimeType,
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
        body: Uint8Array.from(uploadData),
        cache: 'no-store',
    });
    const responseText = await upload.text();
    let media = null;
    try {
        media = responseText ? JSON.parse(responseText) : null;
    }
    catch {
        throw new Error(`WordPress 回應格式錯誤（HTTP ${upload.status}）`);
    }
    if (!upload.ok) {
        throw new Error(media?.message ?? `WordPress 媒體上傳失敗（HTTP ${upload.status}）`);
    }
    if (!media?.id || !media?.source_url) {
        throw new Error('WordPress 已接收檔案，但沒有回傳媒體網址');
    }
    const altText = (options.altText ?? '').trim();
    if (altText) {
        await fetch(`${store}/wp-json/wp/v2/media/${media.id}`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ alt_text: altText }),
            cache: 'no-store',
        });
    }
    return {
        id: media.id,
        url: media.source_url,
        alt_text: altText,
        width: media.media_details?.width ?? null,
        height: media.media_details?.height ?? null,
    };
}
