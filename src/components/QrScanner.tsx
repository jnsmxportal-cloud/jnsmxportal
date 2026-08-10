import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { X } from '@phosphor-icons/react'

const MAX_SCAN_DIM = 640

export default function QrScanner({
  onDetect,
  onClose,
}: {
  onDetect: (payload: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // keep the latest onDetect without restarting the camera when the parent re-renders
  const onDetectRef = useRef(onDetect)
  useEffect(() => {
    onDetectRef.current = onDetect
  }, [onDetect])

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!

    const scan = () => {
      if (stopped) return
      const video = videoRef.current
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        // downscale before getImageData — decoding a full 1080p+ frame per rAF is too slow
        const scale = Math.min(1, MAX_SCAN_DIM / Math.max(video.videoWidth, video.videoHeight))
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
        if (code?.data) {
          stopped = true
          onDetectRef.current(code.data)
          return
        }
      }
      raf = requestAnimationFrame(scan)
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          try {
            await videoRef.current.play()
          } catch {
            // play() rejects when the element unmounts mid-start — safe to ignore
          }
        }
        raf = requestAnimationFrame(scan)
      })
      .catch(() => setError('Camera access was denied — allow it to scan the asset QR code.'))

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [attempt])

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-navy">
      <div className="flex items-center gap-3 p-4 text-white">
        <button onClick={onClose} className="p-1">
          <X size={20} />
        </button>
        <div>
          <div className="text-[15px] font-bold">Scan asset QR</div>
          <div className="text-[11px] text-muted">Point the camera at the code on the unit</div>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="flex max-w-[280px] flex-col items-center gap-4 p-6 text-center">
            <div className="text-sm text-white/80">{error}</div>
            <button
              onClick={() => {
                setError(null)
                setAttempt((a) => a + 1)
              }}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-56 rounded-3xl border-2 border-success shadow-[0_0_0_9999px_rgba(15,20,32,.45)]" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
