import { describe, it, expect } from 'vitest'
import { Atari2600, defaultControls } from '../src/core/console'

const sys = () => {
  const rom = new Uint8Array(4096)
  rom[0xffc] = 0x00
  rom[0xffd] = 0x10
  return new Atari2600(rom)
}

describe('setControls', () => {
  it('idle: all pins high, fire released', () => {
    const s = sys()
    s.setControls(defaultControls())
    expect(s.bus.read(0x280)).toBe(0xff)
    expect(s.bus.read(0x282)).toBe(0xff)
    expect(s.bus.read(0x0c)).toBe(0x80) // INPT4
  })

  it('joystick directions clear SWCHA bits 7..4', () => {
    const s = sys()
    s.setControls({ ...defaultControls(), right: true })
    expect(s.bus.read(0x280)).toBe(0x7f)
    s.setControls({ ...defaultControls(), left: true })
    expect(s.bus.read(0x280)).toBe(0xbf)
    s.setControls({ ...defaultControls(), down: true })
    expect(s.bus.read(0x280)).toBe(0xdf)
    s.setControls({ ...defaultControls(), up: true })
    expect(s.bus.read(0x280)).toBe(0xef)
  })

  it('fire pulls INPT4 bit 7 low', () => {
    const s = sys()
    s.setControls({ ...defaultControls(), fire: true })
    expect(s.bus.read(0x0c) & 0x80).toBe(0)
  })

  it('console switches map to SWCHB', () => {
    const s = sys()
    s.setControls({ ...defaultControls(), reset: true })
    expect(s.bus.read(0x282) & 1).toBe(0)
    s.setControls({ ...defaultControls(), select: true })
    expect(s.bus.read(0x282) & 2).toBe(0)
    s.setControls({ ...defaultControls(), color: false })
    expect(s.bus.read(0x282) & 8).toBe(0)
    s.setControls({ ...defaultControls(), difficultyA: false })
    expect(s.bus.read(0x282) & 0x40).toBe(0)
  })
})
