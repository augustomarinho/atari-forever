import { describe, it, expect } from 'vitest'
import { Atari2600 } from '../src/core/console'
import { PALETTE } from '../src/core/palette'
import { BLACK, SCREEN_H, SCREEN_W } from '../src/core/tia'

// Hand-assembled NTSC kernel: 3 VSYNC, 37 VBLANK, 192 lines (COLUBK = line counter), 30 overscan.
// Playfield: PF0=$F0 PF1=$AA PF2=$55, COLUPF=$1E.
const PROGRAM = [
  0x78, 0xd8, 0xa2, 0xff, 0x9a, //                 SEI CLD LDX #$FF TXS
  0xa9, 0x02, 0x85, 0x01, 0x85, 0x00, //          Frame: LDA #2 STA VBLANK STA VSYNC
  0x85, 0x02, 0x85, 0x02, 0x85, 0x02, //          STA WSYNC x3
  0xa9, 0x00, 0x85, 0x00, //                      LDA #0 STA VSYNC
  0xa2, 0x25, //                                  LDX #37
  0x85, 0x02, 0xca, 0xd0, 0xfb, //                vb: STA WSYNC DEX BNE vb
  0x85, 0x01, //                                  STA VBLANK (picture on)
  0xa9, 0xf0, 0x85, 0x0d, //                      PF0
  0xa9, 0xaa, 0x85, 0x0e, //                      PF1
  0xa9, 0x55, 0x85, 0x0f, //                      PF2
  0xa9, 0x1e, 0x85, 0x08, //                      COLUPF
  0xa2, 0xc0, //                                  LDX #192
  0x86, 0x09, 0x85, 0x02, 0xca, 0xd0, 0xf9, //    loop: STX COLUBK STA WSYNC DEX BNE loop
  0xa9, 0x02, 0x85, 0x01, //                      LDA #2 STA VBLANK
  0xa2, 0x1e, //                                  LDX #30
  0x85, 0x02, 0xca, 0xd0, 0xfb, //                os: STA WSYNC DEX BNE os
  0x4c, 0x05, 0x10, //                            JMP Frame
]

function boot(): Atari2600 {
  const rom = new Uint8Array(4096)
  rom.set(PROGRAM, 0)
  rom[0xffc] = 0x00
  rom[0xffd] = 0x10
  return new Atari2600(rom)
}

const row = (sys: Atari2600) => {
  const buf = new Uint32Array(SCREEN_W * SCREEN_H)
  sys.tia.blit(buf)
  return (r: number, x: number) => buf[r * SCREEN_W + x]
}

describe('palette', () => {
  it('hue 0 is greyscale, lum 0 is black, lum 7 is bright', () => {
    expect(PALETTE[0]).toBe(BLACK)
    const w = PALETTE[7]
    const r = w & 0xff
    expect(((w >> 8) & 0xff)).toBe(r)
    expect(((w >> 16) & 0xff)).toBe(r)
    expect(r).toBeGreaterThan(240)
  })
})

describe('TIA frame', () => {
  it('produces exactly 262 lines (19912 CPU cycles) per frame once synced', () => {
    const sys = boot()
    sys.runFrame()
    sys.runFrame()
    const c0 = sys.cpu.cycles
    sys.runFrame()
    expect(sys.cpu.cycles - c0).toBe(262 * 76)
  })

  it('auto-detects picture start and draws background per line', () => {
    const sys = boot()
    sys.runFrame()
    sys.runFrame()
    expect(sys.tia.displayStart).toBe(37)
    const px = row(sys)
    // line r has COLUBK = 192 - r; x=20 is a playfield-off pixel
    expect(px(10, 20)).toBe(PALETTE[(192 - 10) >> 1])
    expect(px(100, 20)).toBe(PALETTE[(192 - 100) >> 1])
  })

  it('draws playfield bits from PF0/PF1/PF2', () => {
    const sys = boot()
    sys.runFrame()
    sys.runFrame()
    const px = row(sys)
    const pf = PALETTE[0x1e >> 1]
    const bk = PALETTE[(192 - 10) >> 1]
    expect(px(10, 0)).toBe(pf) // PF0 bit 4
    expect(px(10, 15)).toBe(pf) // PF0 bit 7
    expect(px(10, 16)).toBe(pf) // PF1 bit 7
    expect(px(10, 20)).toBe(bk) // PF1 bit 6
    expect(px(10, 48)).toBe(pf) // PF2 bit 0
    expect(px(10, 52)).toBe(bk) // PF2 bit 1
    expect(px(10, 80)).toBe(pf) // right half repeats left
  })

  it('reflects playfield when CTRLPF bit 0 set', () => {
    const sys = boot()
    sys.tia.defer = false
    sys.tia.write(0x0a, 1)
    sys.tia.defer = true
    sys.runFrame()
    sys.runFrame()
    const px = row(sys)
    expect(px(10, 159)).toBe(PALETTE[0x1e >> 1])
    expect(px(10, 80)).toBe(PALETTE[(192 - 10) >> 1])
  })

  it('is black during VBLANK', () => {
    const sys = boot()
    sys.runFrame()
    sys.runFrame()
    expect(sys.tia.frame[10 * SCREEN_W + 100]).toBe(BLACK)
  })

  it('rolls over after 312 lines when ROM never syncs', () => {
    // JMP * : never touches TIA
    const rom = new Uint8Array(4096)
    rom.set([0x4c, 0x00, 0x10])
    rom[0xffc] = 0x00
    rom[0xffd] = 0x10
    const sys = new Atari2600(rom)
    sys.runFrame()
    expect(sys.tia.frameReady).toBe(true)
  })
})
