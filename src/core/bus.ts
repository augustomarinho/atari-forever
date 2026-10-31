import type { Bus } from './cpu6507'
import type { Cartridge } from './cartridge'
import type { RIOT } from './riot'
import type { TIA } from './tia'

/**
 * 6507 memory map (13-bit address):
 *   A12=1            -> cartridge
 *   A12=0, A7=0      -> TIA
 *   A12=0, A7=1, A9=0 -> RIOT RAM
 *   A12=0, A7=1, A9=1 -> RIOT I/O + timer
 */
export class AtariBus implements Bus {
  constructor(
    private tia: TIA,
    private riot: RIOT,
    private cart: Cartridge,
  ) {}

  read(addr: number): number {
    addr &= 0x1fff
    if (addr & 0x1000) return this.cart.read(addr & 0xfff)
    if ((addr & 0x80) === 0) return this.tia.read(addr & 0xf)
    if ((addr & 0x200) === 0) return this.riot.readRam(addr)
    return this.riot.read(addr)
  }

  write(addr: number, value: number): void {
    addr &= 0x1fff
    if (addr & 0x1000) return this.cart.write(addr & 0xfff, value)
    if ((addr & 0x80) === 0) return this.tia.write(addr & 0x3f, value)
    if ((addr & 0x200) === 0) return this.riot.writeRam(addr, value)
    this.riot.write(addr, value)
  }
}
