import { useEffect, useRef } from 'react'
import { cx } from '../components/ui'
import { screenAt, useCaptionDemo } from './captionDemo'
import { OLED_H, OLED_SCALE, OLED_W, paintOled, type OledScreen } from './oled'

/** The device seen from above, drawn to scale in CSS. The red light is on while it records.
 *  `label` describes the screen to screen readers (leave it out where the picture is only decoration). */
export function Device({ screen, className, label }: { screen: OledScreen; className?: string; label?: string }) {
  return (
    <div className={cx('device', className)} data-led={screen === 'recording' ? 'on' : 'off'}>
      <div className="device-body">
        <div className="device-glass">
          <Oled screen={screen} label={label} />
        </div>
        <span className="device-grille" />
        <span className="device-eng device-eng-rec">REC</span>
        <span className="device-led" />
        <span className="device-btn" />
        <span className="device-eng device-eng-slap">SLAP</span>
      </div>
    </div>
  )
}

/** The device's pixel screen. The server sends an empty canvas; the browser paints it. */
function Oled({ screen, label }: { screen: OledScreen; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { tick } = useCaptionDemo()
  // The "ready" screen never changes, so it is painted once.
  const frame = screen === 'ready' ? 0 : tick

  useEffect(() => {
    if (ref.current) paintOled(ref.current, screen, screenAt(frame))
  }, [screen, frame])

  return <canvas ref={ref} className="oled" width={OLED_W * OLED_SCALE} height={OLED_H * OLED_SCALE} role={label ? 'img' : undefined} aria-label={label} />
}
