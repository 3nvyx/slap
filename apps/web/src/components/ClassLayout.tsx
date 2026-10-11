import { AudioLines, CalendarDays, Check, ChevronsUpDown, ClipboardCheck, House, Layers, LayoutGrid, ListChecks, Mic, PencilLine, Presentation, Waypoints, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, type CSSProperties } from 'react'
import { Link, Outlet, useLoaderData, useLocation, useOutletContext, useParams } from 'react-router'
import type { ClassSummary } from '@slap/contracts'
import { api } from '../lib/api'
import { MOCK } from '../lib/env'
import type { ClassDetail } from '../lib/types'
import { useApi } from '../lib/useApi'
import { LogoArt } from './LogoArt'
import { EASE_OUT, SPRING } from './motion'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './shadcn/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from './shadcn/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from './shadcn/tooltip'
import { cx, Dot, ErrorBox, Logo, Spinner } from './ui'

export interface ClassContext {
  classId: string
  detail: ClassDetail
  reloadClass: () => Promise<void>
}

export function useClass() {
  return useOutletContext<ClassContext>()
}

const NAV: Array<{ to: string; label: string; key: string; icon: LucideIcon; end?: boolean }> = [
  { to: '', label: 'Lectures', key: '01', icon: AudioLines, end: true },
  { to: 'graph', label: 'Graph', key: '02', icon: Waypoints },
  { to: 'review', label: 'Review', key: '03', icon: Layers },
  { to: 'practice', label: 'Practice', key: '04', icon: PencilLine },
  { to: 'partner', label: 'Partner', key: '05', icon: Mic },
  { to: 'exam-topics', label: 'Exam topics', key: '06', icon: ListChecks },
  { to: 'today', label: 'Study plan', key: '07', icon: CalendarDays },
  { to: 'pretest', label: 'Pretest', key: '08', icon: ClipboardCheck },
  { to: 'lecturer', label: 'Lecturer', key: '09', icon: Presentation },
]

export function DeviceChip({ device, folded }: { device: ClassDetail['device']; folded?: boolean }) {
  const state = device?.state ?? 'offline'
  const live = state === 'recording'
  const text = live ? 'Recording' : device ? state : 'None here'
  const dot = <Dot live={live} className={state === 'error' ? '!bg-bad' : state === 'idle' ? '!bg-good' : undefined} />
  if (folded) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex size-8 items-center justify-center rounded-md border border-line bg-panel" aria-label={`Device: ${text}`}>
            {dot}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="capitalize">
          Device: {text}
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-line bg-panel px-2.5 py-2">
      {dot}
      <div className="min-w-0">
        <div className="label leading-none">Device</div>
        <div className="mt-1 text-[14px] font-medium capitalize leading-none">{text}</div>
      </div>
    </div>
  )
}

/** The course named at the top of the side bar; pressing it lists the others. */
function CourseSwitcher({ classId, current, courses, folded, onGo }: { classId: string; current?: ClassSummary; courses?: ClassSummary[]; folded: boolean; onGo: () => void }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label="Switch course" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <span className="flex aspect-square size-8 items-center justify-center rounded-md bg-ink font-mono text-[11px] font-semibold text-bg">{(current?.code ?? '··').slice(0, 2)}</span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-[14px] font-semibold text-ink">{current?.name ?? 'Loading…'}</span>
                <span className="truncate font-mono text-[11px] text-muted">{current?.code ?? ' '}</span>
              </span>
              <ChevronsUpDown className="ml-auto !size-3.5 text-muted" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-60" align="start" side={folded ? 'right' : 'bottom'} sideOffset={6}>
            <DropdownMenuLabel className="label">Courses</DropdownMenuLabel>
            {courses?.map((c) => (
              <DropdownMenuItem key={c.id} asChild>
                <Link to={`/c/${c.id}`} onClick={onGo}>
                  <span className="w-16 shrink-0 truncate font-mono text-[11px] text-muted">{c.code}</span>
                  <span className="truncate">{c.name}</span>
                  {c.id === classId && <Check className="ml-auto text-accent" />}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/courses" onClick={onGo}>
                <LayoutGrid />
                All courses
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** The side bar of a course: it replaces the top bar there. It folds to a rail of icons on a desktop (the
 *  button beside the logo, its right edge, or Cmd/Ctrl+B) and is a slide-in sheet on a phone. */
function ClassSidebar({ classId, detail, courses }: { classId: string; detail?: ClassDetail; courses?: ClassSummary[] }) {
  const { state, isMobile, setOpenMobile } = useSidebar()
  const { pathname } = useLocation()
  const folded = state === 'collapsed' && !isMobile
  const base = `/c/${classId}`
  const closeSheet = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 p-3 group-data-[collapsible=icon]:px-2">
        <div className={cx('flex items-center justify-between gap-2', folded && 'flex-col')}>
          <Link to="/" aria-label="Slap home" className="flex items-center gap-2 px-1 text-ink">
            {folded ? <LogoArt className="h-6 w-auto" /> : <Logo className="text-[17px]" />}
            {MOCK && !folded && <span className="rounded-sm bg-ink px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-bg">mock</span>}
          </Link>
          <SidebarTrigger className="text-muted hover:text-ink" title={folded ? 'Open the side bar' : 'Fold the side bar'} />
        </div>
        <CourseSwitcher classId={classId} current={detail?.class ?? courses?.find((c) => c.id === classId)} courses={courses} folded={folded} onGo={closeSheet} />
      </SidebarHeader>

      <SidebarContent>
        {/* The way back to the dashboard sits above the course's own pages. */}
        <SidebarGroup className="px-3 pb-0 group-data-[collapsible=icon]:px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Home" className="text-[14px] text-ink-2">
                <Link to="/home" onClick={closeSheet}>
                  <House />
                  <span>Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="px-3 group-data-[collapsible=icon]:px-2">
          <SidebarGroupLabel className="label">Course</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">
            {NAV.map((n) => {
              const to = n.to ? `${base}/${n.to}` : base
              const active = pathname === to || pathname === `${to}/` || (!n.end && pathname.startsWith(`${to}/`))
              return (
                <SidebarMenuItem key={n.label}>
                  <SidebarMenuButton asChild isActive={active} tooltip={n.label} className="relative text-[14px] text-ink-2 data-[active=true]:bg-transparent data-[active=true]:text-ink">
                    <Link to={to} onClick={closeSheet} aria-current={active ? 'page' : undefined}>
                      {/* The marker slides from the old page's row to the new one. */}
                      {active && (
                        <motion.span layoutId="class-nav-marker" layoutDependency={pathname} transition={SPRING} className="absolute inset-0 rounded-md bg-sidebar-accent">
                          <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
                        </motion.span>
                      )}
                      <n.icon className="relative" />
                      <span className="relative flex-1 truncate">{n.label}</span>
                      <span className="relative font-mono text-[11px] text-muted group-data-[collapsible=icon]:hidden">{n.key}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-2 p-3 group-data-[collapsible=icon]:px-2">
        {detail && <DeviceChip device={detail.device} folded={folded} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export function ClassLayout() {
  const { classId = '' } = useParams()
  // Whether the side bar starts open: the route's loader reads it from the cookie the side bar writes.
  const { sidebarOpen } = useLoaderData() as { sidebarOpen: boolean }
  const { pathname } = useLocation()
  const detail = useApi(() => api.classDetail(classId), [classId])
  const classes = useApi(() => api.classes(), [])

  // Keep the device chip and live status fresh.
  const reloadDetail = detail.reload
  useEffect(() => {
    const t = setInterval(() => void reloadDetail(), 8000)
    return () => clearInterval(t)
  }, [reloadDetail])

  return (
    <SidebarProvider defaultOpen={sidebarOpen} style={{ '--sidebar-width': '15rem', '--sidebar-width-icon': '3.25rem' } as CSSProperties}>
      <ClassSidebar classId={classId} detail={detail.data} courses={classes.data} />
      <SidebarInset className="min-w-0">
        {/* A phone has no room for the side bar: this strip opens it as a sheet. */}
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur md:hidden">
          <SidebarTrigger className="text-ink-2" title="Open the side bar" />
          <span className="h-4 w-px bg-line" />
          <Link to="/" aria-label="Slap home">
            <Logo className="text-base" />
          </Link>
          {detail.data && <span className="ml-auto truncate font-mono text-xs text-muted">{detail.data.class.code}</span>}
        </header>
        <div className="min-w-0 flex-1 px-4 py-8 md:px-10">
          <div className="mx-auto max-w-[1100px]">
            {detail.data ? (
              // Each page of the course fades up as it is opened.
              <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={EASE_OUT}>
                <Outlet context={{ classId, detail: detail.data, reloadClass: detail.reload } satisfies ClassContext} />
              </motion.div>
            ) : detail.error ? (
              <ErrorBox error={detail.error} onRetry={detail.reload} />
            ) : (
              <Spinner label="Loading class" />
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
