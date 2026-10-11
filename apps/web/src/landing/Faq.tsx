import { useState } from 'react'
import { Accordion, type AccordionItem } from './Accordion'
import { Reveal } from './Reveal'

const QUESTIONS: readonly AccordionItem[] = [
  {
    title: 'Do students need an account or an app?',
    text: 'No. Scanning the sticker opens the captions in the browser, on a laptop or a phone. You only sign in if you want the notes, flashcards and practice afterwards.',
  },
  {
    title: 'Is the lecture recorded?',
    text: 'The audio is never stored. Slap keeps only the text of the lecture. The recording light on the device is on whenever the microphone is live, and captions run only while the lecturer has a session going.',
  },
  {
    title: 'Which languages can I read in?',
    text: 'English, Japanese and Vietnamese.',
  },
  {
    title: 'What does the device need?',
    text: 'USB-C power from a laptop or a power bank, and a 2.4 GHz Wi-Fi network.',
  },
  {
    title: 'Can I try it without the device?',
    text: "Yes. In the app, a class can use the laptop's microphone in place of the device.",
  },
  {
    title: 'Can I buy one?',
    text: 'Not yet. Slap is a prototype built at a hackathon.',
  },
]

export function Faq() {
  // All the answers start closed.
  const [open, setOpen] = useState(-1)
  return (
    <section className="section" id="faq">
      <div className="wrap narrow">
        <Reveal>
          <h2>Questions</h2>
        </Reveal>
        <Accordion className="acc-faq" items={QUESTIONS} idPrefix="faq" open={open} onChange={setOpen} />
      </div>
    </section>
  )
}
