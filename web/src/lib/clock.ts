/**
 * Estimates the difference between this device's clock and the server's, so countdowns
 * follow the server deadline even when the phone's clock is wrong.
 */
export class ServerClock {
  private offset = 0;
  private bestRtt = Number.POSITIVE_INFINITY;

  /** Coarse update from a snapshot's serverNow (used until a ping sample exists). */
  fromSnapshot(serverNow: number): void {
    if (this.bestRtt === Number.POSITIVE_INFINITY) this.offset = serverNow - Date.now();
  }

  /** Precise update from a round trip: keep the sample with the smallest round-trip time. */
  fromPing(sentAt: number, serverNow: number, receivedAt: number): void {
    const rtt = receivedAt - sentAt;
    if (rtt <= this.bestRtt * 1.5 || rtt < 150) {
      this.bestRtt = Math.min(this.bestRtt, rtt);
      this.offset = serverNow + rtt / 2 - receivedAt;
    }
  }

  now(): number {
    return Date.now() + this.offset;
  }

  get latencyMs(): number {
    return Number.isFinite(this.bestRtt) ? Math.round(this.bestRtt / 2) : 0;
  }
}
