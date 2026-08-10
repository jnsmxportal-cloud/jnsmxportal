/**
 * Document scanning helpers: edge-based corner detection and perspective
 * (homography) correction — no external CV dependency.
 */

export interface Pt {
  x: number
  y: number
}

/** Corner order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt]

/** Grayscale + Sobel edge magnitude over a (small) ImageData. */
function edgeMap(data: ImageData): { mag: Float32Array; w: number; h: number } {
  const { width: w, height: h, data: px } = data
  const gray = new Float32Array(w * h)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    gray[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  }
  // light 3x3 box blur to suppress texture noise
  const blur = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) s += gray[(y + dy) * w + (x + dx)]
      blur[y * w + x] = s / 9
    }
  }
  const mag = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx =
        -blur[i - w - 1] - 2 * blur[i - 1] - blur[i + w - 1] +
        blur[i - w + 1] + 2 * blur[i + 1] + blur[i + w + 1]
      const gy =
        -blur[i - w - 1] - 2 * blur[i - w] - blur[i - w + 1] +
        blur[i + w - 1] + 2 * blur[i + w] + blur[i + w + 1]
      mag[i] = Math.hypot(gx, gy)
    }
  }
  return { mag, w, h }
}

function cross(o: Pt, a: Pt, b: Pt) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Monotone-chain convex hull. */
function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return points
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function quadArea(q: Quad): number {
  let a = 0
  for (let i = 0; i < 4; i++) {
    const p1 = q[i]
    const p2 = q[(i + 1) % 4]
    a += p1.x * p2.y - p2.x * p1.y
  }
  return Math.abs(a / 2)
}

/**
 * Detect the document quadrilateral in a small frame (run on ~320px-wide
 * ImageData for speed). Returns corners in source-pixel coords, or null when
 * no plausible document is found.
 */
export function detectDocumentQuad(frame: ImageData): Quad | null {
  const { mag, w, h } = edgeMap(frame)
  // adaptive threshold from edge-strength statistics
  let sum = 0
  let count = 0
  for (let i = 0; i < mag.length; i++) {
    if (mag[i] > 0) {
      sum += mag[i]
      count++
    }
  }
  if (!count) return null
  const mean = sum / count
  let varSum = 0
  for (let i = 0; i < mag.length; i++) if (mag[i] > 0) varSum += (mag[i] - mean) ** 2
  const std = Math.sqrt(varSum / count)
  const thr = mean + 1.2 * std

  const strong: Pt[] = []
  // margin of 2px: Sobel border artefacts
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      if (mag[y * w + x] > thr) strong.push({ x, y })
    }
  }
  if (strong.length < 24) return null

  const hull = convexHull(strong)
  if (hull.length < 4) return null

  // extreme-point quad from the hull: robust when the document dominates the frame
  let tl = hull[0]
  let tr = hull[0]
  let br = hull[0]
  let bl = hull[0]
  for (const p of hull) {
    if (p.x + p.y < tl.x + tl.y) tl = p
    if (p.x - p.y > tr.x - tr.y) tr = p
    if (p.x + p.y > br.x + br.y) br = p
    if (p.x - p.y < bl.x - bl.y) bl = p
  }
  const quad: Quad = [tl, tr, br, bl]

  // plausibility: sizeable, not the full frame, distinct corners
  const area = quadArea(quad)
  const frameArea = w * h
  if (area < frameArea * 0.14 || area > frameArea * 0.985) return null
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(quad[i].x - quad[j].x, quad[i].y - quad[j].y) < Math.min(w, h) * 0.15)
        return null
    }
  }
  return quad
}

/** Scale a quad between coordinate spaces. */
export function scaleQuad(q: Quad, sx: number, sy: number): Quad {
  return q.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad
}

/** Mean corner distance between two quads (stability metric). */
export function quadDrift(a: Quad, b: Quad): number {
  let d = 0
  for (let i = 0; i < 4; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
  return d / 4
}

/** Solve an n×n linear system in place (Gaussian elimination, partial pivot). */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r
    if (Math.abs(A[pivot][col]) < 1e-10) return null
    ;[A[col], A[pivot]] = [A[pivot], A[col]]
    ;[b[col], b[pivot]] = [b[pivot], b[col]]
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col]
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c]
      b[r] -= f * b[col]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]
    x[r] = s / A[r][r]
  }
  return x
}

/**
 * Homography mapping destination rect (0,0)-(W,0)-(W,H)-(0,H) onto the source
 * quad, so each output pixel can be looked up in the source image.
 */
function homographyToQuad(quad: Quad, W: number, H: number): number[] | null {
  const dst = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ]
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = dst[i]
    const { x, y } = quad[i]
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x])
    b.push(x)
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y])
    b.push(y)
  }
  return solve(A, b)
}

/**
 * Perspective-correct the region inside `quad` of `source` into an upright
 * rectangle. Output size follows the quad's real edge lengths (max side capped).
 */
export function warpPerspective(
  source: HTMLCanvasElement,
  quad: Quad,
  maxSide = 2000,
): HTMLCanvasElement {
  const [tl, tr, br, bl] = quad
  let W = Math.round(Math.max(Math.hypot(tr.x - tl.x, tr.y - tl.y), Math.hypot(br.x - bl.x, br.y - bl.y)))
  let H = Math.round(Math.max(Math.hypot(bl.x - tl.x, bl.y - tl.y), Math.hypot(br.x - tr.x, br.y - tr.y)))
  const scale = Math.min(1, maxSide / Math.max(W, H))
  W = Math.max(1, Math.round(W * scale))
  H = Math.max(1, Math.round(H * scale))

  const hm = homographyToQuad(quad, W, H)
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const octx = out.getContext('2d')!
  if (!hm) {
    octx.drawImage(source, 0, 0, W, H)
    return out
  }
  const sctx = source.getContext('2d')!
  const src = sctx.getImageData(0, 0, source.width, source.height)
  const dst = octx.createImageData(W, H)
  const sp = src.data
  const dp = dst.data
  const sw = src.width
  const sh = src.height
  const [h0, h1, h2, h3, h4, h5, h6, h7] = hm
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const d = h6 * u + h7 * v + 1
      const sx = (h0 * u + h1 * v + h2) / d
      const sy = (h3 * u + h4 * v + h5) / d
      const di = (v * W + u) * 4
      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
        dp[di] = dp[di + 1] = dp[di + 2] = 255
        dp[di + 3] = 255
        continue
      }
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(sw - 1, x0 + 1)
      const y1 = Math.min(sh - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      for (let c = 0; c < 3; c++) {
        const p00 = sp[(y0 * sw + x0) * 4 + c]
        const p10 = sp[(y0 * sw + x1) * 4 + c]
        const p01 = sp[(y1 * sw + x0) * 4 + c]
        const p11 = sp[(y1 * sw + x1) * 4 + c]
        dp[di + c] =
          p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy
      }
      dp[di + 3] = 255
    }
  }
  octx.putImageData(dst, 0, 0)
  return out
}

/** Default quad: inset 8% from the frame edges (used when detection fails). */
export function defaultQuad(w: number, h: number): Quad {
  const mx = w * 0.08
  const my = h * 0.08
  return [
    { x: mx, y: my },
    { x: w - mx, y: my },
    { x: w - mx, y: h - my },
    { x: mx, y: h - my },
  ]
}
