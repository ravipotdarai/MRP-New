"use client";

/**
 * Shared vault session — unlock once per tab; plaintext stays in memory only.
 * Progressive: last ~1h unlocks UI first; full history hydrates in background.
 */

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { requestDriveAppDataToken } from "@/lib/drive-appdata";
import { fetchAndMergeVaultPayload } from "@/lib/vault-chunks";
import {
  clearVaultKeyCache,
  decryptVaultUtf8,
  vaultWithoutSelfieBlobs,
  type VaultPayload,
} from "@/lib/vault-crypto";

type VaultMeta = { name: string; modifiedTime?: string; sizeBytes?: number };

type VaultSessionValue = {
  vault: VaultPayload | null;
  meta: VaultMeta | null;
  busy: boolean;
  /** True while older packs / legacy vault still loading after first paint. */
  hydrating: boolean;
  /** Human stage while busy (download / decrypt / parse). */
  unlockStage: string | null;
  error: string | null;
  info: string | null;
  unlocked: boolean;
  unlock: (pin: string) => Promise<boolean>;
  refresh: (quiet?: boolean) => Promise<void>;
  lock: () => void;
  clearError: () => void;
  setInfo: (msg: string | null) => void;
  /** Session PIN for decrypting GPS day packs (memory only; null when locked). */
  getSessionPin: () => string | null;
  /** Decrypt an MRP1 blob with the unlocked session PIN. */
  decryptWithSessionPin: (blob: ArrayBuffer) => Promise<string>;
};

const VaultSessionContext = createContext<VaultSessionValue | null>(null);

const IDLE_MS = 30 * 60 * 1000;

function formatMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export function VaultSessionProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<VaultPayload | null>(null);
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [unlockStage, setUnlockStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const pinRef = useRef<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAbort = useRef<AbortController | null>(null);

  const lock = useCallback(() => {
    loadAbort.current?.abort();
    loadAbort.current = null;
    pinRef.current = null;
    if (hydrateTimer.current) {
      clearTimeout(hydrateTimer.current);
      hydrateTimer.current = null;
    }
    clearVaultKeyCache();
    setVault(null);
    setMeta(null);
    setInfo(null);
    setError(null);
    setUnlockStage(null);
    setHydrating(false);
  }, []);

  const bumpIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!pinRef.current) return;
    idleTimer.current = setTimeout(() => {
      lock();
      setInfo("Session locked after idle.");
    }, IDLE_MS);
  }, [lock]);

  const applyParsed = useCallback(
    (
      parsed: VaultPayload,
      file: { name?: string; modifiedTime?: string; sizeBytes?: number; size?: string },
      opts?: { partial?: boolean },
    ) => {
      const sizeBytes =
        file.sizeBytes ??
        (file.size ? Number(file.size) : undefined);
      setMeta({
        name: file.name || "Encrypted backup",
        modifiedTime: file.modifiedTime,
        sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined,
      });

      const selfieCount = parsed.selfies?.length ?? 0;
      const hasHeavySelfies = (parsed.selfies || []).some((s) => {
        const o = s as Record<string, unknown>;
        const b = o.dataBase64 || o.base64 || o.data;
        return typeof b === "string" && b.length > 8_000;
      });

      if (hasHeavySelfies) {
        setVault(vaultWithoutSelfieBlobs(parsed));
        if (hydrateTimer.current) clearTimeout(hydrateTimer.current);
        hydrateTimer.current = setTimeout(() => {
          startTransition(() => {
            setVault(parsed);
          });
          hydrateTimer.current = null;
        }, 50);
      } else {
        setVault(parsed);
      }

      const sizeLabel = sizeBytes && sizeBytes > 0 ? ` · ${formatMb(sizeBytes)}` : "";
      const selfieLabel = selfieCount ? ` · ${selfieCount} selfie(s)` : "";
      if (opts?.partial) {
        setInfo(
          `Last hour ready — loading full history…${file.modifiedTime ? ` · synced ${new Date(file.modifiedTime).toLocaleString()}` : ""}`,
        );
      } else {
        setInfo(
          `Device data unlocked${file.modifiedTime ? ` · synced ${new Date(file.modifiedTime).toLocaleString()}` : ""}${sizeLabel}${selfieLabel}`,
        );
      }
    },
    [],
  );

  const unlock = useCallback(
    async (pin: string) => {
      if (pin.length < 4) {
        setError("PIN must be at least 4 characters");
        return false;
      }
      loadAbort.current?.abort();
      const ac = new AbortController();
      loadAbort.current = ac;

      setBusy(true);
      setHydrating(false);
      setError(null);
      setInfo(null);
      let unlockedEarly = false;
      try {
        setUnlockStage("Connecting to Drive…");
        await yieldToUi();
        const token = await requestDriveAppDataToken();

        setUnlockStage("Loading last hour…");
        await yieldToUi();
        const merged = await fetchAndMergeVaultPayload(token, pin, {
          signal: ac.signal,
          onStage: (stage) => {
            if (!ac.signal.aborted) setUnlockStage(stage);
          },
          onPartial: (partial) => {
            if (ac.signal.aborted) return;
            pinRef.current = pin;
            applyParsed(partial.vault, {
              name: partial.meta.name,
              modifiedTime: partial.meta.modifiedTime,
              sizeBytes: partial.meta.sizeBytes,
            }, { partial: true });
            unlockedEarly = true;
            setBusy(false);
            setHydrating(true);
            setUnlockStage("Loading full history…");
          },
        });

        if (ac.signal.aborted) return unlockedEarly;

        pinRef.current = pin;
        applyParsed(merged.vault, {
          name: merged.meta.name,
          modifiedTime: merged.meta.modifiedTime,
          sizeBytes: merged.meta.sizeBytes,
        });
        setHydrating(false);
        return true;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return unlockedEarly;
        }
        if (unlockedEarly && pinRef.current) {
          // Keep partial vault; surface background failure lightly
          setHydrating(false);
          setInfo("Showing recent data — full history failed to finish.");
          return true;
        }
        pinRef.current = null;
        setVault(null);
        setMeta(null);
        setHydrating(false);
        const raw = e instanceof Error ? e.message : "Failed to open device data";
        setError(raw.replace(/mrp_vault_backup\.v1\.enc/gi, "backup").replace(/\bvault\b/gi, "backup"));
        return false;
      } finally {
        if (loadAbort.current === ac) loadAbort.current = null;
        setBusy(false);
        setUnlockStage(null);
      }
    },
    [applyParsed],
  );

  const refresh = useCallback(
    async (quiet = false) => {
      const pin = pinRef.current;
      if (!pin) return;
      loadAbort.current?.abort();
      const ac = new AbortController();
      loadAbort.current = ac;
      if (!quiet) {
        setBusy(true);
        setError(null);
        setUnlockStage("Refreshing packs…");
      } else {
        setHydrating(true);
      }
      try {
        const token = await requestDriveAppDataToken();
        const merged = await fetchAndMergeVaultPayload(token, pin, {
          signal: ac.signal,
          onStage: (stage) => {
            if (!quiet && !ac.signal.aborted) setUnlockStage(stage);
          },
          onPartial: quiet
            ? undefined
            : (partial) => {
                if (ac.signal.aborted) return;
                applyParsed(partial.vault, {
                  name: partial.meta.name,
                  modifiedTime: partial.meta.modifiedTime,
                  sizeBytes: partial.meta.sizeBytes,
                }, { partial: true });
                setBusy(false);
                setHydrating(true);
              },
        });
        if (ac.signal.aborted) return;
        applyParsed(merged.vault, {
          name: merged.meta.name,
          modifiedTime: merged.meta.modifiedTime,
          sizeBytes: merged.meta.sizeBytes,
        });
        if (quiet) setInfo(`Data refreshed · ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!quiet) {
          setError(e instanceof Error ? e.message : "Refresh failed");
        }
      } finally {
        if (loadAbort.current === ac) loadAbort.current = null;
        if (!quiet) {
          setBusy(false);
          setUnlockStage(null);
        }
        setHydrating(false);
      }
    },
    [applyParsed],
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") bumpIdle();
    };
    const onActivity = () => bumpIdle();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    bumpIdle();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [bumpIdle, vault]);

  useEffect(() => {
    const onUnload = () => {
      pinRef.current = null;
      clearVaultKeyCache();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const getSessionPin = useCallback(() => pinRef.current, []);

  const decryptWithSessionPin = useCallback(async (blob: ArrayBuffer) => {
    const pin = pinRef.current;
    if (!pin) throw new Error("Vault locked — unlock to decrypt GPS packs");
    return decryptVaultUtf8(blob, pin);
  }, []);

  const value = useMemo<VaultSessionValue>(
    () => ({
      vault,
      meta,
      busy,
      hydrating,
      unlockStage,
      error,
      info,
      unlocked: Boolean(vault),
      unlock,
      refresh,
      lock,
      clearError: () => setError(null),
      setInfo,
      getSessionPin,
      decryptWithSessionPin,
    }),
    [vault, meta, busy, hydrating, unlockStage, error, info, unlock, refresh, lock, getSessionPin, decryptWithSessionPin],
  );

  return (
    <VaultSessionContext.Provider value={value}>{children}</VaultSessionContext.Provider>
  );
}

export function useVaultSession(): VaultSessionValue {
  const ctx = useContext(VaultSessionContext);
  if (!ctx) {
    throw new Error("useVaultSession requires VaultSessionProvider");
  }
  return ctx;
}
