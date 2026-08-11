import {NativeModules} from 'react-native';

const DS = NativeModules.DigitalSafety;

export type UrlRiskNativeResult = {
  input: string;
  normalized?: string;
  score: number;
  band: string;
  eventType: string;
  reasons: string[];
  reasonCodes: string[];
  domainHash?: string;
  host?: string;
  redirectHops?: string[];
  redirectError?: string;
};

export type EmergencyCard = {
  name?: string;
  bloodGroup?: string;
  allergies?: string;
  contacts?: Array<{name: string; phone: string}>;
  insurance?: string;
  medicalNotes?: string;
  instructions?: string;
  visibleFields?: string[];
  lockScreenEnabled?: boolean;
  updatedAtMs?: number;
};

export type SecureVaultItemMeta = {
  id: string;
  category: string;
  title: string;
  createdAtMs: number;
  updatedAtMs: number;
  expiryAtMs?: number;
  hasBody?: boolean;
  body?: string;
};

export const DigitalSafetyNative = {
  evaluateUrlRisk(raw: string, resolveRedirects = false): Promise<UrlRiskNativeResult> {
    return DS.evaluateUrlRisk(raw, resolveRedirects);
  },
  startQrScan(): Promise<string | null> {
    return DS.startQrScan();
  },
  getEmergencyCard(): Promise<EmergencyCard> {
    return DS.getEmergencyCard();
  },
  saveEmergencyCard(fields: EmergencyCard): Promise<EmergencyCard> {
    return DS.saveEmergencyCard(fields);
  },
  clearEmergencyCard(): Promise<boolean> {
    return DS.clearEmergencyCard();
  },
  listSecureVaultItems(): Promise<SecureVaultItemMeta[]> {
    return DS.listSecureVaultItems();
  },
  getSecureVaultItem(id: string, pin: string): Promise<SecureVaultItemMeta> {
    return DS.getSecureVaultItem(id, pin);
  },
  createSecureVaultItem(
    pin: string,
    category: string,
    title: string,
    body: string,
    expiryAtMs = 0,
  ): Promise<SecureVaultItemMeta> {
    return DS.createSecureVaultItem(pin, category, title, body, expiryAtMs);
  },
  updateSecureVaultItem(
    pin: string,
    id: string,
    category: string | null,
    title: string | null,
    body: string | null,
    expiryAtMs = -1,
  ): Promise<SecureVaultItemMeta> {
    return DS.updateSecureVaultItem(pin, id, category, title, body, expiryAtMs);
  },
  deleteSecureVaultItem(id: string): Promise<boolean> {
    return DS.deleteSecureVaultItem(id);
  },
  backupSecureVault(pin: string): Promise<{ok: boolean; error?: string; bytes?: number}> {
    return DS.backupSecureVault(pin);
  },
  restoreSecureVault(pin: string): Promise<{ok: boolean; error?: string; count?: number}> {
    return DS.restoreSecureVault(pin);
  },
  getSecureVaultCategories(): Promise<string[]> {
    return DS.getSecureVaultCategories();
  },
};
