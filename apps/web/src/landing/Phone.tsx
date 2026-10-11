import type { ReactNode } from 'react'
import { LogoArt } from '../components/LogoArt'
import { cx } from '../components/ui'
import { demoAt, useCaptionDemo } from './captionDemo'
import { DEMO_CLASS, DEMO_LECTURE, LANG_NAMES, LINES } from './data'

/** A phone: the frame and its top bar. What is on the screen goes inside. */
function Phone({ className, title, langCode, children }: { className?: string; title: string; langCode?: string; children: ReactNode }) {
  return (
    <div className={cx('phone', className)}>
      <div className="phone-body">
        <div className="phone-bar">
          <LogoArt className="phone-logo" />
          <span className="phone-class">{title}</span>
          {langCode && <span className="phone-lang">{langCode}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}

/** A phone reading along: the lecturer's words on top, the translation below, both following the demo. */
export function CaptionPhone({ className }: { className?: string }) {
  const { tick, lang } = useCaptionDemo()
  const step = demoAt(tick)
  // The newest two words are bold; a finished sentence is bold all the way.
  const cut = step.done ? 0 : Math.max(0, step.shown - 2)
  // While a sentence is being said, the translation still shows the one before it, greyed out.
  const before = step.line > 0 ? LINES[step.line - 1] : step.first ? null : LINES[LINES.length - 1]

  return (
    <Phone className={className} title={DEMO_LECTURE} langCode={lang.toUpperCase()}>
      <div className="phone-caps">
        <p className="cap-label">Lecturer · EN</p>
        <p className="cap-source">
          {cut > 0 && `${step.words.slice(0, cut).join(' ')} `}
          <b>{step.words.slice(cut, step.shown).join(' ')}</b>
        </p>
        <hr />
        <p className="cap-label">{`Your language · ${LANG_NAMES[lang]}`}</p>
        <p className="cap-trans" lang={lang}>
          {step.done ? (
            LINES[step.line][lang]
          ) : (
            <>
              {before && <span className="dim">{`${before[lang]} `}</span>}
              <span className="wait">…</span>
            </>
          )}
        </p>
      </div>
      <div className="phone-foot">
        <span className="live-dot" />
        Live
      </div>
    </Phone>
  )
}

/** A phone on the "pick a language" screen. */
export function LanguagePhone({ className }: { className?: string }) {
  return (
    <Phone className={className} title={DEMO_CLASS}>
      <div className="phone-pick">
        <p className="cap-label">Read captions in</p>
        <ul>
          <li>English</li>
          <li className="on">日本語</li>
          <li>Tiếng Việt</li>
        </ul>
      </div>
    </Phone>
  )
}
