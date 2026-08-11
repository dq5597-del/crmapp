const MAX_PHOTO_DIMENSION = 2560
const WEBP_QUALITY = 0.84

function loadImage(file: File) {
  return new Promise<{ image: HTMLImageElement; objectUrl: string }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ image, objectUrl })
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('瀏覽器無法讀取這張照片'))
    }
    image.src = objectUrl
  })
}

/**
 * 在瀏覽器先縮圖並轉成 WebP，降低手機原始照片超過上傳限制的機率。
 * 若瀏覽器不支援 WebP 編碼，呼叫端可沿用原檔，交由伺服器再次轉換。
 */
export async function preparePhotoAsWebP(file: File): Promise<File> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
    throw new Error('只能上傳圖片檔案')
  }

  const { image, objectUrl } = await loadImage(file)
  try {
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

    const context = canvas.getContext('2d')
    if (!context) throw new Error('瀏覽器無法處理這張照片')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY))
    if (!blob || blob.type !== 'image/webp') throw new Error('瀏覽器不支援 WebP 轉檔')

    const baseName = file.name.replace(/\.[^.]+$/, '') || `project-photo-${Date.now()}`
    return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: file.lastModified })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
