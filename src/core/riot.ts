// MOS 6532 RIOT: 128 bytes RAM, 2 I/O ports, interval timer.

const INTERVALS = [1, 8, 64, 1024]

export class RIOT {
  ram = new Uint8Array(128)

  /** External pin levels (what the joystick / console switches drive). 0 = pressed. */
  swchaIn = 0xff
  swchbIn = 0xff

  private outA = 0
  private ddrA = 0
  private outB = 0
  private ddrB = 0

  private value = 0xff
  private interval = 1024
  private start = 0
  private cleared = false

  /** clock returns the CPU cycle count at the current instruction's start. */
  constructor(private clock: () => number) {}

  // --- RAM ---
  readRam(addr: number): number { return this.ram[addr & 0x7f] }
  writeRam(addr: number, v: number): void { this.ram[addr & 0x7f] = v }

  // --- I/O + timer registers; addr is the full bus address (A2 selects timer vs ports) ---
  read(addr: number): number {
    if ((addr & 4) === 0) {
      switch (addr & 3) {
        case 0: return (this.outA & this.ddrA) | (this.swchaIn & ~this.ddrA & 0xff)
        case 1: return this.ddrA
        case 2: return (this.outB & this.ddrB) | (this.swchbIn & ~this.ddrB & 0xff)
        default: return this.ddrB
      }
    }
    return (addr & 1) === 0 ? this.readIntim() : this.readInstat()
  }

  write(addr: number, v: number): void {
    v &= 0xff
    if ((addr & 4) === 0) {
      switch (addr & 3) {
        case 0: this.outA = v; break
        case 1: this.ddrA = v; break
        case 2: this.outB = v; break
        default: this.ddrB = v
      }
      return
    }
    if (addr & 0x10) {
      this.value = v
      this.interval = INTERVALS[addr & 3]
      this.start = this.clock()
      this.cleared = false
    }
    // else: edge-detect control, not needed
  }

  /**
   * Timer position in cycles: >= 0 while counting (INTIM = floor(t / interval), so 0 is held for one
   * full interval); < 0 after underflow, where INTIM = t & 0xFF and counts down every cycle.
   */
  private timeLeft(): number {
    return this.value * this.interval - 1 - (this.clock() - this.start)
  }

  private readIntim(): number {
    const t = this.timeLeft()
    if (t >= 0) return Math.floor(t / this.interval)
    this.cleared = true
    return t & 0xff
  }

  private readInstat(): number {
    return this.timeLeft() < 0 && !this.cleared ? 0x80 : 0
  }
}
