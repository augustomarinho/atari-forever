import { describe, it, expect } from 'vitest'
import { RIOT } from '../src/core/riot'
import { TIA } from '../src/core/tia'
import { AtariBus } from '../src/core/bus'
import { createCartridge } from '../src/core/cartridge'
import { Atari2600 } from '../src/core/console'

function rom4k(program: number[], at = 0, entry = 0x1000): Uint8Array {
  const rom = new Uint8Array(4096)
  rom.set(program, at)
  rom[0xffc] = entry & 0xff
  rom[0xffd] = entry >> 8
  return rom
}

describe('RIOT timer', () => {
  // Model: INTIM = floor((N*I - 1 - elapsed) / I). Reads N-1 right after the write, holds 0 for one full
  // interval, underflows to $FF after N*I cycles, then counts down every cycle. Verified against
  // real game frame timing (Enduro, Pitfall!, River Raid all come out at exactly 262 lines).
  it('TIM64T counts down every 64 cycles, holds 0 for an interval, then underflows', () => {
    let now = 100
    const riot = new RIOT(() => now)
    riot.write(0x296, 10)
    expect(riot.read(0x284)).toBe(9)
    now = 100 + 63
    expect(riot.read(0x284)).toBe(9)
    now = 100 + 64
    expect(riot.read(0x284)).toBe(8)
    now = 100 + 575
    expect(riot.read(0x284)).toBe(1)
    now = 100 + 576 // zero held for 64 cycles
    expect(riot.read(0x285)).toBe(0)
    expect(riot.read(0x284)).toBe(0)
    now = 100 + 639
    expect(riot.read(0x284)).toBe(0)
    now = 100 + 640 // underflow
    expect(riot.read(0x285)).toBe(0x80)
    expect(riot.read(0x284)).toBe(0xff)
    expect(riot.read(0x285)).toBe(0) // INTIM read clears the flag
    now = 100 + 645
    expect(riot.read(0x284)).toBe(0xfa) // then one step per cycle
  })

  it('TIM1T', () => {
    let now = 0
    const riot = new RIOT(() => now)
    riot.write(0x294, 5)
    expect(riot.read(0x284)).toBe(4)
    now = 4
    expect(riot.read(0x284)).toBe(0)
    now = 5
    expect(riot.read(0x284)).toBe(0xff)
    now = 6
    expect(riot.read(0x284)).toBe(0xfe)
  })

  it('intervals 8T and 1024T', () => {
    let now = 0
    const riot = new RIOT(() => now)
    riot.write(0x295, 4)
    now = 8
    expect(riot.read(0x284)).toBe(2)
    riot.write(0x297, 2) // restarts at now = 8
    now = 8 + 1000
    expect(riot.read(0x284)).toBe(1)
    now = 8 + 1024
    expect(riot.read(0x284)).toBe(0)
  })

  it('a poll loop waiting for INTIM == 0 always finds it (regression: Enduro frame jitter)', () => {
    // LDY INTIM / BNE loop is a 7-cycle loop; INTIM must read 0 for long enough to be seen.
    let now = 0
    const riot = new RIOT(() => now)
    riot.write(0x296, 25)
    let reads = 0
    while (riot.read(0x284) !== 0 && reads < 1000) {
      now += 7
      reads++
    }
    expect(reads).toBeLessThan(300)
    expect(now).toBeLessThan(25 * 64 + 7)
  })

  it('ports honour DDR', () => {
    const riot = new RIOT(() => 0)
    riot.swchaIn = 0xef
    expect(riot.read(0x280)).toBe(0xef)
    riot.write(0x281, 0xff)
    riot.write(0x280, 0x55)
    expect(riot.read(0x280)).toBe(0x55)
  })
})

describe('bus map', () => {
  const setup = () => {
    const tia = new TIA()
    const riot = new RIOT(() => 0)
    const rom = new Uint8Array(4096)
    rom[0] = 0x11
    rom[0x234] = 0x22
    const bus = new AtariBus(tia, riot, createCartridge(rom))
    return { tia, riot, bus }
  }

  it('RAM mirrors at $80 and $180', () => {
    const { bus } = setup()
    bus.write(0x80, 0x5a)
    expect(bus.read(0x180)).toBe(0x5a)
    expect(bus.read(0x80)).toBe(0x5a)
  })

  it('TIA writes mirror in 6 bits', () => {
    const { bus, tia } = setup()
    bus.write(0x49, 0x77) // mirror of COLUBK $09
    expect(tia.regs[0x09]).toBe(0x77)
  })

  it('cartridge mirrors via A12', () => {
    const { bus } = setup()
    expect(bus.read(0x1000)).toBe(0x11)
    expect(bus.read(0xf000)).toBe(0x11)
    expect(bus.read(0x1234)).toBe(0x22)
  })

  it('RIOT registers reachable at $280-$29F', () => {
    const { bus } = setup()
    expect(bus.read(0x282)).toBe(0xff) // SWCHB default
  })
})

describe('cartridge', () => {
  it('2K ROM mirrors', () => {
    const rom = new Uint8Array(2048)
    rom[5] = 0x99
    const cart = createCartridge(rom)
    expect(cart.read(0x005)).toBe(0x99)
    expect(cart.read(0x805)).toBe(0x99)
  })

  it('F8 bank switching via hotspots', () => {
    const rom = new Uint8Array(8192)
    rom[0] = 0xaa
    rom[4096] = 0xbb
    const cart = createCartridge(rom)
    expect(cart.read(0x000)).toBe(0xbb) // starts in last bank
    cart.read(0xff8)
    expect(cart.read(0x000)).toBe(0xaa)
    cart.write(0xff9, 0)
    expect(cart.read(0x000)).toBe(0xbb)
  })

  it('detects and switches Parker Brothers E0 ROMs', () => {
    const rom = new Uint8Array(8192)
    for (let bank = 0; bank < 8; bank++) rom[bank * 1024] = bank
    rom.set([0x8d, 0xf6, 0xff], 16) // STA $FFF6: the bank switch Popeye uses
    const cart = createCartridge(rom)

    expect(cart.read(0x000)).toBe(0)
    expect(cart.read(0x400)).toBe(1)
    expect(cart.read(0x800)).toBe(2)
    expect(cart.read(0xc00)).toBe(7)

    cart.write(0xfe6, 0)
    cart.read(0xfed)
    cart.write(0xff3, 0)
    expect(cart.read(0x000)).toBe(6)
    expect(cart.read(0x400)).toBe(5)
    expect(cart.read(0x800)).toBe(3)
    expect(cart.read(0xc00)).toBe(7)
  })

  it('F6 has four banks', () => {
    const rom = new Uint8Array(16384)
    for (let b = 0; b < 4; b++) rom[b * 4096] = b + 1
    const cart = createCartridge(rom)
    cart.read(0xff6)
    expect(cart.read(0)).toBe(1)
    cart.read(0xff8)
    expect(cart.read(0)).toBe(3)
  })

  it('rejects unknown sizes', () => {
    expect(() => createCartridge(new Uint8Array(1000))).toThrow(/Unsupported/)
  })
})

describe('Atari2600 integration', () => {
  it('boots from reset vector, uses RAM stack, JSR/RTS', () => {
    const program = new Uint8Array(0x20)
    program.set([
      0xa2, 0xff, //       LDX #$FF
      0x9a, //             TXS
      0xa9, 0x42, //       LDA #$42
      0x85, 0x80, //       STA $80
      0x20, 0x10, 0x10, // JSR $1010
      0x85, 0x81, //       STA $81
      0x4c, 0x0c, 0x10, // JMP $100C
    ])
    program.set([0xa9, 0x99, 0x60], 0x10) // LDA #$99 ; RTS
    const rom = rom4k(Array.from(program))
    const sys = new Atari2600(rom)
    expect(sys.cpu.pc).toBe(0x1000)
    for (let k = 0; k < 100; k++) {
      const pc = sys.cpu.pc
      sys.step()
      if (sys.cpu.pc === pc) break
    }
    expect(sys.riot.ram[0]).toBe(0x42)
    expect(sys.riot.ram[1]).toBe(0x99)
    expect(sys.cpu.pc).toBe(0x100c)
  })
})
