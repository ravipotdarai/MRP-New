import {NativeModules} from 'react-native';

const DS = NativeModules.DigitalSafety;

export type ScamAggregateResult = {
  score: number;
  band: string;
  verdict: string;
  source: string;
  reasons: string[];
  reasonCodes: string[];
};

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
  intelDegraded?: boolean;
};

export type CellularSecuritySummary = {
  status: 'ok' | 'attention' | 'permission_required' | 'unavailable';
  detail: string;
  score?: number;
  simState?: string;
  networkType?: string;
  operatorName?: string;
  simOperatorName?: string;
  networkCountryIso?: string;
  simCountryIso?: string;
  roaming?: boolean;
  policyLimited?: boolean;
  reasons?: string[];
};

export type NetworkGuardianState = {
  enabled: boolean;
  updatedAtMs: number;
  consentGranted: boolean;
  mode: string;
  dnsBlockingReady: boolean;
  listVersion?: string;
  listUpdatedAtMs?: number;
  blockedAds?: number;
  blockedTrackers?: number;
  blockedMalware?: number;
  blockedPhishing?: number;
  blockedContent?: number;
  blockedTotal?: number;
  dnsQueries?: number;
  dnsForwarded?: number;
  recentActivity?: Array<{t: number; category: string; host: string}>;
  lastError?: string | null;
  otherVpnActive?: boolean;
  privateDnsActive?: boolean;
  categoryAds?: boolean;
  categoryTrackers?: boolean;
  categoryMalware?: boolean;
  categoryPhishing?: boolean;
  categoryContent?: boolean;
  allowlist?: string[];
  manifestUrlConfigured?: boolean;
  intelVersion?: string;
  intelUpdatedAtMs?: number;
  intelLastError?: string | null;
};

export type EnrolledBreachEmail = {
  email: string;
  lastStatus?: string;
  lastCount?: number;
  lastCheckedAtMs?: number;
};

export type AutomationState = {
  clipboardScanEnabled: boolean;
  smsAutoScanEnabled: boolean;
  smsAutoScanAvailable: boolean;
  enrolledEmails: EnrolledBreachEmail[];
  lastCheckAtMs: number;
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
  aggregateScamText(text: string): Promise<ScamAggregateResult> {
    return DS.aggregateScamText(text);
  },
  getSafeLinkAllowlist(): Promise<string[]> {
    return DS.getSafeLinkAllowlist();
  },
  addSafeLinkAllowlist(host: string): Promise<string[]> {
    return DS.addSafeLinkAllowlist(host);
  },
  removeSafeLinkAllowlist(host: string): Promise<string[]> {
    return DS.removeSafeLinkAllowlist(host);
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
  deleteSecureVaultItem(id: string, pin: string): Promise<boolean> {
    return DS.deleteSecureVaultItem(id, pin);
  },
  scheduleVaultExpiryReminders(leadDays = 14): Promise<boolean> {
    return DS.scheduleVaultExpiryReminders(leadDays);
  },
  getVaultExpiryLeadDays(): Promise<number> {
    return DS.getVaultExpiryLeadDays();
  },
  authenticateVaultBiometric(): Promise<boolean> {
    return DS.authenticateVaultBiometric();
  },
  openSystemEmergencyInfo(): Promise<boolean> {
    return DS.openSystemEmergencyInfo();
  },
  getEmergencyLockScreenSummary(): Promise<Record<string, unknown>> {
    return DS.getEmergencyLockScreenSummary();
  },
  reportSafeLinkFalsePositive(
    host: string,
    reasonCodes: string[],
    note?: string,
  ): Promise<boolean> {
    return DS.reportSafeLinkFalsePositive(host, reasonCodes, note ?? null);
  },
  getUserBlocklist(): Promise<string[]> {
    return DS.getUserBlocklist();
  },
  addUserBlocklist(host: string): Promise<string[]> {
    return DS.addUserBlocklist(host);
  },
  removeUserBlocklist(host: string): Promise<string[]> {
    return DS.removeUserBlocklist(host);
  },
  getBrandListState(): Promise<{
    customBrands?: string[];
    customOfficial?: string[];
    brandCount?: number;
    officialCount?: number;
  }> {
    return DS.getBrandListState();
  },
  addBrand(brand: string): Promise<Record<string, unknown>> {
    return DS.addBrand(brand);
  },
  removeBrand(brand: string): Promise<Record<string, unknown>> {
    return DS.removeBrand(brand);
  },
  addOfficialBrandDomain(host: string): Promise<Record<string, unknown>> {
    return DS.addOfficialBrandDomain(host);
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
  getCellularSecuritySummary(): Promise<CellularSecuritySummary> {
    return DS.getCellularSecuritySummary();
  },
  getNetworkGuardianState(): Promise<NetworkGuardianState> {
    return DS.getNetworkGuardianState();
  },
  requestNetworkGuardianConsent(): Promise<NetworkGuardianState> {
    return DS.requestNetworkGuardianConsent();
  },
  setNetworkGuardianEnabled(enabled: boolean): Promise<NetworkGuardianState> {
    return DS.setNetworkGuardianEnabled(enabled);
  },
  setGuardianCategoryEnabled(
    category: string,
    enabled: boolean,
  ): Promise<NetworkGuardianState> {
    return DS.setGuardianCategoryEnabled(category, enabled);
  },
  addGuardianAllowlist(host: string): Promise<NetworkGuardianState> {
    return DS.addGuardianAllowlist(host);
  },
  removeGuardianAllowlist(host: string): Promise<NetworkGuardianState> {
    return DS.removeGuardianAllowlist(host);
  },
  refreshThreatIntel(): Promise<NetworkGuardianState> {
    return DS.refreshThreatIntel();
  },
  refreshGuardianLists(): Promise<NetworkGuardianState> {
    return DS.refreshGuardianLists();
  },
  getAutomationState(): Promise<AutomationState> {
    return DS.getAutomationState();
  },
  setClipboardScanEnabled(enabled: boolean): Promise<AutomationState> {
    return DS.setClipboardScanEnabled(enabled);
  },
  setSmsAutoScanEnabled(enabled: boolean): Promise<AutomationState> {
    return DS.setSmsAutoScanEnabled(enabled);
  },
  peekClipboardUrl(): Promise<{url: string} | null> {
    return DS.peekClipboardUrl();
  },
  enrollBreachEmail(email: string): Promise<AutomationState> {
    return DS.enrollBreachEmail(email);
  },
  unenrollBreachEmail(email: string): Promise<AutomationState> {
    return DS.unenrollBreachEmail(email);
  },
  recordBreachCheck(
    email: string,
    status: string,
    breachCount: number,
  ): Promise<AutomationState> {
    return DS.recordBreachCheck(email, status, breachCount);
  },
};
