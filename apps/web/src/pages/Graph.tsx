import type { Concept } from '@slap/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d'
import { Link, useNavigate } from 'react-router-dom'
import { useClass } from '../components/ClassLayout'
import { Async, Empty, ExamBadge, inputCls, Label, MasteryBar, PageTitle } from '../components/ui'
import { api } from '../lib/api'
import { masteryColor, pct } from '../lib/format'
import type { Graph } from '../lib/types'
import { useApi } from '../lib/useApi'

type GNode = NodeObject<Concept>
type GLink = LinkObject<Concept, { relation: string }>

function readTokens() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f
  return { ink: v('--ink', '#151515'), line: v('--line', '#b5b5b1'), panel: v('--panel', '#e6e6e3'), muted: v('--muted', '#6f6f6c'), accent: v('--accent', '#ff6a00') }
}

function useThemeTokens() {
  const [tokens, setTokens] = useState(readTokens)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setTokens(readTokens())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return tokens
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ width: Math.floor(e.contentRect.width), height: Math.floor(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ...size }
}

const radius = (c: Concept) => 3.5 + Math.sqrt(Math.max(1, c.mentionCount)) * 2.1

export function GraphPage() {
  const { classId } = useClass()
  const graph = useApi(() => api.graph(classId), [classId])
  return (
    <div>
      <PageTitle kicker="Knowledge graph" title="Concept map" />
      <Async state={graph} label="Loading graph">
        {(data) => (data.nodes.length === 0 ? <Empty>No concepts yet. They appear after the first lecture’s study bundle runs.</Empty> : <GraphView data={data} classId={classId} />)}
      </Async>
    </div>
  )
}

function GraphView({ data, classId }: { data: Graph; classId: string }) {
  const navigate = useNavigate()
  const tokens = useThemeTokens()
  const fg = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined)
  const box = useSize<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const fitted = useRef(false)

  // Fresh copies: force-graph mutates nodes (x/y) and links (source/target → objects).
  const gdata = useMemo(() => {
    const ids = new Set(data.nodes.map((n) => n.id))
    return {
      nodes: data.nodes.map((n) => ({ ...n })) as GNode[],
      links: data.links.filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => ({ source: l.from, target: l.to, relation: l.relation })) as GLink[],
    }
  }, [data])

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const n of data.nodes) m.set(n.id, new Set())
    for (const l of data.links) {
      m.get(l.from)?.add(l.to)
      m.get(l.to)?.add(l.from)
    }
    return m
  }, [data])

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => (q ? new Set(data.nodes.filter((n) => n.name.toLowerCase().includes(q)).map((n) => n.id)) : null), [q, data.nodes])

  const selected = hover ?? focus
  const neighbourhood = useMemo(() => (selected ? new Set([selected, ...(adjacency.get(selected) ?? [])]) : null), [selected, adjacency])
  const selectedNode = data.nodes.find((n) => n.id === selected)

  const focusNode = (id: string) => {
    const n = gdata.nodes.find((x) => x.id === id)
    setFocus(id)
    if (n && n.x != null && n.y != null) {
      fg.current?.centerAt(n.x, n.y, 600)
      fg.current?.zoom(3, 600)
    }
  }

  const linkEnd = (e: GLink['source']) => (typeof e === 'object' && e ? String(e.id) : String(e))

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <div className="relative overflow-hidden rounded-md border border-line bg-panel">
        <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2">
          <input
            className={inputCls + ' max-w-xs bg-panel/95'}
            placeholder="Search concepts…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setFocus(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches && matches.size > 0) focusNode([...matches][0])
              if (e.key === 'Escape') setQuery('')
            }}
            aria-label="Search concepts"
          />
          {matches && <span className="label">{matches.size} match{matches.size === 1 ? '' : 'es'} · enter to focus</span>}
        </div>
        <div ref={box.ref} className="dotgrid h-[calc(100dvh-15rem)] min-h-[440px] w-full">
          <ForceGraph2D<Concept, { relation: string }>
            ref={fg}
            width={box.width}
            height={box.height}
            graphData={gdata}
            nodeId="id"
            backgroundColor="rgba(0,0,0,0)"
            cooldownTime={3000}
            d3AlphaDecay={0.045}
            d3VelocityDecay={0.35}
            warmupTicks={40}
            onEngineStop={() => {
              if (!fitted.current) {
                fitted.current = true
                fg.current?.zoomToFit(400, 60)
              }
            }}
            linkColor={(l) => {
              const a = linkEnd(l.source)
              const b = linkEnd(l.target)
              return selected && (a === selected || b === selected) ? tokens.ink : tokens.muted
            }}
            linkWidth={(l) => (selected && (linkEnd(l.source) === selected || linkEnd(l.target) === selected) ? 2 : 1)}
            onNodeHover={(n) => setHover(n ? String(n.id) : null)}
            onNodeClick={(n) => navigate(`/c/${classId}/concept/${n.id}`)}
            onBackgroundClick={() => setFocus(null)}
            nodePointerAreaPaint={(n, color, ctx) => {
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(n.x ?? 0, n.y ?? 0, radius(n) + 3, 0, 2 * Math.PI)
              ctx.fill()
            }}
            onRenderFramePost={(ctx, scale) => {
              // Labels last, so they sit on top of every node.
              for (const n of gdata.nodes) {
                const id = String(n.id)
                const show = neighbourhood ? neighbourhood.has(id) : matches ? matches.has(id) : scale > 2.4
                if (!show || n.x == null || n.y == null) continue
                const fs = Math.max(11 / scale, 2.4)
                ctx.font = `${id === selected ? '600 ' : ''}${fs}px "Helvetica Neue", Inter, system-ui, sans-serif`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                const ty = n.y + radius(n) + (n.examFlag ? 4.5 : 2.5)
                const w = ctx.measureText(n.name).width
                ctx.globalAlpha = 0.85
                ctx.fillStyle = tokens.panel
                ctx.fillRect(n.x - w / 2 - 2 / scale, ty - 1 / scale, w + 4 / scale, fs + 2 / scale)
                ctx.globalAlpha = 1
                ctx.fillStyle = tokens.ink
                ctx.fillText(n.name, n.x, ty)
              }
            }}
            nodeCanvasObject={(n, ctx, scale) => {
              const x = n.x ?? 0
              const y = n.y ?? 0
              const r = radius(n)
              const id = String(n.id)
              const dimmed = neighbourhood ? !neighbourhood.has(id) : matches ? !matches.has(id) : false
              ctx.globalAlpha = dimmed ? 0.18 : 1
              if (n.examFlag) {
                ctx.beginPath()
                ctx.arc(x, y, r + 2.6, 0, 2 * Math.PI)
                ctx.strokeStyle = tokens.ink
                ctx.lineWidth = 1.4
                ctx.stroke()
              }
              ctx.beginPath()
              ctx.arc(x, y, r, 0, 2 * Math.PI)
              ctx.fillStyle = masteryColor(n.mastery)
              ctx.fill()
              if (id === selected) {
                ctx.strokeStyle = tokens.accent
                ctx.lineWidth = 2 / scale
                ctx.stroke()
              }
              ctx.globalAlpha = 1
            }}
          />
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-md border border-line bg-panel p-5">
          {selectedNode ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold leading-tight tracking-tight">{selectedNode.name}</h2>
                {selectedNode.examFlag && <ExamBadge />}
              </div>
              <p className="mt-2 text-sm text-ink-2">{selectedNode.definition}</p>
              <div className="mt-4">
                <Label className="mb-1">Mastery {pct(selectedNode.mastery)}</Label>
                <MasteryBar value={selectedNode.mastery} />
              </div>
              <div className="mt-3 text-xs text-muted">
                {selectedNode.mentionCount} mentions · {adjacency.get(selectedNode.id)?.size ?? 0} links · {selectedNode.source}
              </div>
              <Link to={`/c/${classId}/concept/${selectedNode.id}`} className="mt-4 inline-block text-sm font-medium underline">
                Open note →
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted">Hover a node to see its neighbourhood. Click to open the note.</p>
          )}
        </div>
        <div className="rounded-md border border-line bg-panel p-5 text-sm">
          <Label className="mb-3">Legend</Label>
          <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${masteryColor(0)}, ${masteryColor(0.5)}, ${masteryColor(1)})` }} />
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>weak</span>
            <span>mastered</span>
          </div>
          <ul className="mt-4 space-y-2 text-ink-2">
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: masteryColor(null) }} /> not practised yet
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-full border-[1.5px] border-ink p-px">
                <span className="block size-full rounded-full bg-muted" />
              </span>
              flagged for the exam
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-muted" /> size = how often it came up
            </li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
