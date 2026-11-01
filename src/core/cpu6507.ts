// MOS 6507 (6502 core, 13-bit address bus). Legal opcodes only; illegal opcodes act as 2-cycle NOP.

export interface Bus {
  read(addr: number): number
  write(addr: number, value: number): void
}

const IMP = 0, ACC = 1, IMM = 2, ZP = 3, ZPX = 4, ZPY = 5, ABS = 6, ABX = 7, ABY = 8, IND = 9, IZX = 10, IZY = 11, REL = 12

type Exec = (cpu: CPU6507, addr: number) => void
interface Op {
  exec: Exec
  mode: number
  cycles: number
  pen: boolean // +1 cycle on page cross
}

const table: Op[] = new Array(256)
const def = (code: number, exec: Exec, mode: number, cycles: number, pen = false) => {
  table[code] = { exec, mode, cycles, pen }
}

export class CPU6507 {
  a = 0
  x = 0
  y = 0
  sp = 0xfd
  pc = 0
  c = 0
  z = 0
  i = 1
  d = 0
  v = 0
  n = 0
  cycles = 0
  /** Extra cycles added by the executing instruction (branches). */
  extra = 0

  constructor(
    private bus: Bus,
    private mask = 0x1fff,
  ) {}

  reset(): void {
    this.sp = 0xfd
    this.i = 1
    this.pc = this.read16(0xfffc)
  }

  read(addr: number): number {
    return this.bus.read(addr & this.mask)
  }
  write(addr: number, value: number): void {
    this.bus.write(addr & this.mask, value & 0xff)
  }
  read16(addr: number): number {
    return this.read(addr) | (this.read((addr + 1) & 0xffff) << 8)
  }
  private fetch(): number {
    const v = this.read(this.pc)
    this.pc = (this.pc + 1) & 0xffff
    return v
  }
  private fetch16(): number {
    const lo = this.fetch()
    return lo | (this.fetch() << 8)
  }

  push(v: number): void {
    this.write(0x100 | this.sp, v)
    this.sp = (this.sp - 1) & 0xff
  }
  pull(): number {
    this.sp = (this.sp + 1) & 0xff
    return this.read(0x100 | this.sp)
  }

  setNZ(v: number): void {
    this.z = v === 0 ? 1 : 0
    this.n = (v >> 7) & 1
  }

  getP(brk: boolean): number {
    return (this.n << 7) | (this.v << 6) | 0x20 | (brk ? 0x10 : 0) | (this.d << 3) | (this.i << 2) | (this.z << 1) | this.c
  }
  setP(p: number): void {
    this.n = (p >> 7) & 1
    this.v = (p >> 6) & 1
    this.d = (p >> 3) & 1
    this.i = (p >> 2) & 1
    this.z = (p >> 1) & 1
    this.c = p & 1
  }

  adc(v: number): void {
    const a = this.a
    const c = this.c
    const sum = a + v + c
    if (!this.d) {
      this.v = (~(a ^ v) & (a ^ sum) & 0x80) !== 0 ? 1 : 0
      this.c = sum > 0xff ? 1 : 0
      this.a = sum & 0xff
      this.setNZ(this.a)
      return
    }
    // NMOS decimal mode: Z from binary result, N/V from intermediate.
    let al = (a & 0xf) + (v & 0xf) + c
    if (al >= 0x0a) al = ((al + 6) & 0x0f) + 0x10
    let s = (a & 0xf0) + (v & 0xf0) + al
    this.z = (sum & 0xff) === 0 ? 1 : 0
    this.n = (s >> 7) & 1
    this.v = (~(a ^ v) & (a ^ s) & 0x80) !== 0 ? 1 : 0
    if (s >= 0xa0) s += 0x60
    this.c = s >= 0x100 ? 1 : 0
    this.a = s & 0xff
  }

  sbc(v: number): void {
    const a = this.a
    const c = this.c
    const bin = a + (v ^ 0xff) + c
    this.v = ((a ^ v) & (a ^ bin) & 0x80) !== 0 ? 1 : 0
    this.c = bin > 0xff ? 1 : 0
    this.setNZ(bin & 0xff) // flags always from binary result on NMOS
    if (!this.d) {
      this.a = bin & 0xff
      return
    }
    let al = (a & 0xf) - (v & 0xf) + c - 1
    if (al < 0) al = ((al - 6) & 0x0f) - 0x10
    let s = (a & 0xf0) - (v & 0xf0) + al
    if (s < 0) s -= 0x60
    this.a = s & 0xff
  }

  compare(reg: number, v: number): void {
    this.c = reg >= v ? 1 : 0
    this.setNZ((reg - v) & 0xff)
  }

  /** Execute one instruction. Returns CPU cycles consumed. */
  step(): number {
    const code = this.fetch()
    const op = table[code] ?? NOP_OP
    let addr = 0
    let crossed = false
    switch (op.mode) {
      case IMM:
        addr = this.pc
        this.pc = (this.pc + 1) & 0xffff
        break
      case ZP:
        addr = this.fetch()
        break
      case ZPX:
        addr = (this.fetch() + this.x) & 0xff
        break
      case ZPY:
        addr = (this.fetch() + this.y) & 0xff
        break
      case ABS:
        addr = this.fetch16()
        break
      case ABX: {
        const b = this.fetch16()
        addr = (b + this.x) & 0xffff
        crossed = ((b ^ addr) & 0xff00) !== 0
        break
      }
      case ABY: {
        const b = this.fetch16()
        addr = (b + this.y) & 0xffff
        crossed = ((b ^ addr) & 0xff00) !== 0
        break
      }
      case IND: {
        const p = this.fetch16()
        // NMOS bug: high byte fetched without page carry.
        addr = this.read(p) | (this.read((p & 0xff00) | ((p + 1) & 0xff)) << 8)
        break
      }
      case IZX: {
        const p = (this.fetch() + this.x) & 0xff
        addr = this.read(p) | (this.read((p + 1) & 0xff) << 8)
        break
      }
      case IZY: {
        const p = this.fetch()
        const b = this.read(p) | (this.read((p + 1) & 0xff) << 8)
        addr = (b + this.y) & 0xffff
        crossed = ((b ^ addr) & 0xff00) !== 0
        break
      }
      case REL: {
        const off = this.fetch()
        addr = (this.pc + (off < 0x80 ? off : off - 0x100)) & 0xffff
        break
      }
      default:
        break // IMP, ACC
    }
    this.extra = 0
    op.exec(this, addr)
    const n = op.cycles + (op.pen && crossed ? 1 : 0) + this.extra
    this.cycles += n
    return n
  }
}

const NOP_OP: Op = { exec: () => {}, mode: IMP, cycles: 2, pen: false }

// ---- ALU group: ORA/AND/EOR/ADC/LDA/CMP/SBC share mode layout ----
const ALU_MODES = [IMM, ZP, ZPX, ABS, ABX, ABY, IZX, IZY]
const ALU_CYC = [2, 3, 4, 4, 4, 4, 6, 5]
const ALU_OFF = [0x09, 0x05, 0x15, 0x0d, 0x1d, 0x19, 0x01, 0x11]
function alu(base: number, exec: Exec) {
  for (let k = 0; k < ALU_OFF.length; k++) {
    def(base + ALU_OFF[k], exec, ALU_MODES[k], ALU_CYC[k], k === 4 || k === 5 || k === 7)
  }
}
alu(0x00, (c, a) => { c.a |= c.read(a); c.setNZ(c.a) }) // ORA
alu(0x20, (c, a) => { c.a &= c.read(a); c.setNZ(c.a) }) // AND
alu(0x40, (c, a) => { c.a ^= c.read(a); c.setNZ(c.a) }) // EOR
alu(0x60, (c, a) => c.adc(c.read(a))) // ADC
alu(0xa0, (c, a) => { c.a = c.read(a); c.setNZ(c.a) }) // LDA
alu(0xc0, (c, a) => c.compare(c.a, c.read(a))) // CMP
alu(0xe0, (c, a) => c.sbc(c.read(a))) // SBC

// STA
const sta: Exec = (c, a) => c.write(a, c.a)
def(0x85, sta, ZP, 3); def(0x95, sta, ZPX, 4); def(0x8d, sta, ABS, 4)
def(0x9d, sta, ABX, 5); def(0x99, sta, ABY, 5); def(0x81, sta, IZX, 6); def(0x91, sta, IZY, 6)

// LDX / LDY / STX / STY / CPX / CPY
const ldx: Exec = (c, a) => { c.x = c.read(a); c.setNZ(c.x) }
def(0xa2, ldx, IMM, 2); def(0xa6, ldx, ZP, 3); def(0xb6, ldx, ZPY, 4); def(0xae, ldx, ABS, 4); def(0xbe, ldx, ABY, 4, true)
const ldy: Exec = (c, a) => { c.y = c.read(a); c.setNZ(c.y) }
def(0xa0, ldy, IMM, 2); def(0xa4, ldy, ZP, 3); def(0xb4, ldy, ZPX, 4); def(0xac, ldy, ABS, 4); def(0xbc, ldy, ABX, 4, true)
const stx: Exec = (c, a) => c.write(a, c.x)
def(0x86, stx, ZP, 3); def(0x96, stx, ZPY, 4); def(0x8e, stx, ABS, 4)
const sty: Exec = (c, a) => c.write(a, c.y)
def(0x84, sty, ZP, 3); def(0x94, sty, ZPX, 4); def(0x8c, sty, ABS, 4)
const cpx: Exec = (c, a) => c.compare(c.x, c.read(a))
def(0xe0, cpx, IMM, 2); def(0xe4, cpx, ZP, 3); def(0xec, cpx, ABS, 4)
const cpy: Exec = (c, a) => c.compare(c.y, c.read(a))
def(0xc0, cpy, IMM, 2); def(0xc4, cpy, ZP, 3); def(0xcc, cpy, ABS, 4)

// BIT
const bit: Exec = (c, a) => {
  const v = c.read(a)
  c.z = (c.a & v) === 0 ? 1 : 0
  c.n = (v >> 7) & 1
  c.v = (v >> 6) & 1
}
def(0x24, bit, ZP, 3); def(0x2c, bit, ABS, 4)

// Shifts / rotates: ASL(0x00) ROL(0x20) LSR(0x40) ROR(0x60)
type ShiftFn = (c: CPU6507, v: number) => number
function shift(base: number, f: ShiftFn) {
  const acc: Exec = (c) => { c.a = f(c, c.a) }
  const mem: Exec = (c, a) => c.write(a, f(c, c.read(a)))
  def(base + 0x0a, acc, ACC, 2)
  def(base + 0x06, mem, ZP, 5); def(base + 0x16, mem, ZPX, 6); def(base + 0x0e, mem, ABS, 6); def(base + 0x1e, mem, ABX, 7)
}
const nz = (c: CPU6507, r: number) => { c.setNZ(r); return r }
shift(0x00, (c, v) => { c.c = v >> 7; return nz(c, (v << 1) & 0xff) })
shift(0x20, (c, v) => { const r = ((v << 1) | c.c) & 0xff; c.c = v >> 7; return nz(c, r) })
shift(0x40, (c, v) => { c.c = v & 1; return nz(c, v >> 1) })
shift(0x60, (c, v) => { const r = (v >> 1) | (c.c << 7); c.c = v & 1; return nz(c, r) })

// INC / DEC
const inc: Exec = (c, a) => { const r = (c.read(a) + 1) & 0xff; c.write(a, r); c.setNZ(r) }
def(0xe6, inc, ZP, 5); def(0xf6, inc, ZPX, 6); def(0xee, inc, ABS, 6); def(0xfe, inc, ABX, 7)
const dec: Exec = (c, a) => { const r = (c.read(a) - 1) & 0xff; c.write(a, r); c.setNZ(r) }
def(0xc6, dec, ZP, 5); def(0xd6, dec, ZPX, 6); def(0xce, dec, ABS, 6); def(0xde, dec, ABX, 7)

// Register ops
def(0xe8, (c) => { c.x = (c.x + 1) & 0xff; c.setNZ(c.x) }, IMP, 2) // INX
def(0xc8, (c) => { c.y = (c.y + 1) & 0xff; c.setNZ(c.y) }, IMP, 2) // INY
def(0xca, (c) => { c.x = (c.x - 1) & 0xff; c.setNZ(c.x) }, IMP, 2) // DEX
def(0x88, (c) => { c.y = (c.y - 1) & 0xff; c.setNZ(c.y) }, IMP, 2) // DEY
def(0xaa, (c) => { c.x = c.a; c.setNZ(c.x) }, IMP, 2) // TAX
def(0xa8, (c) => { c.y = c.a; c.setNZ(c.y) }, IMP, 2) // TAY
def(0x8a, (c) => { c.a = c.x; c.setNZ(c.a) }, IMP, 2) // TXA
def(0x98, (c) => { c.a = c.y; c.setNZ(c.a) }, IMP, 2) // TYA
def(0xba, (c) => { c.x = c.sp; c.setNZ(c.x) }, IMP, 2) // TSX
def(0x9a, (c) => { c.sp = c.x }, IMP, 2) // TXS
def(0xea, () => {}, IMP, 2) // NOP

// Flags
def(0x18, (c) => { c.c = 0 }, IMP, 2); def(0x38, (c) => { c.c = 1 }, IMP, 2)
def(0x58, (c) => { c.i = 0 }, IMP, 2); def(0x78, (c) => { c.i = 1 }, IMP, 2)
def(0xb8, (c) => { c.v = 0 }, IMP, 2)
def(0xd8, (c) => { c.d = 0 }, IMP, 2); def(0xf8, (c) => { c.d = 1 }, IMP, 2)

// Stack
def(0x48, (c) => c.push(c.a), IMP, 3) // PHA
def(0x08, (c) => c.push(c.getP(true)), IMP, 3) // PHP
def(0x68, (c) => { c.a = c.pull(); c.setNZ(c.a) }, IMP, 4) // PLA
def(0x28, (c) => c.setP(c.pull()), IMP, 4) // PLP

// Branches
function branch(code: number, cond: (c: CPU6507) => boolean) {
  def(code, (c, a) => {
    if (cond(c)) {
      c.extra += 1 + (((c.pc ^ a) & 0xff00) !== 0 ? 1 : 0)
      c.pc = a
    }
  }, REL, 2)
}
branch(0x10, (c) => c.n === 0); branch(0x30, (c) => c.n === 1)
branch(0x50, (c) => c.v === 0); branch(0x70, (c) => c.v === 1)
branch(0x90, (c) => c.c === 0); branch(0xb0, (c) => c.c === 1)
branch(0xd0, (c) => c.z === 0); branch(0xf0, (c) => c.z === 1)

// Jumps / subroutines / interrupts
def(0x4c, (c, a) => { c.pc = a }, ABS, 3) // JMP abs
def(0x6c, (c, a) => { c.pc = a }, IND, 5) // JMP ind
def(0x20, (c, a) => { // JSR
  const r = (c.pc - 1) & 0xffff
  c.push(r >> 8)
  c.push(r & 0xff)
  c.pc = a
}, ABS, 6)
def(0x60, (c) => { // RTS
  const lo = c.pull()
  c.pc = (lo | (c.pull() << 8)) + 1 & 0xffff
}, IMP, 6)
def(0x40, (c) => { // RTI
  c.setP(c.pull())
  const lo = c.pull()
  c.pc = lo | (c.pull() << 8)
}, IMP, 6)
def(0x00, (c) => { // BRK
  const r = (c.pc + 1) & 0xffff
  c.push(r >> 8)
  c.push(r & 0xff)
  c.push(c.getP(true))
  c.i = 1
  c.pc = c.read16(0xfffe)
}, IMP, 7)
