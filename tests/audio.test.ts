import { describe, it, expect } from 'vitest'
import { DIV31, POLY4, POLY5, POLY9, TiaAudio, TIA_AUDIO_RATE } from '../src/core/audio'
import { TIA } from '../src/core/tia'

const ones = (a: Uint8Array) => a.reduce((s, v) => s + v, 0)
const AUDC0 = 0x15, AUDF0 = 0x17, AUDV0 = 0x19, AUDC1 = 0x16, AUDV1 = 0x1a

function run(a: TiaAudio, n: number): number[] {
  return Array.from({ length: n }, () => Math.round(a.tick() * 30))
}

describe('noise tables', () => {
  it('are maximal length with the right density', () => {
    expect(POLY4.length).toBe(15)
    expect(POLY5.length).toBe(31)
    expect(POLY9.length).toBe(511)
    expect(ones(POLY4)).toBe(8)
    expect(ones(POLY5)).toBe(16)
    expect(ones(POLY9)).toBe(256)
    expect(ones(DIV31)).toBe(18)
  })
})

describe('TiaAudio channels', () => {
  it('pure tone toggles every AUDF+1 ticks', () => {
    const a = new TiaAudio()
    a.write(AUDC0, 4)
    a.write(AUDV0, 15)
    a.write(AUDF0, 0)
    expect(run(a, 4)).toEqual([15, 0, 15, 0])
    const b = new TiaAudio()
    b.write(AUDC0, 4)
    b.write(AUDV0, 15)
    b.write(AUDF0, 1)
    expect(run(b, 6)).toEqual([15, 15, 0, 0, 15, 15])
  })

  it('AUDC 12 divides by 3', () => {
    const a = new TiaAudio()
    a.write(AUDC0, 12)
    a.write(AUDV0, 15)
    a.write(AUDF0, 0)
    // first tick fires immediately, then the level holds for 3 ticks per half-period
    expect(run(a, 7)).toEqual([15, 15, 15, 0, 0, 0, 15])
  })

  it('zero volume is silent; AUDC 0 is constant DC at the volume', () => {
    const a = new TiaAudio()
    a.write(AUDC0, 4)
    a.write(AUDV0, 0)
    expect(run(a, 4)).toEqual([0, 0, 0, 0])
    a.write(AUDC0, 0)
    a.write(AUDV0, 7)
    expect(run(a, 3)).toEqual([7, 7, 7])
  })

  it('mixes both channels', () => {
    const a = new TiaAudio()
    a.write(AUDC0, 0); a.write(AUDV0, 15)
    a.write(AUDC1, 0); a.write(AUDV1, 15)
    expect(a.tick()).toBeCloseTo(1)
  })

  it('noise modes produce both levels', () => {
    for (const c of [1, 2, 3, 6, 7, 8, 14, 15]) {
      const a = new TiaAudio()
      a.write(AUDC0, c)
      a.write(AUDV0, 15)
      a.write(AUDF0, 0)
      const s = new Set(run(a, 2000))
      expect(s.has(0), `audc ${c} has zeros`).toBe(true)
      expect(s.has(15), `audc ${c} has highs`).toBe(true)
    }
  })
})

describe('TIA audio output', () => {
  it('produces 2 samples per scanline, 524 per 262-line frame', () => {
    const t = new TIA()
    t.write(AUDC0, 4)
    t.write(AUDV0, 15)
    t.advance(228 * 262)
    const s = t.drainAudio()
    expect(s.length).toBe(524)
    expect(TIA_AUDIO_RATE).toBe(31440)
    expect(Math.max(...s)).toBeGreaterThan(0.4)
    expect(t.drainAudio().length).toBe(0)
  })

  it('register writes reach the channels', () => {
    const t = new TIA()
    t.write(0x15, 5)
    t.write(0x17, 9)
    t.write(0x19, 12)
    expect(t.sound.ch[0].audc).toBe(5)
    expect(t.sound.ch[0].audf).toBe(9)
    expect(t.sound.ch[0].audv).toBe(12)
  })
})
