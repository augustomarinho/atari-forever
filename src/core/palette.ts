// Approximate NTSC TIA palette generated through YIQ. Index = colour byte >> 1 (hue*8 + lum).
// Not a calibrated match to real hardware; swap in a measured table later if desired.

const clamp = (v: number) => Math.max(0, Math.min(1, v))

export function buildNtscPalette(): Uint32Array {
  const pal = new Uint32Array(128)
  for (let hue = 0; hue < 16; hue++) {
    for (let lum = 0; lum < 8; lum++) {
      let y = lum / 7
      let i = 0
      let q = 0
      if (hue > 0) {
        y = 0.12 + 0.78 * y
        const angle = ((325 + (hue - 1) * 24) * Math.PI) / 180
        const sat = 0.28
        i = sat * Math.cos(angle)
        q = sat * Math.sin(angle)
      }
      const r = Math.round(clamp(y + 0.956 * i + 0.621 * q) * 255)
      const g = Math.round(clamp(y - 0.272 * i - 0.647 * q) * 255)
      const b = Math.round(clamp(y - 1.106 * i + 1.703 * q) * 255)
      // ImageData is RGBA bytes; as little-endian Uint32 that is 0xAABBGGRR.
      pal[hue * 8 + lum] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
    }
  }
  return pal
}

export const PALETTE = buildNtscPalette()
