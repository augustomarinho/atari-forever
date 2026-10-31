import { defaultControls, type ControllerState } from '../core/console'

type Held = 'up' | 'down' | 'left' | 'right' | 'fire' | 'reset' | 'select'

const HOLD: Record<string, Held> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'fire',
  Enter: 'reset',
  ShiftLeft: 'select', ShiftRight: 'select',
}

/** Keyboard -> abstract controller state. Touch / gamepad can drive the same state later. */
export class KeyboardInput {
  readonly state: ControllerState = defaultControls()
  muted = false

  constructor(target: Window, private onToggle: () => void = () => {}) {
    target.addEventListener('keydown', (e) => this.handle(e, true))
    target.addEventListener('keyup', (e) => this.handle(e, false))
    target.addEventListener('blur', () => this.releaseAll())
  }

  private handle(e: KeyboardEvent, down: boolean): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const held = HOLD[e.code]
    if (held) {
      this.state[held] = down
      e.preventDefault()
      return
    }
    if (down && !e.repeat && (e.code === 'F1' || e.code === 'F2' || e.code === 'KeyM')) {
      if (e.code === 'F1') this.state.difficultyA = !this.state.difficultyA
      else if (e.code === 'F2') this.state.color = !this.state.color
      else this.muted = !this.muted
      this.onToggle()
      e.preventDefault()
    }
  }

  private releaseAll(): void {
    const s = this.state
    s.up = s.down = s.left = s.right = s.fire = s.reset = s.select = false
  }
}
