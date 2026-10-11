/**
 * `NetworkService` — connectivity surface for the sync stack.
 *
 * Exposes:
 *   - `red$: BehaviorSubject<boolean>` — current online state.
 *     New subscribers receive the latest value synchronously. Used by:
 *       • UI (status pill)
 *       • SyncQueueService polling tick (no-op while offline)
 *       • LocationService (Fase 5, gates TaskManager activation)
 *
 *   - `becameOnline$: Observable<void>` — RISING EDGE only. Fires when
 *     the device transitions from offline to online. Does NOT fire on
 *     online→offline transitions. The sync stack uses this to flush
 *     queued rows within milliseconds of a reconnect.
 *
 * Design reference: `openspec/changes/add-sync-queue/design.md §AD-8`
 * (NetworkService bundled in this change per Q4; cross-domain rule from
 * local-data-model-sqlite design.md AD-10).
 *
 * Cross-domain: this module imports ZERO files from `ui/` or top-level
 * `tests/`. Production wires `expo-network`; tests wire a `FakeNetwork`.
 */

import { BehaviorSubject, Observable, Subject } from 'rxjs';

/**
 * Source contract — anything that can report connectivity on demand
 * and listen for transitions. `expo-network`'s
 * `addNetworkStateListener` adapter implements this; `FakeNetwork` does
 * too for tests.
 */
export interface NetworkSource {
  /**
   * Synchronous snapshot of the current online state. Called once at
   * `NetworkService` construction to seed `red$`.
   */
  isOnline(): boolean;

  /**
   * Begin listening for changes. Invokes `cb(true|false)` on every
   * transition. Returns an unsubscribe disposer. May invoke `cb`
   * synchronously on subscription if the source reports state eagerly
   * (Bun's `FakeNetwork` does this for test parity with `expo-network`).
   */
  subscribe(cb: (online: boolean) => void): () => void;
}

export class NetworkService {
  readonly red$: BehaviorSubject<boolean>;
  readonly becameOnline$ = new Subject<void>();

  private prevOnline: boolean;
  private readonly unsubscribe: () => void;

  constructor(source: NetworkSource) {
    const initial = source.isOnline();
    this.prevOnline = initial;
    this.red$ = new BehaviorSubject<boolean>(initial);

    this.unsubscribe = source.subscribe((online) => {
      const rising = online === true && this.prevOnline === false;
      this.prevOnline = online;
      // Note: red$.next is also called on identical values so subscribers
      // always see the latest snapshot. The rising-edge logic on
      // becameOnline$ is the meaningful filter.
      this.red$.next(online);
      if (rising) this.becameOnline$.next();
    });
  }

  /**
   * Tear down — completes both Subjects and unsubscribes from the
   * source. Production callers typically never invoke this (singleton
   * for the app's lifetime); tests use it in `afterEach` to reset state.
   */
  stop(): void {
    this.unsubscribe();
    if (!this.red$.isStopped) this.red$.complete();
    if (!this.becameOnline$.isStopped) this.becameOnline$.complete();
  }
}
