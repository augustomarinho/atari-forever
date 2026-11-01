import { Atari2600 } from './core/console'
import { SCREEN_H, SCREEN_W } from './core/tia'
import { KeyboardInput } from './platform/input'
import { AudioOutput } from './platform/audio'

const canvas = document.getElementById('screen') as HTMLCanvasElement
const statusEl = document.getElementById('status') as HTMLDivElement
const input = document.getElementById('rom') as HTMLInputElement
const context = canvas.getContext('2d')
if (!context) throw new Error('2D canvas not supported')
const ctx: CanvasRenderingContext2D = context

let image = ctx.createImageData(SCREEN_W, SCREEN_H)
let pixels = new Uint32Array(image.data.buffer)
pixels.fill(0xff000000)
ctx.putImageData(image, 0, 0)

/** Games differ in visible height (e.g. Enduro ~233 lines); resize the canvas to match. */
function fitHeight(h: number) {
  if (image.height === h) return
  canvas.height = h
  image = ctx.createImageData(SCREEN_W, h)
  pixels = new Uint32Array(image.data.buffer)
}

let system: Atari2600 | null = null

const togglesEl = document.getElementById('toggles') as HTMLDivElement
const audio = new AudioOutput()
const keyboard = new KeyboardInput(window, showToggles)
const muteBtn = document.getElementById('mute') as HTMLButtonElement
function showToggles() {
  const s = keyboard.state
  togglesEl.textContent = `Difficulty: ${s.difficultyA ? 'A' : 'B'}  ·  Display: ${s.color ? 'Color' : 'B&W'}`
  muteBtn.textContent = keyboard.muted ? '🔇 Sound: Off' : '🔊 Sound: On'
  muteBtn.setAttribute('aria-pressed', String(keyboard.muted))
}
muteBtn.addEventListener('mousedown', (e) => e.preventDefault()) // never take focus: Space must stay "fire"
muteBtn.addEventListener('click', () => {
  keyboard.muted = !keyboard.muted
  showToggles()
})
// Browsers only allow audio after a user gesture.
for (const ev of ['keydown', 'pointerdown'] as const) addEventListener(ev, () => audio.enable())
showToggles()

async function loadRom(file: File) {
  audio.enable()
  const rom = new Uint8Array(await file.arrayBuffer())
  try {
    system = new Atari2600(rom)
    statusEl.textContent = `Loaded ${file.name} (${rom.length} bytes), reset PC=$${system.cpu.pc.toString(16).toUpperCase().padStart(4, '0')}`
  } catch (e) {
    system = null
    statusEl.textContent = e instanceof Error ? e.message : String(e)
  }
}

input.addEventListener('change', () => {
  const f = input.files?.[0]
  if (f) void loadRom(f)
  input.blur() // keep Space from reopening the file dialog
})
addEventListener('dragover', (e) => e.preventDefault())
addEventListener('drop', (e) => {
  e.preventDefault()
  const f = e.dataTransfer?.files[0]
  if (f) void loadRom(f)
})

// Fixed 60 Hz emulation step, independent of display refresh rate.
const FRAME_MS = 1000 / 60
let last = performance.now()
let acc = 0
function tick(now: number) {
  acc = Math.min(acc + (now - last), 100)
  last = now
  let drew = false
  while (system && acc >= FRAME_MS) {
    system.setControls(keyboard.state)
    system.runFrame()
    const samples = system.tia.drainAudio()
    if (!keyboard.muted) audio.push(samples)
    acc -= FRAME_MS
    drew = true
  }
  if (system && drew) {
    fitHeight(system.tia.displayHeight)
    system.tia.blit(pixels)
    ctx.putImageData(image, 0, 0)
  }
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
