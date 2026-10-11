import { useState, type ReactNode } from 'react'
import { cx } from '../components/ui'
import { Accordion, type AccordionItem } from './Accordion'
import { DEMO_LECTURE } from './data'
import { Device } from './Device'
import { CaptionPhone, LanguagePhone } from './Phone'
import { Reveal } from './Reveal'

const STEPS: readonly AccordionItem[] = [
  {
    title: "Put it on the lecturer's desk",
    text: 'Plug it into a laptop or a power bank with USB-C. Slap joins the Wi-Fi and its screen shows the class code and a QR code for the room.',
  },
  {
    title: 'Press the button, or slap it twice',
    text: 'The orange button starts and stops a session. So does a double slap on the case. The recording light is on whenever the microphone is live, so everyone can see it.',
  },
  {
    title: 'Students scan and pick a language',
    text: 'Scan the sticker on the device, tap it with NFC, or type the class code. The captions open in the browser on a laptop or phone. No account and nothing to install.',
  },
  {
    title: 'Read along, live',
    text: "The lecturer's words appear as they are spoken, with each new word in bold. The translation in your language follows a moment later, sentence by sentence.",
  },
  {
    title: 'Stop. The lecture becomes study material',
    text: 'When the session stops, Slap builds an outline, concepts, flashcards and practice questions from the lecture. Sign in to keep them with your class.',
  },
]

const BUNDLE = ['Outline', 'Concepts', 'Flashcards', 'Practice questions']

/** The steps on the right, and on the left a picture that follows the open step. */
export function HowItWorks() {
  const [step, setStep] = useState(0)
  return (
    <section className="section" id="how">
      <div className="wrap">
        <Reveal className="center-head">
          <h2>How Slap works</h2>
        </Reveal>
        <div className="split split-top">
          {/* The pictures only repeat what the steps say, so screen readers skip them. */}
          <Reveal className="stage" aria-hidden>
            {/* 01: ready */}
            <Scene on={step === 0}>
              <Device className="stage-device" screen="ready" />
            </Scene>
            {/* 02: recording */}
            <Scene on={step === 1}>
              <Device className="stage-device slapped" screen="recording" />
              <p className="scene-note">The red light is on while the microphone is live.</p>
            </Scene>
            {/* 03: pick a language */}
            <Scene on={step === 2}>
              <LanguagePhone className="stage-phone" />
            </Scene>
            {/* 04: read along */}
            <Scene on={step === 3}>
              <CaptionPhone className="stage-phone" />
            </Scene>
            {/* 05: study bundle */}
            <Scene on={step === 4}>
              <div className="bundle">
                <p className="cap-label">{DEMO_LECTURE}</p>
                <p className="bundle-title">Your study bundle</p>
                <ul>
                  {BUNDLE.map((part) => (
                    <li key={part}>
                      <span>{part}</span>
                      <b>Ready</b>
                    </li>
                  ))}
                </ul>
              </div>
            </Scene>
          </Reveal>

          <Accordion items={STEPS} idPrefix="how" open={step} onChange={setStep} required numbered />
        </div>
      </div>
    </section>
  )
}

function Scene({ on, children }: { on: boolean; children: ReactNode }) {
  return <div className={cx('scene', on && 'on')}>{children}</div>
}
