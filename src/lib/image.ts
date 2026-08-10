/**
 * Compress a photo to a JPEG whose longest side is <= maxDim.
 * Decodes via createImageBitmap, falling back to an <img> + object URL for
 * formats createImageBitmap rejects (e.g. HEIC on some browsers).
 */
export async function compressImage(file: Blob, maxDim = 1600, quality = 0.8): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await createImageBitmap(file)
  } catch {
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('decode failed'))
      }
      img.src = url
    }).catch(() => {
      throw new Error(
        'This image format is not supported on this device — try taking the photo with the in-app camera',
      )
    })
  }
  const srcW = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const srcH = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(srcW * scale))
  canvas.height = Math.max(1, Math.round(srcH * scale))
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source) source.close()
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress the photo'))),
      'image/jpeg',
      quality,
    )
  })
}
