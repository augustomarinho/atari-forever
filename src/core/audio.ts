// TIA sound: two channels, each AUDC (waveform) / AUDF (divider) / AUDV (volume).
// Audio clock = 2 ticks per scanline (~31.4 kHz). Noise tables are generated LFSRs: same period and
// density as the hardware polynomials, but not necessarily the same bit order.

/** Audio samples produced per second at 262 lines x 60 Hz. */
export const TIA_AUDIO_RATE = 262 * 60 * 2

/** Maximal-length LFSR x^n + x^(n-k) + 1 style, right-shifting; returns one output bit per step. */
export function makeLfsr(bits: number, tap: number): Uint8Array {
  const len = (1 << bits) - 1
  const out = new Uint8Array(len)
  let reg = 1
  for (let i = 0; i < len; i++) {
    out[i] = reg & 1
    const fb = (reg ^ (reg >> tap)) & 1
    reg = (reg >> 1) | (fb << (bits - 1))
  }
  return out
}

export const POLY4 = makeLfsr(4, 1) // x^4 + x^3 + 1, period 15
export const POLY5 = makeLfsr(5, 2) // x^5 + x^3 + 1, period 31
export const POLY9 = makeLfsr(9, 4) // x^9 + x^5 + 1, period 511
/** 31-step pattern: 13 low then 18 high. */
export const DIV31 = Uint8Array.from({ length: 31 }, (_, i) => (i >= 13 ? 1 : 0))

class Channel {
  audc = 0
  audf = 0
  audv = 0
  private counter = 1
  private p4 = 0
  private p5 = 0
  private p9 = 0
  private d31 = 0
  private out = 0

  /** One audio-clock tick; returns the current output level 0..15. */
  tick(): number {
    if (--this.counter <= 0) {
      const c = this.audc
      this.counter = (this.audf + 1) * (c >= 12 ? 3 : 1)
      switch (c) {
        case 0:
        case 11:
          this.out = 1
          break
        case 1:
          this.p4 = (this.p4 + 1) % 15
          this.out = POLY4[this.p4]
          break
        case 2:
          this.d31 = (this.d31 + 1) % 31
          if (DIV31[this.d31]) this.p4 = (this.p4 + 1) % 15
          this.out = POLY4[this.p4]
          break
        case 3:
          this.p5 = (this.p5 + 1) % 31
          if (POLY5[this.p5]) this.p4 = (this.p4 + 1) % 15
          this.out = POLY4[this.p4]
          break
        case 4:
        case 5:
        case 12:
        case 13:
          this.out ^= 1
          break
        case 6:
        case 10:
        case 14:
          this.d31 = (this.d31 + 1) % 31
          this.out = DIV31[this.d31]
          break
        case 7:
        case 9:
        case 15:
          this.p5 = (this.p5 + 1) % 31
          this.out = POLY5[this.p5]
          break
        case 8:
          this.p9 = (this.p9 + 1) % 511
          this.out = POLY9[this.p9]
          break
      }
    }
    return this.out ? this.audv : 0
  }
}

export class TiaAudio {
  readonly ch = [new Channel(), new Channel()]

  /** reg is the TIA register number 0x15..0x1A (AUDC0, AUDC1, AUDF0, AUDF1, AUDV0, AUDV1). */
  write(reg: number, v: number): void {
    const c = this.ch[(reg - 0x15) & 1]
    switch (reg) {
      case 0x15:
      case 0x16:
        c.audc = v & 15
        break
      case 0x17:
      case 0x18:
        c.audf = v & 31
        break
      case 0x19:
      case 0x1a:
        c.audv = v & 15
        break
    }
  }

  /** Advance one audio clock; returns the mixed sample in 0..1. */
  tick(): number {
    return (this.ch[0].tick() + this.ch[1].tick()) / 30
  }
}
