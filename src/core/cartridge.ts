export interface Cartridge {
  /** addr is 12-bit (0x000-0xFFF) */
  read(addr: number): number
  write(addr: number, value: number): void
}

/** 2K ROM mirrored across the 4K window. */
class Rom2K implements Cartridge {
  constructor(private rom: Uint8Array) {}
  read(addr: number): number { return this.rom[addr & 0x7ff] }
  write(): void {}
}

/** Plain 4K ROM. */
class Rom4K implements Cartridge {
  constructor(private rom: Uint8Array) {}
  read(addr: number): number { return this.rom[addr & 0xfff] }
  write(): void {}
}

/** Standard Atari bank switching: F8 (8K), F6 (16K), F4 (32K). Hotspots trigger on read or write. */
class Banked implements Cartridge {
  private bank: number
  constructor(
    private rom: Uint8Array,
    private banks: number,
    private hotBase: number,
  ) {
    this.bank = banks - 1 // power-up bank is arbitrary on hardware; last bank holds the reset vector in most ROMs
  }
  private hot(addr: number): void {
    const k = addr - this.hotBase
    if (k >= 0 && k < this.banks) this.bank = k
  }
  read(addr: number): number {
    this.hot(addr)
    return this.rom[this.bank * 0x1000 + (addr & 0xfff)]
  }
  write(addr: number): void { this.hot(addr) }
}

/** Parker Brothers E0: three switchable 1K banks plus a fixed final 1K bank. */
class E0 implements Cartridge {
  private banks = [0, 1, 2]

  constructor(private rom: Uint8Array) {}

  private hot(addr: number): void {
    if (addr >= 0xfe0 && addr <= 0xfe7) this.banks[0] = addr & 7
    else if (addr >= 0xfe8 && addr <= 0xfef) this.banks[1] = addr & 7
    else if (addr >= 0xff0 && addr <= 0xff7) this.banks[2] = addr & 7
  }

  read(addr: number): number {
    this.hot(addr)
    const segment = addr >> 10
    const bank = segment === 3 ? 7 : this.banks[segment]
    return this.rom[bank * 0x400 + (addr & 0x3ff)]
  }

  write(addr: number, _value: number): void {
    this.hot(addr)
  }
}

const E0_HOTSPOT_OPCODES = new Set([
  0x0c, 0x0d, 0x0e, 0x1c, 0x1d, 0x1e, 0x2c, 0x2d, 0x2e, 0x3c, 0x3d, 0x3e,
  0x4c, 0x4d, 0x4e, 0x5c, 0x5d, 0x5e, 0x6c, 0x6d, 0x6e, 0x7c, 0x7d, 0x7e,
  0x8c, 0x8d, 0x8e, 0x9c, 0x9d, 0x99, 0xac, 0xad, 0xae, 0xbc, 0xbd, 0xb9,
  0xcc, 0xcd, 0xce, 0xdc, 0xdd, 0xde, 0xec, 0xed, 0xee, 0xfc, 0xfd, 0xfe,
])

/**
 * Eight-kilobyte ROMs can be F8 or Parker Brothers E0. E0 software accesses
 * one of its $FFE0-$FFF7 bank-selection hotspots; F8 has no reason to do so.
 */
function usesE0(rom: Uint8Array): boolean {
  for (let k = 0; k < rom.length - 2; k++) {
    if (E0_HOTSPOT_OPCODES.has(rom[k]) && rom[k + 1] >= 0xe0 && rom[k + 1] <= 0xf7 && rom[k + 2] === 0xff) return true
  }
  return false
}

export function createCartridge(rom: Uint8Array): Cartridge {
  switch (rom.length) {
    case 2048: return new Rom2K(rom)
    case 4096: return new Rom4K(rom)
    case 8192: return usesE0(rom) ? new E0(rom) : new Banked(rom, 2, 0xff8)
    case 16384: return new Banked(rom, 4, 0xff6)
    case 32768: return new Banked(rom, 8, 0xff4)
    default: throw new Error(`Unsupported ROM size: ${rom.length} bytes`)
  }
}
