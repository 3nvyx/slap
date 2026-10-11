import { Link } from 'react-router'
import deviceImg from './img/device.png'
import { Reveal } from './Reveal'

export function About() {
  return (
    <section className="section soft" id="about">
      <div className="wrap split">
        <Reveal as="figure" className="about-img">
          <img src={deviceImg} width={1600} height={1100} alt="The Slap device: a small black box with a screen, a microphone grille and an orange button" />
        </Reveal>
        <Reveal>
          <h2>What is Slap?</h2>
          <p className="lead">Slap is a small device that sits on the professor’s desk. It listens to the lecture and displays live captions on each student’s phone in their preferred language.</p>
          <p className="punch">One device. The whole room.</p>
          <Link className="btn btn-ink" to="#how">
            See how it works
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
