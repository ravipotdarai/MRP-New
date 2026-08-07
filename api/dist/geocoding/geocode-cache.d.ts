export declare class GeocodeCache<T> {
    private ttlMs;
    private store;
    constructor(ttlMs?: number);
    key(parts: (string | number)[]): string;
    get(key: string): T | undefined;
    set(key: string, value: T): void;
}
