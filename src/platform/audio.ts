import { TIA_AUDIO_RATE } from '../core/audio'

/**
 * Plays TIA samples by scheduling one AudioBuffer per emulated frame, back to back.
 * The browser resamples from the TIA rate to the device rate.
 */
export class AudioOutput {
  private ctx: AudioContext | null = null
  private input: AudioNode | null = null
  private next = 0

  /** Must be called from a user gesture (key press, click, file pick) the first time. */
  enable(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      const highpass = ctx.createBiquadFilter() // removes the DC offset of unsigned samples
      highpass.type = 'highpass'
      highpass.frequency.value = 30
      const gain = ctx.createGain()
      gain.gain.value = 0.35
      highpass.connect(gain).connect(ctx.destination)
      this.ctx = ctx
      this.input = highpass
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  push(samples: Float32Array): void {
    const ctx = this.ctx
    if (!ctx || !this.input || ctx.state !== 'running' || samples.length === 0) return
    const buffer = ctx.createBuffer(1, samples.length, TIA_AUDIO_RATE)
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.input)
    const now = ctx.currentTime
    if (this.next < now + 0.02) this.next = now + 0.06 // underrun: re-prime with a little lead
    if (this.next > now + 0.3) return // too far ahead: drop to keep latency low
    src.start(this.next)
    this.next += buffer.duration
  }
}
