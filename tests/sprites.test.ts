import { describe, it, expect } from 'vitest'
import { TIA, BLACK, SCREEN_W } from '../src/core/tia'
import { PALETTE } from '../src/core/palette'

const C_P0 = 0x1e
const C_P1 = 0x4e
const C_PF = 0x8e
const C_BK = 0x46
const col = (c: number) => PALETTE[c >> 1]

// Registers
const NUSIZ0 = 0x04, COLUP0 = 0x06, COLUP1 = 0x07, COLUPF = 0x08, COLUBK = 0x09, CTRLPF = 0x0a, REFP0 = 0x0b
const PF0 = 0x0d, RESP0 = 0x10, RESP1 = 0x11, RESM0 = 0x12, RESBL = 0x14
const GRP0 = 0x1b, GRP1 = 0x1c, ENAM0 = 0x1d, ENABL = 0x1f, HMP0 = 0x20, VDELP0 = 0x25, RESMP0 = 0x28
const HMOVE = 0x2a, CXCLR = 0x2c

function setup(): TIA {
  const t = new TIA()
  t.write(COLUP0, C_P0)
  t.write(COLUP1, C_P1)
  t.write(COLUPF, C_PF)
  t.write(COLUBK, C_BK)
  return t
}

/** Strobe a RES register as if the write happened at screen x (so the object lands at x + delay). */
function strobeAt(t: TIA, reg: number, screenX: number) {
  t.clock = 68 + screenX
  t.write(reg, 0)
}

function draw(t: TIA): (x: number) => number {
  t.clock = 0
  t.scanline = 0
  t.advance(228)
  return (x) => t.frame[x]
}

describe('players', () => {
  it('RESP0 places the sprite 5 pixels after the strobe', () => {
    const t = setup()
    strobeAt(t, RESP0, 20)
    t.write(GRP0, 0x80)
    const px = draw(t)
    expect(px(24)).toBe(col(C_BK))
    expect(px(25)).toBe(col(C_P0))
    expect(px(26)).toBe(col(C_BK))
  })

  it('strobe during HBLANK lands at x=3', () => {
    const t = setup()
    t.clock = 10
    t.write(RESP0, 0)
    t.write(GRP0, 0x80)
    expect(t.pos[0]).toBe(3)
  })

  it('draws MSB first, REFP0 reverses', () => {
    const t = setup()
    strobeAt(t, RESP0, 20)
    t.write(GRP0, 0xf0)
    let px = draw(t)
    expect([25, 28, 29].map((x) => px(x))).toEqual([col(C_P0), col(C_P0), col(C_BK)])
    t.write(REFP0, 8)
    px = draw(t)
    expect([28, 29, 32, 33].map((x) => px(x))).toEqual([col(C_BK), col(C_P0), col(C_P0), col(C_BK)])
  })

  it('NUSIZ copies and size', () => {
    const t = setup()
    strobeAt(t, RESP0, 20)
    t.write(GRP0, 0x80)
    t.write(NUSIZ0, 1) // two copies, 16 apart
    let px = draw(t)
    expect(px(25)).toBe(col(C_P0))
    expect(px(41)).toBe(col(C_P0))
    expect(px(33)).toBe(col(C_BK))
    t.write(NUSIZ0, 5) // double width
    px = draw(t)
    expect(px(25)).toBe(col(C_P0))
    expect(px(26)).toBe(col(C_P0))
    expect(px(27)).toBe(col(C_BK))
  })

  it('wraps around the right edge', () => {
    const t = setup()
    t.write(GRP0, 0xff)
    strobeAt(t, RESP0, 150) // pos 155 -> covers 155..159 and 0..2
    const px = draw(t)
    expect(px(159)).toBe(col(C_P0))
    expect(px(2)).toBe(col(C_P0))
    expect(px(3)).toBe(col(C_BK))
  })

  it('VDELP0 shows the old GRP0 until GRP1 is written', () => {
    const t = setup()
    strobeAt(t, RESP0, 20)
    t.write(GRP0, 0x80)
    t.write(VDELP0, 1)
    expect(draw(t)(25)).toBe(col(C_BK))
    t.write(GRP1, 0)
    expect(draw(t)(25)).toBe(col(C_P0))
  })
})

describe('HMOVE', () => {
  it('moves left by positive nibble and blanks the first 8 pixels', () => {
    const t = setup()
    strobeAt(t, RESP0, 20) // pos 25
    t.write(GRP0, 0x80)
    t.write(HMP0, 0x70)
    t.clock = 10
    t.write(HMOVE, 0)
    expect(t.pos[0]).toBe(18)
    const px = draw(t)
    expect(px(18)).toBe(col(C_P0))
    expect(px(3)).toBe(BLACK) // HMOVE comb
    expect(px(8)).toBe(col(C_BK))
  })

  it('negative nibble moves right', () => {
    const t = setup()
    strobeAt(t, RESP0, 20)
    t.write(HMP0, 0x80) // -8
    t.clock = 100
    t.write(HMOVE, 0)
    expect(t.pos[0]).toBe(33)
  })
})

describe('missile and ball', () => {
  it('missile width from NUSIZ and position 4 after strobe', () => {
    const t = setup()
    strobeAt(t, RESM0, 50)
    t.write(ENAM0, 2)
    t.write(NUSIZ0, 0x10) // width 2
    const px = draw(t)
    expect(px(53)).toBe(col(C_BK))
    expect(px(54)).toBe(col(C_P0))
    expect(px(55)).toBe(col(C_P0))
    expect(px(56)).toBe(col(C_BK))
  })

  it('RESMP0 hides the missile', () => {
    const t = setup()
    strobeAt(t, RESM0, 50)
    t.write(ENAM0, 2)
    t.write(RESMP0, 2)
    expect(draw(t)(54)).toBe(col(C_BK))
  })

  it('ball uses COLUPF and CTRLPF size', () => {
    const t = setup()
    strobeAt(t, RESBL, 30)
    t.write(ENABL, 2)
    t.write(CTRLPF, 0x20) // width 4
    const px = draw(t)
    expect(px(33)).toBe(col(C_BK))
    expect(px(34)).toBe(col(C_PF))
    expect(px(37)).toBe(col(C_PF))
    expect(px(38)).toBe(col(C_BK))
  })
})

describe('priority and collisions', () => {
  it('player over playfield by default, behind with CTRLPF bit 2', () => {
    const t = setup()
    t.write(PF0, 0x10) // pf pixels x=0..3
    t.write(GRP0, 0xff)
    t.clock = 10
    t.write(RESP0, 0) // pos 3 -> 3..10
    expect(draw(t)(3)).toBe(col(C_P0))
    t.write(CTRLPF, 4)
    expect(draw(t)(3)).toBe(col(C_PF))
  })

  it('latches P0/PF and P0/P1 collisions, CXCLR clears', () => {
    const t = setup()
    t.write(PF0, 0x10)
    t.write(GRP0, 0xff)
    t.write(GRP1, 0xff)
    t.clock = 10
    t.write(RESP0, 0)
    t.write(RESP1, 0)
    draw(t)
    expect(t.read(2) & 0x80).toBe(0x80) // CXP0FB: P0-PF
    expect(t.read(3) & 0x80).toBe(0x80) // CXP1FB: P1-PF
    expect(t.read(7) & 0x80).toBe(0x80) // CXPPMM: P0-P1
    expect(t.read(2) & 0x40).toBe(0) // no ball
    t.write(CXCLR, 0)
    expect(t.read(2)).toBe(0)
    expect(t.read(7)).toBe(0)
  })

  it('no collision between non-overlapping objects', () => {
    const t = setup()
    t.write(GRP0, 0x80)
    t.write(GRP1, 0x80)
    strobeAt(t, RESP0, 20)
    strobeAt(t, RESP1, 60)
    draw(t)
    expect(t.read(7)).toBe(0)
  })

  it('stride check: frame row stays 160 wide', () => {
    expect(SCREEN_W).toBe(160)
  })
})
