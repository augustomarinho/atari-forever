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

export function createCartridge(rom: Uint8Array): Cartridge {
  switch (rom.length) {
    case 2048: return new Rom2K(rom)
    case 4096: return new Rom4K(rom)
    case 8192: return new Banked(rom, 2, 0xff8)
    case 16384: return new Banked(rom, 4, 0xff6)
    case 32768: return new Banked(rom, 8, 0xff4)
    default: throw new Error(`Unsupported ROM size: ${rom.length} bytes`)
  }
}
