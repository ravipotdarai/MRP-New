"use client";

/**
 * Shared vault session — unlock once per tab; plaintext stays in memory only.
 */

import {
  createContext,
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
  decryptVaultUtf8,
  parseVaultJson,
  type VaultPayload,
} from "@/lib/vault-crypto";

type VaultMeta = { name: string; modifiedTime?: string };

type VaultSessionValue = {
  vault: VaultPayload | null;
  meta: VaultMeta | null;
  busy: boolean;
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

export function VaultSessionProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<VaultPayload | null>(null);
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const pinRef = useRef<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    pinRef.current = null;
    setVault(null);
    setMeta(null);
    setInfo(null);
    setError(null);
  }, []);

  const bumpIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!pinRef.current) return;
    idleTimer.current = setTimeout(() => {
      lock();
      setInfo("Vault locked after idle.");
    }, IDLE_MS);
  }, [lock]);

  const unlock = useCallback(async (pin: string) => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 characters");
      return false;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const token = await requestDriveAppDataToken();
      const { file, blob } = await fetchLatestVaultBlob(token);
      const plain = await decryptVaultUtf8(blob, pin);
      const parsed = parseVaultJson(plain);
      pinRef.current = pin;
      setVault(parsed);
      setMeta({ name: file.name, modifiedTime: file.modifiedTime });
      setInfo(`Vault unlocked · ${file.name}`);
      return true;
    } catch (e) {
      pinRef.current = null;
      setVault(null);
      setMeta(null);
      setError(e instanceof Error ? e.message : "Failed to open vault");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    const pin = pinRef.current;
    if (!pin) return;
    if (!quiet) {
      setBusy(true);
      setError(null);
    }
    try {
      const token = await requestDriveAppDataToken();
      const { file, blob } = await fetchLatestVaultBlob(token);
      const plain = await decryptVaultUtf8(blob, pin);
      setVault(parseVaultJson(plain));
      setMeta({ name: file.name, modifiedTime: file.modifiedTime });
      if (quiet) setInfo(`Vault refreshed · ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      if (!quiet) {
        setError(e instanceof Error ? e.message : "Refresh failed");
      }
    } finally {
      if (!quiet) setBusy(false);
    }
  }, []);

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
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const value = useMemo<VaultSessionValue>(
    () => ({
      vault,
      meta,
      busy,
      error,
      info,
      unlocked: Boolean(vault),
      unlock,
      refresh,
      lock,
      clearError: () => setError(null),
      setInfo,
    }),
    [vault, meta, busy, error, info, unlock, refresh, lock],
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
