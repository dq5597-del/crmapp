/**
 * 品牌 logo 對應。檔案放在 public/brands/，新增品牌時：
 * 1. 把 logo 圖檔丟進 public/brands/（檔名用品牌小寫，如 yamaha.png）
 * 2. 若檔名跟品牌小寫一致就不用改這裡；特殊檔名才需要加進 MAP
 */
const MAP: Record<string, string> = {
  benq: 'benq.png',
  bosch: 'bosch.png',
  bose: 'bose.png',
  crestron: 'crestron.png',
  optoma: 'optoma.png',
  panasonic: 'panasonic.jpg',
  sampo: 'sampo.png',
  viewsonic: 'viewsonic.png',
  vivitek: 'vivitek.png',
  amx: 'amx-converted.png',
}

/** 回傳品牌 logo 網址；沒有對應檔就回傳品牌小寫 .png 的猜測路徑（配合 onError 隱藏） */
export function brandLogoUrl(brand: string | null | undefined): string | null {
  const key = (brand ?? '').trim().toLowerCase()
  if (!key) return null
  if (MAP[key]) return `/brands/${MAP[key]}`
  return `/brands/${key}.png`
}

/** 只回傳「確定存在」的 logo（列印頁用，避免破圖） */
export function knownBrandLogoUrl(brand: string | null | undefined): string | null {
  const key = (brand ?? '').trim().toLowerCase()
  return MAP[key] ? `/brands/${MAP[key]}` : null
}
