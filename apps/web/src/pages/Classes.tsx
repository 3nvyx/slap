import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TopBar } from '../components/Shell'
import { Async, Button, Empty, ErrorBox, inputCls, Label, PageTitle, Panel } from '../components/ui'
import { api } from '../lib/api'
import { examInfo, fmtDate } from '../lib/format'
import { useApi } from '../lib/useApi'
import { NewRecordingsCard, OnlineDevicesCard } from './Devices'

export function ClassesPage() {
  const classes = useApi(() => api.classes(), [])
  const navigate = useNavigate()

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <PageTitle kicker="No sign-in needed" title="Classes" />
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <Async state={classes} label="Loading classes">
            {(data) =>
              data.length === 0 ? (
                <Empty>No classes yet. Create one to start recording lectures.</Empty>
              ) : (
                <div className="grid content-start gap-4 sm:grid-cols-2">
                  {data.map((c) => {
                    const exam = examInfo(c.nextExam)
                    return (
                      <Link key={c.id} to={`/c/${c.id}`} className="group flex flex-col rounded-md border border-line bg-panel p-5 transition hover:border-ink">
                        <span className="font-mono text-sm font-semibold">{c.code}</span>
                        <h2 className="mt-6 text-xl font-bold leading-tight tracking-tight">{c.name}</h2>
                        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-3">
                          <div>
                            <Label>Lectures</Label>
                            <div className="font-mono text-lg">{c.lectureCount}</div>
                          </div>
                          <div>
                            <Label>Next exam</Label>
                            <div className="font-mono text-lg">{exam ? fmtDate(exam.date) : '—'}</div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )
            }
          </Async>
          <div className="space-y-4">
            <NewRecordingsCard classes={classes.data ?? []} onChange={classes.reload} />
            <OnlineDevicesCard classes={classes.data ?? []} onClassesChanged={classes.reload} />
            <CreateForm onDone={(id) => navigate(`/c/${id}`)} />
          </div>
        </div>
      </main>
    </div>
  )
}

function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function CreateForm({ onDone }: { onDone: (id: string) => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const s = useSubmit()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void s.run(async () => onDone((await api.createClass(name.trim(), code.trim().toUpperCase())).id))
  }
  return (
    <Panel title="Create a class">
      <form onSubmit={submit} className="space-y-3">
        <input className={inputCls} placeholder="Machine Learning" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Class name" />
        <input className={inputCls + ' font-mono uppercase'} placeholder="Short code, e.g. CS229" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={12} aria-label="Class code" />
        <p className="text-xs text-muted">The code goes in the join link and on the device sticker. Keep it short.</p>
        {s.error != null && <ErrorBox error={s.error} />}
        <Button className="w-full" disabled={s.busy || !name.trim() || !code.trim()}>
          {s.busy ? 'Creating…' : 'Create class'}
        </Button>
      </form>
    </Panel>
  )
}
