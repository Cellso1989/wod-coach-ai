interface Entry {
  promise: Promise<unknown>;
  expiresAt: number;
  pending: boolean;
}

const aborted = () => new DOMException('Aborted', 'AbortError');

/** Small navigation reads only. Never persisted, and never shared between accounts. */
export class SessionReadCache {
  private session: string | null = null;
  private revision = 0;
  private entries = new Map<string, Entry>();

  setSession(userId: string | null) {
    if (userId === this.session) return;
    this.clear();
    this.session = userId;
  }

  clear() {
    this.revision++;
    this.entries.clear();
  }

  read<T>(
    key: string,
    load: (signal?: AbortSignal) => Promise<T>,
    maxAge: number,
    signal?: AbortSignal | null,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(aborted());
    if (!this.session) return load(signal ?? undefined);
    let entry = this.entries.get(key);
    if (!entry || (!entry.pending && entry.expiresAt <= Date.now())) {
      const revision = this.revision;
      const next: Entry = { promise: Promise.resolve(), expiresAt: 0, pending: true };
      next.promise = Promise.resolve()
        // A departing screen cancels its consumer, not another screen's shared read.
        .then(() => load(AbortSignal.timeout(30_000)))
        .then((value) => {
          if (revision !== this.revision) throw aborted();
          next.pending = false;
          next.expiresAt = Date.now() + maxAge;
          return value;
        })
        .catch((error: unknown) => {
          if (this.entries.get(key) === next) this.entries.delete(key);
          throw error;
        });
      if (this.entries.size >= 64) this.entries.delete(this.entries.keys().next().value!);
      this.entries.set(key, next);
      entry = next;
    }
    const revision = this.revision;
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(aborted());
      signal?.addEventListener('abort', onAbort, { once: true });
      entry.promise.then(
        (value) => {
          signal?.removeEventListener('abort', onAbort);
          if (signal?.aborted || revision !== this.revision) reject(aborted());
          else resolve(structuredClone(value) as T);
        },
        (error: unknown) => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }
}
