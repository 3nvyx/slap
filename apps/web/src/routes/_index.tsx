import type { Route } from './+types/_index'
import { About } from '../landing/About'
import { CaptionDemoProvider } from '../landing/CaptionDemoProvider'
import { Conversation } from '../landing/Conversation'
import { Faq } from '../landing/Faq'
import { Footer } from '../landing/Footer'
import { Hardware } from '../landing/Hardware'
import { Hero } from '../landing/Hero'
import { HowItWorks } from '../landing/HowItWorks'
import css from '../landing/landing.css?url'
import { Nav } from '../landing/Nav'

export const meta: Route.MetaFunction = () => [
  { title: 'Slap: live captions for the whole classroom' },
  {
    name: 'description',
    content: "Slap is a small device for the lecturer's desk. The whole room gets live captions in their own language, and every lecture becomes notes, flashcards and practice.",
  },
]

// The landing page has its own stylesheet, loaded on this page only. Every rule in it sits inside .landing.
export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: css }]

/** The public page that explains Slap. Its parts are in src/landing. */
export default function LandingPage() {
  return (
    <CaptionDemoProvider>
      <div className="landing">
        <Nav />
        <main id="top">
          <Hero />
          <About />
          <HowItWorks />
          <Hardware />
          <Faq />
        </main>
        <Conversation />
        <Footer />
      </div>
    </CaptionDemoProvider>
  )
}
