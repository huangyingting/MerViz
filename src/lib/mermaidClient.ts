import mermaid from 'mermaid'

export type MermaidSecurityLevel = 'strict' | 'loose' | 'antiscript' | 'sandbox'

export interface MermaidConfig {
  theme: 'default' | 'neutral' | 'dark' | 'forest' | 'base'
  themeVariables?: Record<string, any>
  securityLevel?: MermaidSecurityLevel
  fontFamily?: string
}

let initialized = false

function init(config: MermaidConfig) {
  if (initialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: config.theme,
    themeVariables: config.themeVariables,
    securityLevel: config.securityLevel ?? 'strict',
  // fontFamily can also be provided via themeVariables.fontFamily; keep both for compatibility
  fontFamily: config.fontFamily,
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  })
  initialized = true
}

export async function renderMermaid(code: string, config: MermaidConfig): Promise<{ svg: string }> {
  if (!initialized) init(config)
  // Re-set config on every render in case theme changed
  mermaid.initialize({
    startOnLoad: false,
    theme: config.theme,
    themeVariables: config.themeVariables,
    securityLevel: config.securityLevel ?? 'strict',
  fontFamily: config.fontFamily,
  htmlLabels: false,
  flowchart: { htmlLabels: false },
  })

  // Validate first to avoid Mermaid generating its default error SVG
  try {
    await mermaid.parse(code)
  } catch (err: any) {
    // Rethrow a clean error so callers can show a friendly overlay
    const msg = err?.message || 'Mermaid parse error'
    throw new Error(msg)
  }

  const id = 'merviz-' + Math.random().toString(36).slice(2)
  const { svg } = await mermaid.render(id, code)
  // Normalize <br ...> tags in output to be XML-friendly
  const sanitized = svg.replace(/<br\b[^>]*>/gi, '<br/>')
  return { svg: sanitized }
}
