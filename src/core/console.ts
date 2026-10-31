import { CPU6507 } from './cpu6507'
import { AtariBus } from './bus'
import { createCartridge } from './cartridge'
import { RIOT } from './riot'
import { CLOCKS_PER_LINE, TIA } from './tia'

/** Player 0 joystick plus console switches. true = pressed (or A / colour for the toggles). */
export interface ControllerState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  fire: boolean
  reset: boolean
  select: boolean
  /** Player 0 difficulty: true = A (hard), false = B. */
  difficultyA: boolean
  /** true = colour, false = black & white. */
  color: boolean
}

export const defaultControls = (): ControllerState => ({
  up: false, down: false, left: false, right: false, fire: false,
  reset: false, select: false, difficultyA: true, color: true,
})

export class Atari2600 {
  readonly tia = new TIA()
  readonly riot: RIOT
  readonly bus: AtariBus
  readonly cpu: CPU6507

  constructor(rom: Uint8Array) {
    const cart = createCartridge(rom)
    // RIOT timer reads use the cycle count at instruction start (a few cycles coarse; fine for now).
    this.riot = new RIOT(() => this.cpu.cycles)
    this.bus = new AtariBus(this.tia, this.riot, cart)
    this.cpu = new CPU6507(this.bus, 0x1fff)
    this.tia.defer = true
    this.reset()
  }

  reset(): void {
    this.cpu.reset()
  }

  /** Drive the joystick / console switch pins. Pins read 0 when pressed. */
  setControls(s: ControllerState): void {
    let a = 0xff
    if (s.right) a &= ~0x80
    if (s.left) a &= ~0x40
    if (s.down) a &= ~0x20
    if (s.up) a &= ~0x10
    this.riot.swchaIn = a

    let b = 0xff
    if (s.reset) b &= ~0x01
    if (s.select) b &= ~0x02
    if (!s.color) b &= ~0x08
    if (!s.difficultyA) b &= ~0x40
    this.riot.swchbIn = b

    this.tia.inpt4 = s.fire ? 0x00 : 0x80
  }

  /**
   * Run one CPU instruction and keep the TIA in lockstep (3 colour clocks per CPU cycle).
   * Bus accesses land on an instruction's last cycle, so TIA writes are applied after N-1 cycles.
   * Returns CPU cycles consumed, including any WSYNC stall.
   */
  step(): number {
    const tia = this.tia
    const n = this.cpu.step()
    tia.advance((n - 1) * 3)
    tia.flushWrites()
    tia.advance(3)
    let total = n
    if (tia.wsync) {
      tia.wsync = false
      const rem = tia.clock === 0 ? 0 : CLOCKS_PER_LINE - tia.clock
      tia.advance(rem)
      const stall = rem / 3
      this.cpu.cycles += stall
      total += stall
    }
    return total
  }

  /** Run until the TIA finishes a frame. */
  runFrame(): void {
    this.tia.frameReady = false
    for (let k = 0; k < 200_000 && !this.tia.frameReady; k++) this.step()
  }
}
