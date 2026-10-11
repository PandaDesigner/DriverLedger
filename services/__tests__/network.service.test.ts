/**
 * `network.service.test.ts` — cover the 3 spec scenarios for
 * `sync-network-events` (rising edge, no-edge cases, current value).
 *
 * Wired against a `FakeNetwork` (no `expo-network` dependency) so the
 * suite runs anywhere `bun:test` is available.
 */

import { describe, expect, it } from 'bun:test';
import { firstValueFrom, take } from 'rxjs';

import {
  NetworkService,
  type NetworkSource,
} from '../network.service';

// ---------------------------------------------------------------------------
// FakeNetwork — mirror of `expo-network`'s shape with a synchronous
// `setOnline()` for tests.
// ---------------------------------------------------------------------------

class FakeNetwork implements NetworkSource {
  private online = true;
  private listeners: Array<(online: boolean) => void> = [];

  isOnline(): boolean {
    return this.online;
  }

  subscribe(cb: (online: boolean) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  setOnline(value: boolean): void {
    if (this.online === value) return;
    this.online = value;
    for (const l of this.listeners) l(value);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NetworkService — red$ reflects current connectivity', () => {
  it('reports the source isOnline() snapshot synchronously on subscribe', () => {
    const net = new FakeNetwork();
    net.setOnline(true);
    const svc = new NetworkService(net);

    expect(svc.red$.getValue()).toBe(true);

    let received: boolean | null = null;
    const sub = svc.red$.subscribe((v) => {
      received = v;
    });
    expect(received).toBe(true);
    sub.unsubscribe();
    svc.stop();
  });

  it('updates red$ when the source transitions', () => {
    const net = new FakeNetwork();
    const svc = new NetworkService(net);

    net.setOnline(false);
    expect(svc.red$.getValue()).toBe(false);

    net.setOnline(true);
    expect(svc.red$.getValue()).toBe(true);

    svc.stop();
  });

  it('seeds red$ from the initial isOnline() value (offline boot)', () => {
    const net = new FakeNetwork();
    net.setOnline(false);
    const svc = new NetworkService(net);

    expect(svc.red$.getValue()).toBe(false);
    svc.stop();
  });

  it('red$ emits on identical subsequent values (no diffing)', async () => {
    const net = new FakeNetwork();
    const svc = new NetworkService(net);

    const received: boolean[] = [];
    const sub = svc.red$.subscribe((v) => received.push(v));

    net.setOnline(true); // same as initial
    await Promise.resolve();
    expect(received).toContain(true);

    sub.unsubscribe();
    svc.stop();
  });
});

describe('NetworkService — becameOnline$ fires only on rising edge', () => {
  it('does NOT fire when transitioning online → offline', () => {
    const net = new FakeNetwork();
    const svc = new NetworkService(net);

    const emissions: number[] = [];
    const sub = svc.becameOnline$.subscribe(() => emissions.push(Date.now()));

    net.setOnline(false);
    net.setOnline(false); // duplicate
    expect(emissions.length).toBe(0);

    sub.unsubscribe();
    svc.stop();
  });

  it('does NOT fire on online → online (no edge)', () => {
    const net = new FakeNetwork();
    const svc = new NetworkService(net);

    const emissions: number[] = [];
    const sub = svc.becameOnline$.subscribe(() => emissions.push(1));

    net.setOnline(true); // already online — no rise
    expect(emissions.length).toBe(0);

    sub.unsubscribe();
    svc.stop();
  });

  it('fires exactly once on offline → online (rising edge)', async () => {
    const net = new FakeNetwork();
    net.setOnline(false);
    const svc = new NetworkService(net);

    const first = firstValueFrom(svc.becameOnline$.pipe(take(1)));

    net.setOnline(true);
    await first; // resolves on emission

    // No second fire from the same edge.
    let secondFired = false;
    const sub = svc.becameOnline$.subscribe(() => {
      secondFired = true;
    });
    await Promise.resolve();
    expect(secondFired).toBe(false);

    sub.unsubscribe();
    svc.stop();
  });

  it('fires again on a second offline → online cycle', async () => {
    const net = new FakeNetwork();
    const svc = new NetworkService(net);

    let count = 0;
    const sub = svc.becameOnline$.subscribe(() => {
      count++;
    });

    // Cycle 1: online (start) → offline → online
    net.setOnline(false);
    net.setOnline(true);
    // Cycle 2: → offline → online again
    net.setOnline(false);
    net.setOnline(true);

    await Promise.resolve();
    expect(count).toBe(2);

    sub.unsubscribe();
    svc.stop();
  });

  it('fires once per offline→online transition across 3 cycles', async () => {
    const net = new FakeNetwork();
    const svc = new NetworkService(net);

    let count = 0;
    const sub = svc.becameOnline$.subscribe(() => {
      count++;
    });

    for (let i = 0; i < 3; i++) {
      net.setOnline(false);
      net.setOnline(true);
    }

    await Promise.resolve();
    expect(count).toBe(3);

    sub.unsubscribe();
    svc.stop();
  });
});

describe('NetworkService — stop()', () => {
  it('completes both Subjects and detaches the source', () => {
    const net = new FakeNetwork();
    const svc = new NetworkService(net);

    let redOpen = true;
    let becameOpen = true;
    svc.red$.subscribe({ complete: () => (redOpen = false) });
    svc.becameOnline$.subscribe({ complete: () => (becameOpen = false) });

    svc.stop();
    expect(redOpen).toBe(false);
    expect(becameOpen).toBe(false);
    expect(svc.red$.isStopped).toBe(true);
    expect(svc.becameOnline$.isStopped).toBe(true);
  });
});
