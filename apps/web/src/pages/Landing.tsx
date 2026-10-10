import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserMenu } from '../components/Shell'
import { Button, inputCls, Label, Logo } from '../components/ui'

function DevicePlaceholder() {
  return (
    <div className="dotgrid relative grid aspect-[4/3] place-items-center overflow-hidden rounded-md border border-line bg-panel">
      <div className="relative w-[68%] max-w-sm rounded-[14px] bg-ink p-4 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)]">
        <div className="flex items-start gap-4">
          <div className="grid aspect-[2/1] w-3/5 place-items-center rounded-[4px] bg-[#0b0b0b] p-2 font-mono text-[10px] leading-tight text-[#cfe8ff]">
            <div className="w-full">
              <div className="opacity-60">CS229 · LIVE</div>
              <div className="mt-1">…turns out this is a</div>
              <div>pretty good model.</div>
            </div>
          </div>
          <div className="flex flex-1 flex-col items-end gap-3">
            <span className="pulse size-3 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
            <span className="size-8 rounded-full border-2 border-[#3a3a3a] bg-[#222]" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8a8a8a]">slap / one</span>
          <span className="grid grid-cols-6 gap-1">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="size-1 rounded-full bg-[#444]" />
            ))}
          </span>
        </div>
      </div>
      <Label className="absolute bottom-3 left-4">Device photo placeholder</Label>
    </div>
  )
}

const FEATURES = [
  { n: '01', title: 'Captions in your language', body: 'Slap it on the desk. Everyone in the room scans the sticker and reads the lecture live: English, Spanish, Chinese, Vietnamese and more, on a laptop or phone.' },
  { n: '02', title: 'A map of the lecture', body: 'Afterwards every concept becomes a note in a knowledge graph, linked across lectures and your textbook chapter. Hover any term in the transcript for its definition.' },
  { n: '03', title: 'Practice that sticks', body: 'Spaced-repetition flashcards, practice questions in your lecturer’s style, a three-minute recall check, exam topics and a plan for today.' },
]

export function Landing() {
  const [code, setCode] = useState('')
  const navigate = useNavigate()
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <Logo className="text-xl" />
        <nav className="flex items-center gap-3">
          <Link to="/classes" className="hidden text-sm text-ink-2 hover:text-ink sm:inline">
            My classes
          </Link>
          <UserMenu />
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 md:px-8">
        <section className="grid items-center gap-10 py-10 md:grid-cols-[1.1fr_1fr] md:py-16">
          <div>
            <Label className="mb-5">Classroom device · live captions · study</Label>
            <h1 className="text-5xl font-bold leading-[0.95] tracking-tight md:text-7xl">
              Slap it on the desk.
              <br />
              <span className="text-muted">The room reads along.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
              One $20 device per classroom captions the lecture live in your language, then turns it and your textbook into a knowledge graph, flashcards and practice questions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="inline-flex h-12 items-center rounded-md bg-ink px-6 font-semibold text-bg">
                Sign in
              </Link>
              <a href="#scan" className="inline-flex h-12 items-center rounded-md border border-line bg-panel px-6 font-semibold">
                Scan to see captions
              </a>
            </div>
          </div>
          <DevicePlaceholder />
        </section>

        <section id="scan" className="grid gap-6 rounded-md border border-line bg-panel p-6 md:grid-cols-[auto_1fr] md:items-center md:p-8">
          <div className="dotgrid grid size-28 place-items-center rounded-md border border-line bg-bg">
            <svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M3 8V4a1 1 0 0 1 1-1h4M16 3h4a1 1 0 0 1 1 1v4M21 16v4a1 1 0 0 1-1 1h-4M8 21H4a1 1 0 0 1-1-1v-4" />
              <rect x="7" y="7" width="4" height="4" />
              <rect x="13" y="13" width="4" height="4" />
              <path d="M13 7h4v2M7 15v2h2" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Scan to see captions</h2>
            <p className="mt-2 text-ink-2">
              Point your camera at the sticker on the device, tap it with NFC, or type the class code. No account needed to read along.
            </p>
            <form
              className="mt-4 flex max-w-md gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (code.trim()) navigate(`/j/${encodeURIComponent(code.trim().toUpperCase())}`)
              }}
            >
              <input className={inputCls + ' font-mono uppercase'} placeholder="Class code, e.g. CS229" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Class code" />
              <Button variant="accent" type="submit">
                Join
              </Button>
            </form>
          </div>
        </section>

        <section className="grid gap-4 py-12 md:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.n} className="flex flex-col rounded-md border border-line bg-panel p-6">
              <span className="font-mono text-xs text-accent">{f.n}</span>
              <h3 className="mt-6 text-xl font-bold tracking-tight">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">{f.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted md:px-8">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-accent" />
            Recording light on, audio never stored. Captions only while the lecturer runs a session.
          </span>
          <span className="font-mono text-xs uppercase tracking-wider">slap · hackathon build</span>
        </div>
      </footer>
    </div>
  )
}
