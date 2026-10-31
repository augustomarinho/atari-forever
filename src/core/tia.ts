// TIA (video). Sync, blanking, playfield, players, missiles, ball, HMOVE, collisions. Audio comes later.
import { PALETTE } from './palette'
import { TiaAudio } from './audio'

export const SCREEN_W = 160
export const SCREEN_H = 192
export const MAX_LINES = 312
export const CLOCKS_PER_LINE = 228
export const HBLANK_CLOCKS = 68
export const BLACK = 0xff000000

// Write registers
const VSYNC = 0x00
const VBLANK = 0x01
const WSYNC = 0x02
const NUSIZ0 = 0x04
const COLUP0 = 0x06
const COLUP1 = 0x07
const COLUPF = 0x08
const COLUBK = 0x09
const CTRLPF = 0x0a
const REFP0 = 0x0b
const PF0 = 0x0d
const PF1 = 0x0e
const PF2 = 0x0f
const RESP0 = 0x10
const RESP1 = 0x11
const RESM0 = 0x12
const RESM1 = 0x13
const RESBL = 0x14
const GRP0 = 0x1b
const GRP1 = 0x1c
const ENAM0 = 0x1d
const ENABL = 0x1f
const HMP0 = 0x20
const VDELP0 = 0x25
const VDELBL = 0x27
const RESMP0 = 0x28
const RESMP1 = 0x29
const HMOVE = 0x2a
const HMCLR = 0x2b
const CXCLR = 0x2c

// Object indexes into pos[]
const OBJ_P0 = 0
const OBJ_M0 = 2
const OBJ_BL = 4

// Per-pixel object mask bits (for priority + collisions)
const P0 = 1
const P1 = 2
const M0 = 4
const M1 = 8
const PF = 16
const BL = 32

/** Copy offsets for each NUSIZ player mode (bits 0-2). */
const COPIES: number[][] = [[0], [0, 16], [0, 32], [0, 16, 32], [0, 64], [0], [0, 32, 64], [0]]

// Collision register k: bit 7 set when (mask & CXA[k]) == CXA[k], bit 6 for CXB[k]. -1 = unused.
const CXA = Int32Array.of(M0 | P1, M1 | P0, P0 | PF, P1 | PF, M0 | PF, M1 | PF, BL | PF, P0 | P1)
const CXB = Int32Array.of(M0 | P0, M1 | P1, P0 | BL, P1 | BL, M0 | BL, M1 | BL, -1, M0 | M1)

export class TIA {
  regs = new Uint8Array(0x40)
  /** INPT4/INPT5: joystick fire buttons, bit 7 = 0 when pressed. */
  inpt4 = 0x80
  inpt5 = 0x80

  /** Every scanline of the current frame, 160 px each, ABGR packed. */
  frame = new Uint32Array(SCREEN_W * MAX_LINES).fill(BLACK)
  /** Colour clock within the line, 0..227. */
  clock = 0
  scanline = 0
  vsync = false
  vblank = false
  /** Set by a WSYNC write; the console clears it after stalling the CPU to end of line. */
  wsync = false
  /** Set when a frame finished (VSYNC released, or 312 lines without sync). */
  frameReady = false
  /** First scanline shown on screen; auto-detected from where VBLANK first turns off. */
  displayStart = 37
  /** Visible height in scanlines (min SCREEN_H); auto-detected from where VBLANK turns on again. */
  displayHeight = SCREEN_H
  /** When true, writes are queued until flushWrites() so the console can apply them at the right clock. */
  defer = false

  /** Screen x (0..159) of P0, P1, M0, M1, BL. */
  readonly pos = new Int32Array(5)
  /** Collision latches CXM0P..CXPPMM (index 0..7). */
  readonly cx = new Uint8Array(8)

  readonly sound = new TiaAudio()
  private audioBuf = new Float32Array(2048)
  private audioLen = 0

  private grp = new Uint8Array(2)
  private oldGrp = new Uint8Array(2)
  private oldEnabl = 0
  private hmoveBlank = false
  private picStart = -1
  private picEnd = -1
  private candStart = -1
  private candHeight = 0
  private pf = new Uint8Array(40)
  private pendReg = new Uint8Array(4)
  private pendVal = new Uint8Array(4)
  private pendCount = 0

  /** reg is 4-bit (A0-A3). */
  read(reg: number): number {
    reg &= 0xf
    if (reg < 8) return this.cx[reg]
    switch (reg) {
      case 0xc: return this.inpt4
      case 0xd: return this.inpt5
      default: return 0 // paddle inputs
    }
  }

  /** reg is 6-bit (A0-A5). */
  write(reg: number, value: number): void {
    reg &= 0x3f
    value &= 0xff
    if (this.defer && this.pendCount < this.pendReg.length) {
      this.pendReg[this.pendCount] = reg
      this.pendVal[this.pendCount] = value
      this.pendCount++
    } else {
      this.apply(reg, value)
    }
  }

  flushWrites(): void {
    for (let k = 0; k < this.pendCount; k++) this.apply(this.pendReg[k], this.pendVal[k])
    this.pendCount = 0
  }

  private apply(reg: number, v: number): void {
    const prev = this.regs[reg]
    this.regs[reg] = v
    switch (reg) {
      case VSYNC: {
        const on = (v & 2) !== 0
        if (this.vsync && !on) this.finishFrame()
        this.vsync = on
        break
      }
      case VBLANK:
        this.vblank = (v & 2) !== 0
        break
      case WSYNC:
        this.wsync = true
        break
      case PF0:
      case PF1:
      case PF2:
      case CTRLPF:
        this.rebuildPlayfield()
        break

      // Position strobes: object appears a few clocks after the strobe; in HBLANK it lands at a fixed spot.
      case RESP0: this.pos[0] = this.strobePos(5, 3); break
      case RESP1: this.pos[1] = this.strobePos(5, 3); break
      case RESM0: this.pos[2] = this.strobePos(4, 2); break
      case RESM1: this.pos[3] = this.strobePos(4, 2); break
      case RESBL: this.pos[4] = this.strobePos(4, 2); break

      // Audio: AUDC0/1, AUDF0/1, AUDV0/1
      case 0x15: case 0x16: case 0x17: case 0x18: case 0x19: case 0x1a:
        this.sound.write(reg, v)
        break

      // Graphics with vertical delay latches
      case GRP0:
        this.grp[0] = v
        this.oldGrp[1] = this.grp[1]
        break
      case GRP1:
        this.grp[1] = v
        this.oldGrp[0] = this.grp[0]
        this.oldEnabl = this.regs[ENABL]
        break

      // Releasing RESMPx drops the missile at the player's centre
      case RESMP0:
      case RESMP1:
        if ((prev & 2) !== 0 && (v & 2) === 0) {
          const p = reg - RESMP0
          const mode = this.regs[NUSIZ0 + p] & 7
          const off = mode === 5 ? 6 : mode === 7 ? 10 : 3
          this.pos[OBJ_M0 + p] = (this.pos[OBJ_P0 + p] + off) % 160
        }
        break

      case HMOVE:
        for (let k = 0; k < 5; k++) this.pos[k] = (this.pos[k] - this.hm(k) + 160) % 160
        if (this.clock < HBLANK_CLOCKS) this.hmoveBlank = true // "comb": first 8 pixels blanked
        break
      case HMCLR:
        this.regs.fill(0, HMP0, HMP0 + 5)
        break
      case CXCLR:
        this.cx.fill(0)
        break
    }
  }

  private strobePos(delay: number, hblankPos: number): number {
    const x = this.clock - HBLANK_CLOCKS
    return x < 0 ? hblankPos : (x + delay) % 160
  }

  /** Signed horizontal motion for object k (+ = left). */
  private hm(k: number): number {
    const n = this.regs[HMP0 + k] >> 4
    return n >= 8 ? n - 16 : n
  }

  private rebuildPlayfield(): void {
    const pf0 = this.regs[PF0]
    const pf1 = this.regs[PF1]
    const pf2 = this.regs[PF2]
    const reflect = (this.regs[CTRLPF] & 1) !== 0
    const pf = this.pf
    for (let k = 0; k < 4; k++) pf[k] = (pf0 >> (4 + k)) & 1
    for (let k = 0; k < 8; k++) pf[4 + k] = (pf1 >> (7 - k)) & 1
    for (let k = 0; k < 8; k++) pf[12 + k] = (pf2 >> k) & 1
    for (let k = 0; k < 20; k++) pf[20 + k] = reflect ? pf[19 - k] : pf[k]
  }

  private finishFrame(): void {
    if (this.picStart >= 0) {
      const h = Math.min(Math.max(this.picEnd - this.picStart + 1, SCREEN_H), MAX_LINES - this.picStart)
      // Only move the window once the same geometry shows up on two frames in a row (no flicker).
      if (this.picStart === this.candStart && h === this.candHeight) {
        this.displayStart = this.picStart
        this.displayHeight = h
      }
      this.candStart = this.picStart
      this.candHeight = h
    }
    this.picStart = -1
    this.picEnd = -1
    this.scanline = 0
    this.frameReady = true
  }

  // ---- per-pixel object evaluation ----

  private playerOn(i: number, x: number): boolean {
    const r = this.regs
    const delayed = (r[VDELP0 + i] & 1) !== 0
    const gfx = delayed ? this.oldGrp[i] : this.grp[i]
    if (gfx === 0) return false
    const mode = r[NUSIZ0 + i] & 7
    const scale = mode === 5 ? 2 : mode === 7 ? 4 : 1
    const width = 8 * scale
    const refl = (r[REFP0 + i] & 8) !== 0
    const rel = x - this.pos[i]
    const copies = COPIES[mode]
    for (let c = 0; c < copies.length; c++) {
      const d = (rel - copies[c] + 320) % 160
      if (d < width) {
        const bit = (d / scale) | 0
        return ((refl ? gfx >> bit : gfx >> (7 - bit)) & 1) === 1
      }
    }
    return false
  }

  private missileOn(i: number, x: number): boolean {
    const r = this.regs
    if ((r[ENAM0 + i] & 2) === 0 || (r[RESMP0 + i] & 2) !== 0) return false
    const width = 1 << ((r[NUSIZ0 + i] >> 4) & 3)
    return (x - this.pos[OBJ_M0 + i] + 160) % 160 < width
  }

  private ballOn(x: number): boolean {
    const r = this.regs
    const en = (r[VDELBL] & 1) !== 0 ? this.oldEnabl : r[ENABL]
    if ((en & 2) === 0) return false
    const width = 1 << ((r[CTRLPF] >> 4) & 3)
    return (x - this.pos[OBJ_BL] + 160) % 160 < width
  }

  private objects(x: number): number {
    let m = 0
    if (this.pf[x >> 2]) m |= PF
    if (this.playerOn(0, x)) m |= P0
    if (this.playerOn(1, x)) m |= P1
    if (this.missileOn(0, x)) m |= M0
    if (this.missileOn(1, x)) m |= M1
    if (this.ballOn(x)) m |= BL
    return m
  }

  private collide(m: number): void {
    if ((m & (m - 1)) === 0) return // fewer than two objects
    for (let k = 0; k < 8; k++) {
      if ((m & CXA[k]) === CXA[k]) this.cx[k] |= 0x80
      if ((m & CXB[k]) === CXB[k]) this.cx[k] |= 0x40
    }
  }

  private pfColour(x: number): number {
    const r = this.regs
    if (r[CTRLPF] & 2) return r[x < 80 ? COLUP0 : COLUP1] // score mode
    return r[COLUPF]
  }

  private colour(m: number, x: number): number {
    const r = this.regs
    if (r[CTRLPF] & 4) {
      // playfield + ball in front of players
      if (m & PF) return this.pfColour(x)
      if (m & BL) return r[COLUPF]
      if (m & (P0 | M0)) return r[COLUP0]
      if (m & (P1 | M1)) return r[COLUP1]
    } else {
      if (m & (P0 | M0)) return r[COLUP0]
      if (m & (P1 | M1)) return r[COLUP1]
      if (m & PF) return this.pfColour(x)
      if (m & BL) return r[COLUPF]
    }
    return r[COLUBK]
  }

  /** Advance the beam by n colour clocks, drawing as it goes. */
  advance(n: number): void {
    while (n-- > 0) {
      if (this.clock === 9 || this.clock === 123) this.audioTick() // 2 audio clocks per line
      const x = this.clock - HBLANK_CLOCKS
      if (x >= 0) {
        const m = this.objects(x)
        this.collide(m)
        let c = BLACK
        if (!this.vblank) {
          if (this.picStart < 0) this.picStart = this.scanline
          this.picEnd = this.scanline
          if (!(this.hmoveBlank && x < 8)) c = PALETTE[this.colour(m, x) >> 1]
        }
        this.frame[this.scanline * SCREEN_W + x] = c
      }
      if (++this.clock === CLOCKS_PER_LINE) {
        this.clock = 0
        this.hmoveBlank = false
        if (++this.scanline >= MAX_LINES) this.finishFrame() // no sync: roll the picture
      }
    }
  }

  private audioTick(): void {
    const s = this.sound.tick()
    if (this.audioLen < this.audioBuf.length) this.audioBuf[this.audioLen++] = s
  }

  /** Samples (TIA_AUDIO_RATE Hz, 0..1) produced since the last call. */
  drainAudio(): Float32Array {
    const out = this.audioBuf.slice(0, this.audioLen)
    this.audioLen = 0
    return out
  }

  /** Copy the visible window (160 x displayHeight) into dest (Uint32 view of ImageData). */
  blit(dest: Uint32Array): void {
    const start = Math.min(this.displayStart, MAX_LINES - this.displayHeight)
    const n = Math.min(dest.length, this.displayHeight * SCREEN_W)
    dest.set(this.frame.subarray(start * SCREEN_W, start * SCREEN_W + n))
  }
}
