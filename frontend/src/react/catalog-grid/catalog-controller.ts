export interface CatalogRender {
  revision: number;
  settled: Promise<void>;
  mount: boolean;
  signal: AbortSignal | null;
  isCurrent(): boolean;
  finish(mounted: boolean): void;
}

interface Painting { revision: number; abort: AbortController }

/** Manages only grid epochs, first-screen cancellation and landing waits; requests, caching and pages stay with the existing Query and router. */
export class CatalogController {
  private currentRevision = 0;
  private currentPage = '';
  private painting: Painting | null = null;
  private waiters = new Map<number, () => void>();

  get revision(): number { return this.currentRevision; }
  get page(): string { return this.currentPage; }
  get pending(): boolean { return this.painting !== null; }

  taken(mounted: boolean): boolean { return mounted || this.pending; }

  /** When the same page has already landed, update props only; when the first screen is still pending, cancel the previous round and open again. */
  begin(page: string, mounted: boolean): CatalogRender {
    const changedPage = !!this.currentPage && this.currentPage !== page;
    if (changedPage) this.clear();
    // Only one wait is valid per round: the superseded call returns, and its landing callback stays isolated by epoch.
    this.releaseWaiters();
    this.currentPage = page;
    const revision = ++this.currentRevision;
    const settled = new Promise<void>(resolve => this.waiters.set(revision, resolve));
    const mount = changedPage || !mounted || this.pending;
    let painting: Painting | null = null;
    if (mount) {
      this.painting?.abort.abort();
      painting = { revision, abort: new AbortController() };
      this.painting = painting;
    }
    const current = () => this.currentPage === page && this.currentRevision === revision
      && (!painting || !painting.abort.signal.aborted);
    return {
      revision, settled, mount, signal: painting?.abort.signal ?? null, isCurrent: current,
      finish: (landed: boolean) => {
        if (painting && this.painting === painting) {
          this.painting = null;
          if (!landed) this.releaseWaiters();
        }
      },
    };
  }

  /** A page only hands back its own epoch; an old page cannot release the wait for later filters. */
  settle(revision: number): void {
    if (revision > this.currentRevision) return;
    for (const [requested, resolve] of this.waiters) {
      if (requested <= revision) { this.waiters.delete(requested); resolve(); }
    }
  }

  /** Leaving the grid cancels prefetches and releases every wait; the epoch increases monotonically. */
  clear(): void {
    this.painting?.abort.abort();
    this.painting = null;
    this.currentPage = '';
    this.releaseWaiters();
  }

  private releaseWaiters(): void {
    const waiters = [...this.waiters.values()];
    this.waiters.clear();
    waiters.forEach(resolve => resolve());
  }
}
