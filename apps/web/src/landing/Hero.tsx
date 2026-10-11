import { Link } from 'react-router'
import { useCaptionDemo } from './captionDemo'
import { LANG_NAMES, type CaptionLang } from './data'
import { Device } from './Device'
import { CaptionPhone } from './Phone'

export function Hero() {
  return (
    <section className="hero">
      <div className="hero-bg" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="wrap hero-in">
        <div className="hero-copy">
          <h1>To get higher quality of education from the small device.</h1>
          <p className="hero-sub">One small device at the front of the room captions the lecture live, in English, Japanese or Vietnamese.</p>
          <div className="hero-cta">
            <Link className="btn btn-ghost" to="#how">
              How it works
            </Link>
            <Link className="btn btn-accent" to="/demo">
              Demo
            </Link>
          </div>
        </div>

        <div className="hero-art">
          <Device className="hero-device" screen="recording" label="The device screen: recording, with a sound level bar and the latest caption" />
          <CaptionPhone className="hero-phone" />
          <div className="langs">
            <LanguageButtons />
            <p className="langs-more">or read the original in English</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/** The buttons that choose the language of the translation in the demo, on every phone on the page. */
function LanguageButtons() {
  const { lang, setLang } = useCaptionDemo()
  return (
    <div className="lang-chips" role="group" aria-label="Caption language for the demo">
      {(Object.keys(LANG_NAMES) as CaptionLang[]).map((code) => (
        <button key={code} type="button" aria-pressed={lang === code} onClick={() => setLang(code)}>
          {LANG_NAMES[code]}
        </button>
      ))}
    </div>
  )
}
