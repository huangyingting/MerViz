import { useEffect, useMemo, useRef, useState } from 'react'
import { renderMermaid, MermaidConfig } from './lib/mermaidClient'
import { downloadSvg, downloadPng } from './lib/export'

const DEFAULT_CODE = `flowchart TD
  A[Start] --> B{Condition?}
  B -- Yes --> C[Do thing]
  B -- No --> D[Something else]
  C --> E[End]
  D --> E`

const BUILTIN_THEMES = ['default','neutral','dark','forest','base'] as const
type BuiltinTheme = typeof BUILTIN_THEMES[number]

// Curated custom themes: base theme + themeVariables
const CUSTOM_THEMES = {
  professionalLight: {
    label: 'Professional Light',
    base: 'neutral' as BuiltinTheme,
    variables: {
      background: '#ffffff',
      primaryColor: '#2563eb',
      primaryTextColor: '#0f172a',
      primaryBorderColor: '#cbd5e1',
      lineColor: '#64748b',
      textColor: '#0f172a',
      mainBkg: '#ffffff',
      nodeBorder: '#e2e8f0',
      clusterBkg: '#f8fafc',
      clusterBorder: '#e2e8f0',
      edgeLabelBackground: '#ffffff',
      labelBackground: '#ffffff',
      noteBkgColor: '#f8fafc',
      noteBorderColor: '#e2e8f0',
      tertiaryColor: '#f1f5f9',
      tertiaryTextColor: '#0f172a',
      // Typography and shapes
      fontSize: '16px',
      edgeFontSize: '14px',
      nodeBorderRadius: 8,
      padding: 12,
    }
  },
  midnightBlue: {
    label: 'Midnight Blue',
    base: 'dark' as BuiltinTheme,
    variables: {
      background: '#0b1220',
      primaryColor: '#60a5fa',
      primaryTextColor: '#e5e7eb',
      primaryBorderColor: '#1f2a44',
      lineColor: '#64748b',
      textColor: '#e5e7eb',
      mainBkg: '#111827',
      nodeBorder: '#334155',
      clusterBkg: '#0f172a',
      clusterBorder: '#1f2937',
      edgeLabelBackground: '#111827',
      labelBackground: '#0b1220',
      noteBkgColor: '#0f172a',
      noteBorderColor: '#334155',
      tertiaryColor: '#1f2937',
      tertiaryTextColor: '#e5e7eb',
      fontSize: '16px',
      edgeFontSize: '14px',
      nodeBorderRadius: 8,
      padding: 12,
    }
  },
  emerald: {
    label: 'Emerald',
    base: 'neutral' as BuiltinTheme,
    variables: {
      background: '#ffffff',
      primaryColor: '#10b981',
      primaryTextColor: '#064e3b',
      primaryBorderColor: '#a7f3d0',
      lineColor: '#34d399',
      textColor: '#0f172a',
      mainBkg: '#ecfdf5',
      nodeBorder: '#a7f3d0',
      clusterBkg: '#f0fdf4',
      clusterBorder: '#a7f3d0',
      edgeLabelBackground: '#ffffff',
      labelBackground: '#ffffff',
      tertiaryColor: '#d1fae5',
      tertiaryTextColor: '#065f46',
      fontSize: '16px',
      edgeFontSize: '14px',
      nodeBorderRadius: 10,
      padding: 12,
    }
  },
  nord: {
    label: 'Nord',
    base: 'neutral' as BuiltinTheme,
    variables: {
      background: '#ECEFF4',
      primaryColor: '#5E81AC',
      primaryTextColor: '#2E3440',
      primaryBorderColor: '#81A1C1',
      lineColor: '#88C0D0',
      textColor: '#2E3440',
      mainBkg: '#E5E9F0',
      nodeBorder: '#D8DEE9',
      clusterBkg: '#E5E9F0',
      clusterBorder: '#D8DEE9',
      edgeLabelBackground: '#E5E9F0',
      labelBackground: '#ECEFF4',
      tertiaryColor: '#D8DEE9',
      tertiaryTextColor: '#2E3440',
      fontSize: '16px',
      edgeFontSize: '14px',
      nodeBorderRadius: 6,
      padding: 12,
    }
  }
} as const
type CustomThemeKey = keyof typeof CUSTOM_THEMES
type ThemeKey = BuiltinTheme | CustomThemeKey

export default function App() {
  const [code, setCode] = useState<string>(() => localStorage.getItem('merViz.diagram.v1') ?? DEFAULT_CODE)
  const [theme, setTheme] = useState<ThemeKey>(() => (localStorage.getItem('merViz.theme.v1') as ThemeKey) || 'default')
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [autoUpdate, setAutoUpdate] = useState<boolean>(() => localStorage.getItem('merViz.autoupdate.v1') !== 'false')
  const [font, setFont] = useState<string>(() => localStorage.getItem('merViz.font.v1') || 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif')
  const [zoom, setZoom] = useState<number>(1)
  const [fitToViewport, setFitToViewport] = useState<boolean>(true)
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const [leftPct, setLeftPct] = useState<number>(() => {
    const v = Number(localStorage.getItem('merViz.split.pct') ?? '50')
    return Number.isFinite(v) ? Math.min(80, Math.max(20, v)) : 50
  })
  const [dragging, setDragging] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const exportWrapRef = useRef<HTMLDivElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  const config: MermaidConfig = useMemo(() => {
    const isCustom = (theme as string) in CUSTOM_THEMES
    const base: BuiltinTheme = isCustom ? CUSTOM_THEMES[theme as CustomThemeKey].base : (theme as BuiltinTheme)
    const baseVars = isCustom ? CUSTOM_THEMES[theme as CustomThemeKey].variables : {}
    return {
      theme: base,
      // Always inject the selected font so diagram text updates in any theme
      themeVariables: { ...baseVars, fontFamily: font },
      securityLevel: 'strict',
      fontFamily: font,
    }
  }, [theme, font])

  const doRender = () => {
    renderMermaid(code, config)
      .then((res: { svg: string }) => {
        setSvg(res.svg)
        setError(null)
  // After setting SVG, compute fit if enabled (next microtask)
  queueMicrotask(() => computeFitScale())
      })
      .catch((e: any) => {
        setSvg('')
        setError(e?.message ?? String(e))
      })
  }

  useEffect(() => {
    if (!autoUpdate) return
    const id = setTimeout(() => doRender(), 250)
    return () => clearTimeout(id)
  }, [code, config, autoUpdate])

  useEffect(() => {
    localStorage.setItem('merViz.diagram.v1', code)
  }, [code])
  useEffect(() => {
  localStorage.setItem('merViz.theme.v1', theme)
  }, [theme])
  // no background persistence
  useEffect(() => {
    localStorage.setItem('merViz.autoupdate.v1', String(autoUpdate))
  }, [autoUpdate])
  useEffect(() => {
    localStorage.setItem('merViz.font.v1', font)
  }, [font])

  useEffect(() => {
    localStorage.setItem('merViz.split.pct', String(Math.round(leftPct)))
  }, [leftPct])

  const onExportSvg = () => {
    if (!svg) return
    downloadSvg(svg, 'diagram.svg')
  }
  const onExportPng = async (scale = 2) => {
    if (!svg) return
    await downloadPng(svg, 'diagram.png', scale)
  }

  const zoomIn = () => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))
  const zoomOut = () => setZoom((z) => Math.max(0.2, +(z - 0.1).toFixed(2)))
  const resetZoom = () => setZoom(1)
  const enableManualZoom = () => setFitToViewport(false)

  // Double-click in preview to jump to and select matching text in the editor
  const focusEditorAtText = (raw: string | null | undefined) => {
    if (!raw) return
    const q = raw.replace(/\s+/g, ' ').trim()
    if (!q) return
    // Try case-sensitive first, then case-insensitive
    let idx = code.indexOf(q)
    if (idx === -1) {
      const lowerCode = code.toLowerCase()
      idx = lowerCode.indexOf(q.toLowerCase())
    }
    if (idx !== -1 && editorRef.current) {
      const end = idx + q.length
      // Focus and select the text; this should also scroll it into view in most browsers
      editorRef.current.focus()
      try {
        editorRef.current.setSelectionRange(idx, end)
      } catch {}
    }
  }

  const onPreviewDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element | null
    if (!target) return
    // Walk up a few levels to find a nearby element with text content
    let el: Element | null = target
    let picked: Element | null = null
    for (let i = 0; i < 6 && el; i++) {
      const txt = (el.textContent || '').trim()
      if (txt) {
        // Avoid picking the entire SVG's combined text by ignoring overly long strings
        const lines = txt.split(/\r?\n/)
        if (txt.length <= 120 || lines.length <= 3) {
          picked = el
          break
        }
      }
      el = el.parentElement
    }
    const label = picked?.textContent?.trim()
    focusEditorAtText(label)
  }

  // Export menu: close on outside click or Escape
  useEffect(() => {
    if (!exportOpen) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (exportWrapRef.current && exportWrapRef.current.contains(target)) return
      setExportOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  const onSplitterDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
    const container = mainRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    let latest = leftPct
    const onMove = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left
      let pct = (x / rect.width) * 100
      pct = Math.max(20, Math.min(80, pct))
      latest = pct
      setLeftPct(pct)
  // Recompute fit while dragging for responsive behavior
  computeFitScale()
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragging(false)
      localStorage.setItem('merViz.split.pct', String(Math.round(latest)))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Compute a scale so the SVG fits into the visible preview area using all viewport
  const computeFitScale = () => {
    if (!fitToViewport) return
    const wrap = svgContainerRef.current
    if (!wrap) return
    const inner = wrap.querySelector('.preview__inner') as HTMLDivElement | null
    const svgEl = inner?.querySelector('svg') as SVGSVGElement | null
    if (!inner || !svgEl) return
    // Remove any previous transform to measure intrinsic size
    inner.style.transform = 'none'
    const wrapRect = wrap.getBoundingClientRect()
    const svgRect = svgEl.getBoundingClientRect()
    const padTop = 16, padBottom = 16, padLeft = 16, padRight = 16
    const availW = Math.max(0, wrapRect.width - padLeft - padRight)
    const availH = Math.max(0, wrapRect.height - padTop - padBottom)
    const scaleX = svgRect.width ? availW / svgRect.width : 1
    const scaleY = svgRect.height ? availH / svgRect.height : 1
    const next = Math.max(0.1, Math.min(3, Math.min(scaleX, scaleY)))
    setZoom(next)
    // Restore transform according to state on next paint
    requestAnimationFrame(() => {
      const current = svgContainerRef.current?.querySelector('.preview__inner') as HTMLDivElement | null
      if (current) current.style.transform = `scale(${next})`
    })
  }

  // Re-fit on container resize and window resize
  useEffect(() => {
    if (!fitToViewport) return
    const wrap = svgContainerRef.current
    if (!wrap) return
    let ro: ResizeObserver | null = new ResizeObserver(() => computeFitScale())
    ro.observe(wrap)
    const onWin = () => computeFitScale()
    window.addEventListener('resize', onWin)
    return () => {
      ro?.disconnect(); ro = null
      window.removeEventListener('resize', onWin)
    }
  }, [fitToViewport, svg])

  // When switching back to fit, recompute once
  useEffect(() => { if (fitToViewport) computeFitScale() }, [fitToViewport])

  return (
    <div className={"app" + (dragging ? ' is-dragging' : '')}>
      <header className="app__header">
        <div className="brand"><div className="brand__logo" /> MerViz</div>
        <div className="toolbar">
          <label>
            Theme
            <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeKey)}>
              <optgroup label="Built-in">
                {BUILTIN_THEMES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </optgroup>
              <optgroup label="Custom">
                {Object.entries(CUSTOM_THEMES).map(([key, def]) => (
                  <option key={key} value={key}>{def.label}</option>
                ))}
              </optgroup>
            </select>
          </label>
          <label>
            Font
            <select value={font} onChange={(e) => setFont(e.target.value)}>
              {/* Well-known fonts mapped to CSS font-family strings */}
              <option value="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif">System UI</option>
              <option value="Segoe UI, Tahoma, Geneva, Verdana, sans-serif">Segoe UI</option>
              <option value="Arial, Helvetica, sans-serif">Arial</option>
              <option value="Helvetica, Arial, sans-serif">Helvetica</option>
              <option value="Roboto, Helvetica, Arial, sans-serif">Roboto</option>
              <option value="Inter, system-ui, Avenir, Helvetica, Arial, sans-serif">Inter</option>
              <option value="Times New Roman, Times, serif">Times New Roman</option>
              <option value="Georgia, Times, serif">Georgia</option>
              <option value="Verdana, Geneva, Tahoma, sans-serif">Verdana</option>
              <option value="Tahoma, Geneva, Verdana, sans-serif">Tahoma</option>
              <option value="Trebuchet MS, Helvetica, sans-serif">Trebuchet MS</option>
              <option value="Lucida Sans, Lucida Sans Unicode, Geneva, Verdana, sans-serif">Lucida Sans</option>
              <option value="Courier New, Courier, monospace">Courier New</option>
              <option value="Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace">Consolas</option>
              <option value="Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">Menlo</option>
              <option value="Monaco, Menlo, Consolas, 'Courier New', monospace">Monaco</option>
            </select>
          </label>
          <div className="export" ref={exportWrapRef}>
            <button
              className="btn primary"
              onClick={() => setExportOpen((v) => !v)}
              disabled={!svg}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
            >
              Export
            </button>
            {exportOpen && (
              <div className="menu" role="menu" ref={exportMenuRef}>
                <button className="menu__item" role="menuitem" onClick={() => { onExportPng(); setExportOpen(false) }}>PNG Image</button>
                <div className="menu__sep" />
                <button className="menu__item" role="menuitem" onClick={() => { onExportSvg(); setExportOpen(false) }}>SVG Image</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="app__main" ref={mainRef}>
        <section className="pane" style={{ flex: `0 0 ${leftPct}%` }}>
          <div className="pane__header">
            <div className="pane__title">Code</div>
            <div className="pane__actions editor-toolbar">
              <label className="toggle"><input type="checkbox" checked={autoUpdate} onChange={(e) => setAutoUpdate(e.target.checked)} /> Auto-Update</label>
              <button className="btn" onClick={doRender}>Render</button>
            </div>
          </div>
          <textarea
            className="editor"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            ref={editorRef}
          />
        </section>
        <div className={"splitter" + (dragging ? ' dragging' : '')} onPointerDown={onSplitterDown} />
        <section className="pane" style={{ flex: '1 1 auto' }}>
          <div className="pane__header">
            <div className="pane__title">Preview</div>
            <div className="pane__actions preview-toolbar">
        <label className="toggle"><input type="checkbox" checked={fitToViewport} onChange={(e) => setFitToViewport(e.target.checked)} /> Fit</label>
        <button className="btn" onClick={() => { enableManualZoom(); zoomOut() }} disabled={fitToViewport}>-</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="btn" onClick={() => { enableManualZoom(); zoomIn() }} disabled={fitToViewport}>+</button>
              <div className="sep" />
        <button className="btn" onClick={() => { setFitToViewport(false); resetZoom() }} disabled={fitToViewport}>Reset</button>
            </div>
          </div>
      <div className="preview" ref={svgContainerRef} style={{ fontFamily: font }} onDoubleClick={onPreviewDoubleClick}>
            {error ? (
              <div className="error">{error}</div>
            ) : (
        <div className="preview__inner" style={{ transform: `scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: svg }} />
            )}
          </div>
        </section>
      </main>
      <footer className="app__footer">Powered by Mermaid</footer>
    </div>
  )
}
