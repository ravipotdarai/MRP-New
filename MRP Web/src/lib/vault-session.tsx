"use client";

/**
 * Shared vault session — unlock once per tab; plaintext stays in memory only.
 * Large backups: staged progress + slim first paint (selfie blobs deferred one tick).
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
import {
  fetchLatestVaultBlob,
  requestDriveAppDataToken,
} from "@/lib/drive-appdata";
import {
  clearVaultKeyCache,
  decryptVaultUtf8,
  parseVaultJson,
  vaultWithoutSelfieBlobs,
  type VaultPayload,
} from "@/lib/vault-crypto";

type VaultMeta = { name: string; modifiedTime?: string; sizeBytes?: number };

type VaultSessionValue = {
  vault: VaultPayload | null;
  meta: VaultMeta | null;
  busy: boolean;
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
  const [unlockStage, setUnlockStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const pinRef = useRef<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
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
  }, []);

  const bumpIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!pinRef.current) return;
    idleTimer.current = setTimeout(() => {
      lock();
      setInfo("Session locked after idle.");
    }, IDLE_MS);
  }, [lock]);

  const applyParsed = useCallback((parsed: VaultPayload, file: { modifiedTime?: string; size?: string }) => {
    const sizeBytes = file.size ? Number(file.size) : undefined;
    setMeta({
      name: "Encrypted backup",
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
      // First paint without multi-MB base64 — timeline/maps unlock immediately.
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
    setInfo(
      `Device data unlocked${file.modifiedTime ? ` · synced ${new Date(file.modifiedTime).toLocaleString()}` : ""}${sizeLabel}${selfieLabel}`,
    );
  }, []);

  const unlock = useCallback(
    async (pin: string) => {
      if (pin.length < 4) {
        setError("PIN must be at least 4 characters");
        return false;
      }
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        setUnlockStage("Connecting to Drive…");
        await yieldToUi();
        const token = await requestDriveAppDataToken();

        setUnlockStage("Downloading encrypted backup…");
        await yieldToUi();
        const { file, blob } = await fetchLatestVaultBlob(token);
        const sizeLabel = file.size ? formatMb(Number(file.size) || blob.byteLength) : formatMb(blob.byteLength);

        setUnlockStage(`Decrypting ${sizeLabel}…`);
        await yieldToUi();
        const plain = await decryptVaultUtf8(blob, pin, (stage) => {
          if (stage === "derive") setUnlockStage(`Deriving key (PBKDF2) · ${sizeLabel}…`);
          else if (stage === "decrypt") setUnlockStage(`AES decrypt · ${sizeLabel}…`);
          else setUnlockStage("Decoding plaintext…");
        });

        setUnlockStage("Parsing backup…");
        await yieldToUi();
        const parsed = parseVaultJson(plain);
        pinRef.current = pin;
        applyParsed(parsed, file);
        return true;
      } catch (e) {
        pinRef.current = null;
        setVault(null);
        setMeta(null);
        const raw = e instanceof Error ? e.message : "Failed to open device data";
        setError(raw.replace(/mrp_vault_backup\.v1\.enc/gi, "backup").replace(/\bvault\b/gi, "backup"));
        return false;
      } finally {
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
      if (!quiet) {
        setBusy(true);
        setError(null);
        setUnlockStage("Refreshing backup…");
      }
      try {
        const token = await requestDriveAppDataToken();
        const { file, blob } = await fetchLatestVaultBlob(token);
        if (!quiet) setUnlockStage(`Decrypting ${formatMb(blob.byteLength)}…`);
        const plain = await decryptVaultUtf8(blob, pin, (stage) => {
          if (quiet) return;
          if (stage === "derive") setUnlockStage("Deriving key…");
          else if (stage === "decrypt") setUnlockStage("Decrypting…");
        });
        if (!quiet) setUnlockStage("Parsing…");
        const parsed = parseVaultJson(plain);
        applyParsed(parsed, file);
        if (quiet) setInfo(`Data refreshed · ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        if (!quiet) {
          setError(e instanceof Error ? e.message : "Refresh failed");
        }
      } finally {
        if (!quiet) {
          setBusy(false);
          setUnlockStage(null);
        }
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

  const value = useMemo<VaultSessionValue>(
    () => ({
      vault,
      meta,
      busy,
      unlockStage,
      error,
      info,
      unlocked: Boolean(vault),
      unlock,
      refresh,
      lock,
      clearError: () => setError(null),
      setInfo,
    }),
    [vault, meta, busy, unlockStage, error, info, unlock, refresh, lock],
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
