// True View — captures Power BI Desktop's own window through the browser's
// Screen Capture API, so the mirror can show the report EXACTLY as Desktop
// renders it. Pure web: nothing to install, no server, and the pixels never
// leave the browser — the user picks the Desktop window from Chrome's own
// picker each session (that consent step is enforced by the browser).

export interface DesktopCapture {
  stream: MediaStream
  video: HTMLVideoElement
  /** Register a callback for when the user stops sharing from the browser UI. */
  onEnded: (cb: () => void) => void
  /** Snapshot the current frame at native resolution, or null if not ready. */
  grabFrame: () => HTMLCanvasElement | null
  stop: () => void
}

export function isCaptureSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
}

export async function connectDesktopCapture(): Promise<DesktopCapture> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 5 },
    audio: false,
  })
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  await video.play()
  if (!video.videoWidth) {
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve()
    })
  }
  const track = stream.getVideoTracks()[0]

  return {
    stream,
    video,
    onEnded(cb) {
      track?.addEventListener('ended', cb)
    },
    grabFrame() {
      if (!video.videoWidth) return null
      const c = document.createElement('canvas')
      c.width = video.videoWidth
      c.height = video.videoHeight
      const g = c.getContext('2d')
      if (!g) return null
      g.drawImage(video, 0, 0)
      return c
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop())
    },
  }
}

/** A crop rectangle in captured-frame pixel coordinates. */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

/** Crop a captured frame to the report-canvas area → PNG data URL (native res). */
export function cropFrame(frame: HTMLCanvasElement, crop: CropRect): string {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(crop.w))
  c.height = Math.max(1, Math.round(crop.h))
  const g = c.getContext('2d')
  if (!g) return ''
  g.drawImage(frame, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

/**
 * Starting guess for the calibration box: centred, most of the frame width,
 * locked to the page's aspect ratio. The user drags it onto the report canvas.
 */
export function seedCrop(frameW: number, frameH: number, aspect: number): CropRect {
  let w = frameW * 0.72
  let h = w / aspect
  if (h > frameH * 0.82) {
    h = frameH * 0.82
    w = h * aspect
  }
  return { x: (frameW - w) / 2, y: (frameH - h) / 2 + frameH * 0.02, w, h }
}

/** A stored capture of one page, ready for the mirror. */
export interface PageSnapshot {
  dataUrl: string
  /** Epoch ms when captured — shown so the user knows how fresh it is. */
  at: number
  /** The calibration used, so re-captures start from the same crop. */
  crop: CropRect
}
