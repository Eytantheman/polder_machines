// A simple step sequencer for operating a lock: each step has a duration and a function of u in [0,1].
// The cycle repeats automatically; `trigger()` starts it at once if it is idle.
export class Sequence {
  constructor(steps, idle = 20) { this.steps = steps; this.idle = idle; this.i = -1; this.t = 0; this.wait = 3; }
  get label() { return this.i < 0 ? 'Waiting for the next vessel' : this.steps[this.i].label; }
  trigger() { if (this.i < 0) this.wait = 0; }
  update(dt) {
    if (this.i < 0) {
      this.wait -= dt;
      if (this.wait <= 0) { this.i = 0; this.t = 0; this.steps[0].start && this.steps[0].start(); }
      return;
    }
    const s = this.steps[this.i];
    this.t += dt;
    const u = Math.min(1, this.t / s.dur);
    s.f && s.f(u);
    if (u >= 1) {
      this.i++; this.t = 0;
      if (this.i >= this.steps.length) { this.i = -1; this.wait = this.idle; }
      else this.steps[this.i].start && this.steps[this.i].start();
    }
  }
}
export const ease = (u) => u * u * (3 - 2 * u);
