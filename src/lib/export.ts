import { Canvg } from 'canvg'

function sanitizeSvg(xml: string): string {
  // Normalize any <br ...> to a self-closing form for XML parsers
  let out = xml.replace(/<br\b[^>]*>/gi, '<br/>')
  return out
}

export function downloadSvg(svg: string, filename: string) {
  const content = sanitizeSvg(svg)
  const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

function parseSvgSize(svg: string): { width: number; height: number } | null {
  // Try viewBox first
  const vb = /viewBox\s*=\s*"([^"]+)"/i.exec(svg)
  if (vb && vb[1]) {
    const parts = vb[1].trim().split(/\s+/).map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [, , w, h] = parts
      if (w > 0 && h > 0) return { width: w, height: h }
    }
  }
  // Fallback to width/height attributes, stripping units
  const wMatch = /\bwidth\s*=\s*"([^"]+)"/i.exec(svg)
  const hMatch = /\bheight\s*=\s*"([^"]+)"/i.exec(svg)
  const toPx = (v?: string) => {
    if (!v) return NaN
    const num = parseFloat(v)
    return Number.isFinite(num) ? num : NaN
  }
  const w = toPx(wMatch?.[1])
  const h = toPx(hMatch?.[1])
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h }
  return null
}

export async function downloadPng(svg: string, filename: string, scale?: number) {
  const sanitized = sanitizeSvg(svg)
  // Determine intrinsic size from SVG
  const sz = parseSvgSize(sanitized) || { width: 800, height: 600 }
  const baseLongest = Math.max(sz.width, sz.height)
  // Compute an auto scale to ensure a reasonably large PNG by default
  const minScale = 3 // at least 3x
  const targetLongest = 2000 // aim for ~2000px long edge when possible
  let computedScale = scale ?? Math.max(minScale, targetLongest / baseLongest)
  computedScale = Math.max(0.5, Math.min(8, computedScale))

  const width = Math.round(sz.width * computedScale)
  const height = Math.round(sz.height * computedScale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Optional white background to avoid transparency in some viewers
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // Render SVG onto canvas
  const v = await Canvg.from(ctx, sanitized, { ignoreAnimation: true, ignoreMouse: true })
  // Render at scale by transforming the context
  ctx.save()
  ctx.scale(computedScale, computedScale)
  await v.render()
  ctx.restore()

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(link.href), 0)
      resolve()
    }, 'image/png')
  })
}
