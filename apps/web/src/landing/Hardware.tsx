import explodedImg from './img/exploded.png'
import { Reveal } from './Reveal'

const SPECS = [
  ['Size', '104.5 × 56 × 31.4 mm'],
  ['Screen', '2.42″ OLED, 128 × 64 pixels'],
  ['Microphone', 'Digital microphone behind the grille'],
  ['Start and stop', 'Orange button, or a double slap'],
  ['Power', 'USB-C, from a laptop or a power bank'],
  ['Connection', 'Wi-Fi, 2.4 GHz'],
  ['Case', '3D-printed in three parts, snaps together without screws'],
]

export function Hardware() {
  return (
    <section className="section soft" id="hardware">
      <div className="wrap">
        <Reveal className="center-head">
          <h2>Small enough to forget it is there</h2>
        </Reveal>
        <div className="split">
          <Reveal as="figure" className="hw-img">
            <img
              src={explodedImg}
              width={1600}
              height={1100}
              loading="lazy"
              alt="The Slap case opened up: a lid with the screen window and the orange button, above a tray holding the electronics"
            />
          </Reveal>
          <Reveal as="dl" className="specs">
            {SPECS.map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  )
}
