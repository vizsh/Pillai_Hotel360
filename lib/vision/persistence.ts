/** A confirmed-detection gate: requires a signal to cross its threshold on at least `minHits`
 * of the last `window` samples before it counts as a real event — the single biggest lesson
 * from any CCTV-monitoring system (one flickering frame or a passing shadow is noise, not an
 * incident). Every detector in lib/vision/* runs its raw per-frame signal through one of these
 * rather than alerting off a single sample. */
export class PersistenceGate {
  private hits: boolean[] = [];
  private confirmed = false;

  constructor(
    private window: number,
    private minHits: number,
  ) {}

  /** Feeds one sample's pass/fail. Returns true exactly once, on the sample that first tips
   * the gate — the caller raises its alert there, not on every subsequent still-true sample. */
  push(passed: boolean): boolean {
    this.hits.push(passed);
    if (this.hits.length > this.window) this.hits.shift();
    const hitCount = this.hits.filter(Boolean).length;
    const nowConfirmed = this.hits.length >= this.minHits && hitCount >= this.minHits;
    const justConfirmed = nowConfirmed && !this.confirmed;
    this.confirmed = nowConfirmed;
    return justConfirmed;
  }

  get isConfirmed() {
    return this.confirmed;
  }

  reset() {
    this.hits = [];
    this.confirmed = false;
  }
}
