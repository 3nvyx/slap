import { Link } from 'react-router'
import { LogoArt } from '../components/LogoArt'
import { SectionLinks } from './Nav'

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-cols">
          <div>
            <p className="eyebrow eyebrow-dark">Sections</p>
            <SectionLinks />
          </div>
          <div>
            <p className="eyebrow eyebrow-dark">App</p>
            <Link to="/demo">Live demo</Link>
            <Link to="/courses">Courses</Link>
          </div>
          <div>
            <p className="eyebrow eyebrow-dark">Privacy</p>
            <p className="footer-note">
              <span className="live-dot" />
              Recording light on, audio never stored. Captions run only while the lecturer has a session going.
            </p>
          </div>
        </div>
        <p className="footer-end">
          <span className="logo logo-light">
            <LogoArt className="logo-art" />
            SLAP!
          </span>
          <span>© 2026 Slap · hackathon build</span>
        </p>
      </div>
    </footer>
  )
}
