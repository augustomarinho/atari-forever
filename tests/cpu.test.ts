import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CPU6507, type Bus } from '../src/core/cpu6507'

class FlatBus implements Bus {
  mem = new Uint8Array(0x10000)
  read(a: number) { return this.mem[a] }
  write(a: number, v: number) { this.mem[a] = v }
}

function make(program: number[], org = 0x0200) {
  const bus = new FlatBus()
  bus.mem.set(program, org)
  const cpu = new CPU6507(bus, 0xffff)
  cpu.pc = org
  return { bus, cpu }
}

describe('CPU basics', () => {
  it('LDA imm sets flags, 2 cycles', () => {
    const { cpu } = make([0xa9, 0x80])
    expect(cpu.step()).toBe(2)
    expect(cpu.a).toBe(0x80)
    expect(cpu.n).toBe(1)
    expect(cpu.z).toBe(0)
  })

  it('LDA abs,X adds a cycle on page cross', () => {
    const { cpu } = make([0xa2, 0x01, 0xbd, 0xff, 0x10])
    cpu.step()
    expect(cpu.step()).toBe(5)
  })

  it('taken branch across page costs 4', () => {
    const { cpu } = make([0xd0, 0x7f], 0x02f0) // BNE, z=0 -> taken, crosses to 0x0371
    expect(cpu.step()).toBe(4)
    expect(cpu.pc).toBe(0x0371)
  })

  it('JSR/RTS roundtrip', () => {
    const { cpu } = make([0x20, 0x10, 0x02, 0xea])
    // RTS at 0x0210
    ;(cpu as unknown as { bus: FlatBus }).bus.mem[0x0210] = 0x60
    expect(cpu.step()).toBe(6)
    expect(cpu.pc).toBe(0x0210)
    expect(cpu.step()).toBe(6)
    expect(cpu.pc).toBe(0x0203)
  })

  it('decimal ADC 0x15 + 0x27 = 0x42', () => {
    const { cpu } = make([0xf8, 0x18, 0xa9, 0x15, 0x69, 0x27])
    for (let k = 0; k < 4; k++) cpu.step()
    expect(cpu.a).toBe(0x42)
  })
})

describe('Klaus Dormann 6502 functional test', () => {
  it('reaches success trap at $3469', { timeout: 120_000 }, () => {
    const bus = new FlatBus()
    bus.mem.set(readFileSync(new URL('./fixtures/dormann/6502_functional_test.bin', import.meta.url)))
    const cpu = new CPU6507(bus, 0xffff)
    cpu.pc = 0x0400
    let last = -1
    let guard = 0
    while (guard++ < 200_000_000) {
      const pc = cpu.pc
      cpu.step()
      if (cpu.pc === pc) { last = pc; break } // jmp * trap
    }
    expect(last.toString(16)).toBe('3469')
  })
})
