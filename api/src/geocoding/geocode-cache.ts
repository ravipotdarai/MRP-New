/** In-memory TTL cache for geocode responses (no GPS trail storage). */

type Entry<T> = { value: T; expiresAt: number };

export class GeocodeCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(private ttlMs = 10 * 60 * 1000) {}

  key(parts: (string | number)[]): string {
    return parts.join(':');
  }

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.store.size > 5000) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
  }
}
