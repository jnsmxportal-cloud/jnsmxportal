import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Camera, Check, Image as ImageIcon, X } from '@phosphor-icons/react'
import {
  defaultQuad,
  detectDocumentQuad,
  quadDrift,
  scaleQuad,
  warpPerspective,
  type Pt,
  type Quad,
} from '../lib/scan'

/**
 * Full-screen document scanner: live camera with automatic edge detection and
 * auto-capture, then a 4-corner adjustment step with perspective correction.
 * Falls back to a gallery import when the camera is unavailable.
 *
 * Multi-page mode (`multiPage`): each accepted scan is handed to `onDone` and
 * the camera re-opens for the next page; `onFinish` ends the session.
 */
export default function DocScanner({
  onDone,
  onClose,
  title = 'Scan document',
  multiPage = false,
  pageCount = 0,
  onFinish,
}: {
  /** Receives the perspective-corrected scan as a JPEG data URL (once per page in multi-page mode). */
  onDone: (dataUrl: string) => void
  onClose: () => void
  title?: string
  multiPage?: boolean
  /** Pages already captured in this session (multi-page mode). */
  pageCount?: number
  /** Multi-page mode: called when the user is done adding pages. */
  onFinish?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<HTMLCanvasElement | null>(null) // full-res captured frame
  const stableSinceRef = useRef<number | null>(null)
  const lastQuadRef = useRef<Quad | null>(null)
  const capturedRef = useRef(false)
  // multi-page: auto-capture stays disarmed for a moment after a page is
  // accepted, so the same sheet is not captured again before it is turned
  const armAtRef = useRef(0)
  const turnPageRef = useRef(false)
  const [turnPage, setTurnPage] = useState(false)

  const [mode, setMode] = useState<'camera' | 'adjust'>('camera')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [quad, setQuad] = useState<Quad | null>(null) // adjust-mode quad, image coords
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  // preview of the captured frame, encoded ONCE — re-encoding a full-res frame on every render
  // (i.e. every pointer move while dragging) made the corner handles crawl
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [holdPct, setHoldPct] = useState(0) // 0..1 auto-capture progress
  const [busy, setBusy] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  /** Grab the current video frame at full resolution and move to adjust. */
  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth || capturedRef.current) return
    capturedRef.current = true
    const c = document.createElement('canvas')
    c.width = video.videoWidth
    c.height = video.videoHeight
    c.getContext('2d')!.drawImage(video, 0, 0)
    frameRef.current = c
    // best quad from the live loop, scaled up to full-res coords
    const small = lastQuadRef.current
    const detW = 320
    const q = small
      ? scaleQuad(small, c.width / detW, c.height / Math.round((detW * c.height) / c.width))
      : defaultQuad(c.width, c.height)
    setImgSize({ w: c.width, h: c.height })
    setFrameUrl(c.toDataURL('image/jpeg', 0.7))
    setQuad(q)
    stopStream()
    setMode('adjust')
    if (navigator.vibrate) navigator.vibrate(30)
  }, [stopStream])

  // camera lifecycle + detection loop
  useEffect(() => {
    if (mode !== 'camera') return
    capturedRef.current = false
    stableSinceRef.current = null
    lastQuadRef.current = null
    setHoldPct(0)
    let cancelled = false
    let raf = 0
    let lastDetect = 0
    const det = document.createElement('canvas')

    const loop = (ts: number) => {
      if (cancelled) return
      raf = requestAnimationFrame(loop)
      const video = videoRef.current
      const overlay = overlayRef.current
      if (!video || !overlay || !video.videoWidth) return
      if (ts - lastDetect < 140) return
      lastDetect = ts

      const detW = 320
      const detH = Math.round((detW * video.videoHeight) / video.videoWidth)
      det.width = detW
      det.height = detH
      const dctx = det.getContext('2d', { willReadFrequently: true })!
      dctx.drawImage(video, 0, 0, detW, detH)
      let q: Quad | null = null
      try {
        q = detectDocumentQuad(dctx.getImageData(0, 0, detW, detH))
      } catch {
        q = null
      }

      // overlay draw — video renders object-contain, so map through the
      // letterboxed content rect, not the raw element size
      overlay.width = video.clientWidth
      overlay.height = video.clientHeight
      const octx = overlay.getContext('2d')!
      octx.clearRect(0, 0, overlay.width, overlay.height)
      if (q) {
        const s = Math.min(overlay.width / video.videoWidth, overlay.height / video.videoHeight)
        const ox = (overlay.width - s * video.videoWidth) / 2
        const oy = (overlay.height - s * video.videoHeight) / 2
        const k = (s * video.videoWidth) / detW
        const sq = q.map((p) => ({ x: ox + p.x * k, y: oy + p.y * k })) as Quad
        octx.beginPath()
        octx.moveTo(sq[0].x, sq[0].y)
        for (let i = 1; i < 4; i++) octx.lineTo(sq[i].x, sq[i].y)
        octx.closePath()
        octx.fillStyle = 'rgba(255,90,45,0.14)'
        octx.fill()
        octx.lineWidth = 2.5
        octx.strokeStyle = '#FF5A2D'
        octx.stroke()
        for (const p of sq) {
          octx.beginPath()
          octx.arc(p.x, p.y, 6, 0, Math.PI * 2)
          octx.fillStyle = '#fff'
          octx.fill()
          octx.strokeStyle = '#FF5A2D'
          octx.stroke()
        }
      }

      // auto-capture when the detected quad stays put for ~1.2s
      const HOLD_MS = 1200
      const armed = performance.now() >= armAtRef.current
      if (armed && turnPageRef.current) {
        turnPageRef.current = false
        setTurnPage(false)
      }
      if (armed && q && lastQuadRef.current && quadDrift(q, lastQuadRef.current) < 6) {
        if (!stableSinceRef.current) stableSinceRef.current = ts
        const held = ts - stableSinceRef.current
        setHoldPct(Math.min(1, held / HOLD_MS))
        if (held >= HOLD_MS) {
          lastQuadRef.current = q
          capture()
          return
        }
      } else {
        stableSinceRef.current = null
        setHoldPct(0)
      }
      if (q) lastQuadRef.current = q
    }

    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          try {
            await video.play()
          } catch {
            /* iOS may reject play() until a gesture; the video attr autoplay covers it */
          }
        }
        raf = requestAnimationFrame(loop)
      } catch {
        if (!cancelled)
          setCameraError('Camera unavailable or permission denied. You can import a photo instead.')
      }
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stopStream()
    }
  }, [mode, capture, stopStream])

  /** Gallery import path (also the fallback when the camera is blocked). */
  const onImport = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    try {
      let bmp: ImageBitmap | HTMLImageElement
      try {
        bmp = await createImageBitmap(f)
      } catch {
        bmp = await new Promise<HTMLImageElement>((res, rej) => {
          const img = new Image()
          img.onload = () => res(img)
          img.onerror = () => rej(new Error('unsupported image'))
          img.src = URL.createObjectURL(f)
        })
      }
      const w = 'videoWidth' in bmp ? 0 : bmp.width
      const h = 'videoWidth' in bmp ? 0 : bmp.height
      const maxSide = 2200
      const s = Math.min(1, maxSide / Math.max(w, h))
      const c = document.createElement('canvas')
      c.width = Math.round(w * s)
      c.height = Math.round(h * s)
      c.getContext('2d')!.drawImage(bmp as CanvasImageSource, 0, 0, c.width, c.height)
      frameRef.current = c
      // run detection on a downscaled copy
      const detW = 320
      const detH = Math.round((detW * c.height) / c.width)
      const dc = document.createElement('canvas')
      dc.width = detW
      dc.height = detH
      const dctx = dc.getContext('2d', { willReadFrequently: true })!
      dctx.drawImage(c, 0, 0, detW, detH)
      let q: Quad | null = null
      try {
        q = detectDocumentQuad(dctx.getImageData(0, 0, detW, detH))
      } catch {
        q = null
      }
      const full = q ? scaleQuad(q, c.width / detW, c.height / detH) : defaultQuad(c.width, c.height)
      stopStream()
      setImgSize({ w: c.width, h: c.height })
      setFrameUrl(c.toDataURL('image/jpeg', 0.7))
      setQuad(full)
      setMode('adjust')
    } catch {
      setCameraError('That image could not be read — try a JPEG or PNG, or use the camera.')
    } finally {
      setBusy(false)
    }
  }

  const backToCamera = () => {
    frameRef.current = null
    setFrameUrl(null)
    setQuad(null)
    setMode('camera')
  }

  /** Accept the adjusted scan. In multi-page mode `then` says whether another page follows. */
  const confirm = (then: 'next' | 'finish' = 'finish') => {
    if (!frameRef.current || !quad || busy) return
    setBusy(true)
    // let the busy state paint before the (sync, heavy) warp
    setTimeout(() => {
      try {
        const warped = warpPerspective(frameRef.current!, quad)
        onDone(warped.toDataURL('image/jpeg', 0.92))
        if (!multiPage) return
        if (then === 'finish') {
          onFinish?.()
          return
        }
        armAtRef.current = performance.now() + 2500
        turnPageRef.current = true
        setTurnPage(true)
        backToCamera()
      } finally {
        setBusy(false)
      }
    }, 30)
  }

  // ---- adjust-mode drag handling ----
  // The preview box is sized in JS to fit the free area at the image's aspect ratio. Handle
  // positions used to be read from the box's DOM rect during render — on the first adjust render
  // the box wasn't mounted yet, so no handles were drawn and nothing re-rendered to add them.
  const adjustAreaRef = useRef<HTMLDivElement>(null)
  const adjustBoxRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState<number | null>(null)

  useEffect(() => {
    const area = adjustAreaRef.current
    if (mode !== 'adjust' || !area || !imgSize.w) return
    const measure = () => {
      const r = area.getBoundingClientRect()
      // leave room for the handles, which hang half outside the image at its edges
      const pad = 22
      const s = Math.min((r.width - pad * 2) / imgSize.w, (r.height - pad * 2) / imgSize.h)
      setFit(s > 0 ? { w: Math.floor(imgSize.w * s), h: Math.floor(imgSize.h * s) } : { w: 0, h: 0 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(area)
    return () => ro.disconnect()
  }, [mode, imgSize.w, imgSize.h])

  const toImageCoords = (e: { clientX: number; clientY: number }): Pt | null => {
    const box = adjustBoxRef.current
    if (!box || !imgSize.w) return null
    const r = box.getBoundingClientRect()
    return {
      x: Math.min(imgSize.w, Math.max(0, ((e.clientX - r.left) / r.width) * imgSize.w)),
      y: Math.min(imgSize.h, Math.max(0, ((e.clientY - r.top) / r.height) * imgSize.h)),
    }
  }

  const onHandleDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    try {
      // keeps the drag on this handle even when the finger outruns it
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* some browsers throw for an already-released pointer; the drag still works without capture */
    }
    setDragging(i)
  }
  const onHandleMove = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging !== i) return
    const p = toImageCoords(e)
    if (!p) return
    setQuad((q) => {
      if (!q) return q
      const next = [...q] as Quad
      next[i] = p
      return next
    })
  }
  const onHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(null)
  }

  const dq: Quad | null =
    mode === 'adjust' && quad && imgSize.w && fit.w ? scaleQuad(quad, fit.w / imgSize.w, fit.h / imgSize.h) : null

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-navy">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onImport(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-bold text-white">
          {title}
          {multiPage && (
            <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white/85">
              Page {pageCount + 1}
            </span>
          )}
        </span>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white">
          <X size={18} />
        </button>
      </div>

      {mode === 'camera' && (
        <>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {!cameraError ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-contain"
                />
                <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
                <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
                  <span className="rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-semibold text-white">
                    {turnPage
                      ? `Page ${pageCount} added · turn to the next page`
                      : holdPct > 0
                        ? `Hold still… ${Math.round(holdPct * 100)}%`
                        : 'Position the document in view'}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <Camera size={40} color="#8B93A4" />
                <p className="text-sm text-white/80">{cameraError}</p>
                <button
                  onClick={() => setCameraError(null)}
                  className="rounded-xl border border-white/25 px-4 py-2 text-[13px] font-semibold text-white"
                >
                  Try camera again
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-10 py-5">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-1 text-[11px] font-semibold text-white/85"
            >
              <span className="rounded-full bg-white/10 p-3">
                <ImageIcon size={22} color="#fff" />
              </span>
              Import
            </button>
            <button
              onClick={capture}
              disabled={!!cameraError}
              aria-label="Capture"
              className="h-[68px] w-[68px] rounded-full border-4 border-white bg-brand disabled:opacity-40"
            />
            {multiPage && pageCount > 0 ? (
              <button
                onClick={onFinish}
                className="flex flex-col items-center gap-1 text-[11px] font-semibold text-white/85"
              >
                <span className="rounded-full bg-success p-3">
                  <Check size={22} weight="bold" color="#fff" />
                </span>
                Done ({pageCount})
              </button>
            ) : (
              <span className="w-[46px]" />
            )}
          </div>
        </>
      )}

      {mode === 'adjust' && frameRef.current && (
        <>
          <div ref={adjustAreaRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <div
              ref={adjustBoxRef}
              className="relative flex-none"
              style={{ width: fit.w, height: fit.h, touchAction: 'none' }}
            >
              {frameUrl && (
                <img
                  src={frameUrl}
                  alt="Captured document"
                  className="pointer-events-none block h-full w-full select-none rounded-lg"
                  draggable={false}
                />
              )}
              {dq && (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                  viewBox={`0 0 ${fit.w} ${fit.h}`}
                >
                  <polygon
                    points={dq.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(255,90,45,0.15)"
                    stroke="#FF5A2D"
                    strokeWidth={2}
                  />
                </svg>
              )}
              {/* corner handles: 48px touch targets (HTML, so touch-action works on iOS too) */}
              {dq?.map((p, i) => (
                <div
                  key={i}
                  role="slider"
                  aria-label={`Corner ${i + 1} of 4`}
                  onPointerDown={onHandleDown(i)}
                  onPointerMove={onHandleMove(i)}
                  onPointerUp={onHandleUp}
                  onPointerCancel={onHandleUp}
                  className="absolute flex h-12 w-12 items-center justify-center"
                  style={{
                    left: p.x,
                    top: p.y,
                    transform: 'translate(-50%, -50%)',
                    touchAction: 'none',
                    cursor: dragging === i ? 'grabbing' : 'grab',
                  }}
                >
                  <span
                    className="block rounded-full border-[3px] border-brand bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,.35)] transition-[width,height] duration-100"
                    style={{ width: dragging === i ? 30 : 24, height: dragging === i ? 30 : 24 }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 pb-1 text-center text-[11.5px] text-white/60">
            Drag the corners to match the document edges
          </div>
          {multiPage ? (
            <div className="flex items-center justify-center gap-2 p-4">
              <button
                onClick={backToCamera}
                disabled={busy}
                className="rounded-xl border border-white/25 px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                Retake
              </button>
              <button
                onClick={() => confirm('next')}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand bg-brand/15 px-3 py-3 text-[13px] font-bold text-white disabled:opacity-60"
              >
                {busy ? 'Processing…' : 'Next page'} <ArrowRight size={15} weight="bold" />
              </button>
              <button
                onClick={() => confirm('finish')}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-3 text-[13px] font-bold text-white disabled:opacity-60"
              >
                <Check size={15} weight="bold" /> {pageCount > 0 ? 'Last page' : 'Done'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 p-4">
              <button
                onClick={backToCamera}
                className="rounded-xl border border-white/25 px-5 py-3 text-[13.5px] font-semibold text-white"
              >
                Retake
              </button>
              <button
                onClick={() => confirm()}
                disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-[13.5px] font-bold text-white disabled:opacity-60"
              >
                <Check size={17} weight="bold" /> {busy ? 'Processing…' : 'Use scan'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
