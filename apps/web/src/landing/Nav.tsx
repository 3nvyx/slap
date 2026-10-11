import { Link } from 'react-router'
import { LogoArt } from '../components/LogoArt'

/** The links to the page's sections, for the top bar and the footer. */
export function SectionLinks() {
  return (
    <>
      <Link to="#about">About</Link>
      <Link to="#how">How it works</Link>
      <Link to="#hardware">Device</Link>
      <Link to="#faq">FAQ</Link>
    </>
  )
}

/** The bar that stays at the top of the page. */
export function Nav() {
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <Link className="logo" to="#top" aria-label="Slap, back to top">
          <LogoArt className="logo-art" />
          SLAP!
        </Link>
        <nav className="nav-links" aria-label="Sections">
          <SectionLinks />
        </nav>
        <Link className="btn btn-ink btn-sm nav-app" to="/home">
          Open the app
        </Link>
      </div>
    </header>
  )
}
