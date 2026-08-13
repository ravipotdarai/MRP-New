import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  AppState,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {
  consumeSecurityCenterTab,
  type SecurityCenterTab,
} from './securityCenterNav';
import {getTrackingConfig, setTrackingConfig} from '../../native/DeviceTracking.types';
import {
  evaluateUrlRiskNative,
  logOtpScanEvent,
  logUrlScanEvent,
} from '../digital-safety/digitalSafetyEvents';
import {scanUrlOrPayload, type UrlScanResult} from './urlScan';
import {USSD_CODES, ussdTelUri} from './ussdCodes';
import {
  checkEmailBreaches,
  HIBP_URL,
  XPOSED_OR_NOT_URL,
  type BreachCheckResult,
} from './breachEmailCheck';
import {scanOtpSms, type OtpScanResult} from './otpHeuristics';
import {fraudLinksFor, t, type SecLang} from './securityCenterI18n';
import {useHorizontalTabSwipe} from '../../shared/hooks/useHorizontalTabSwipe';
import {DigitalSafetyNative} from '../digital-safety/DigitalSafety.native';

const SEC_CENTER_TABS: SecurityCenterTab[] = ['ADVISOR', 'ANALYZER', 'FRAUD', 'TOOLS'];

type PostureCheck = {
  id: string;
  title: string;
  ok: boolean;
  detail: string;
  severity: string;
};

type RiskApp = {
  packageName: string;
  appName: string;
  installer: string;
  riskLevel: string;
  score: number;
  reasons: string[];
  hasDeviceAdmin: boolean;
  hasAccessibility: boolean;
  staleUpdate?: boolean;
  adwareLikely?: boolean;
  monthsSinceUpdate?: number;
};

function openUrl(url: string) {
  Linking.openURL(url).catch(() => Alert.alert('Could not open', url));
}

export function SecurityCenterScreen({
  onLostMobileLocate,
}: {
  onLostMobileLocate?: () => void;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [lang, setLang] = useState<SecLang>('en');
  const [tab, setTab] = useState<SecurityCenterTab>('ADVISOR');
  const tabIndex = SEC_CENTER_TABS.indexOf(tab);
  const onSwipeIndex = useCallback((i: number) => {
    const next = SEC_CENTER_TABS[i];
    if (next) setTab(next);
  }, []);
  const swipeHandlers = useHorizontalTabSwipe(
    Math.max(0, tabIndex),
    SEC_CENTER_TABS.length,
    onSwipeIndex,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [grade, setGrade] = useState('Unknown');
  const [checks, setChecks] = useState<PostureCheck[]>([]);
  const [riskApps, setRiskApps] = useState<RiskApp[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState<UrlScanResult | null>(null);
  const [breachEmail, setBreachEmail] = useState('');
  const [breachBusy, setBreachBusy] = useState(false);
  const [breachResult, setBreachResult] = useState<BreachCheckResult | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpResult, setOtpResult] = useState<OtpScanResult | null>(null);

  useFocusEffect(
    useCallback(() => {
      const pending = consumeSecurityCenterTab();
      if (pending) setTab(pending);
    }, []),
  );

  useEffect(() => {
    (async () => {
      try {
        const loc = await (mrpmModule as any).getSecurityCenterLocale?.();
        if (loc === 'hi' || loc === 'en') setLang(loc);
      } catch {
        /* keep en */
      }
    })();
  }, []);

  const setLanguage = (next: SecLang) => {
    setLang(next);
    void (mrpmModule as any).setSecurityCenterLocale?.(next);
  };

  const load = useCallback(async () => {
    try {
      const bridge = mrpmModule as any;
      const [summary, risk] = await Promise.all([
        bridge.getBreachPostureSummary?.() ?? Promise.resolve(null),
        bridge.getAppRiskReport?.() ?? Promise.resolve([]),
      ]);
      if (summary?.grade) setGrade(summary.grade);
      if (summary?.lastJson) {
        try {
          const parsed = JSON.parse(summary.lastJson);
          setChecks(Array.isArray(parsed.checks) ? parsed.checks : []);
        } catch {
          setChecks([]);
        }
      }
      setRiskApps(Array.isArray(risk) ? risk : []);
    } catch (e) {
      console.warn('[SecurityCenter] load', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      const sub = AppState.addEventListener('change', s => {
        if (s === 'active') load();
      });
      return () => sub.remove();
    }, [load]),
  );

  const runAdvisorScan = async () => {
    setScanning(true);
    try {
      const bridge = mrpmModule as any;
      const report = await bridge.runBreachPostureScan?.();
      if (report?.grade) setGrade(report.grade);
      if (Array.isArray(report?.checks)) setChecks(report.checks);
      const failed = (report?.checks || []).filter((c: PostureCheck) => !c.ok);
      Alert.alert(
        `Advisor: ${report?.grade || 'Unknown'}`,
        failed.length
          ? failed.map((c: PostureCheck) => `• ${c.title}: ${c.detail}`).join('\n')
          : 'No issues found.',
      );
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message || String(e));
    } finally {
      setScanning(false);
    }
  };

  const runThreatScan = async () => {
    setScanning(true);
    try {
      const bridge = mrpmModule as any;
      await bridge.runBreachPostureScan?.();
      const risk = await (bridge.getAppRiskReport?.() ?? Promise.resolve([]));
      setRiskApps(Array.isArray(risk) ? risk : []);
      Alert.alert(
        'Threat scan complete',
        'Local heuristic scan only — not an antivirus. Review risk buckets below.',
      );
    } catch (e: any) {
      Alert.alert('Scan failed', e?.message || String(e));
    } finally {
      setScanning(false);
      load();
    }
  };

  const enableFindMyDevice = async () => {
    try {
      const existing = (await getTrackingConfig()) || {};
      await setTrackingConfig({
        ...existing,
        emergencyTracking: true,
        emergencyIntervalMinutes: 1,
        highAccuracy: true,
        backgroundTracking: true,
        syncLocation: true,
        syncOnWifi: true,
        syncOnMobileData: true,
      });
      Alert.alert(
        'Find my device ON',
        'Emergency tracking enabled. Unlock PathSync on the web to follow the trail. Soft wipe is available under Security → Setup.',
      );
      onLostMobileLocate?.();
    } catch (e: any) {
      Alert.alert('Could not enable', e?.message || String(e));
    }
  };

  const softWipe = () => {
    Alert.alert(
      'Soft wipe',
      'Removes local MRP evidence from this phone (confirm WIPE). Drive backup is separate.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Wipe',
          style: 'destructive',
          onPress: async () => {
            try {
              await (mrpmModule as any).performSoftWipe?.('WIPE');
              Alert.alert('Soft wipe done', 'Local evidence cleared.');
            } catch (e: any) {
              Alert.alert('Wipe failed', e?.message || String(e));
            }
          },
        },
      ],
    );
  };

  const panic = async () => {
    try {
      await (mrpmModule as any).sendPanicAlert?.();
      Alert.alert('Panic sent', 'Recovery contacts notified when configured.');
    } catch (e: any) {
      Alert.alert('Panic failed', e?.message || String(e));
    }
  };

  const wifiCheck = useMemo(
    () => checks.find(c => c.id === 'wifi_crypto') || null,
    [checks],
  );

  const runUrlScan = async () => {
    const native = await evaluateUrlRiskNative(scanInput);
    if (native) {
      const verdict: UrlScanResult['verdict'] =
        native.score >= 50 ? 'risky' : native.score >= 20 ? 'caution' : 'safe';
      if (native.band === 'INVALID') {
        setScanResult({
          input: native.input,
          normalized: native.normalized,
          verdict: 'invalid',
          reasons: native.reasons,
          score: native.score,
          band: native.band,
          reasonCodes: native.reasonCodes,
          eventType: native.eventType,
        });
      } else {
        setScanResult({
          input: native.input,
          normalized: native.normalized,
          verdict,
          reasons: native.reasons,
          score: native.score,
          band: native.band,
          reasonCodes: native.reasonCodes,
          domainHash: native.domainHash,
          host: native.host,
          eventType: native.eventType,
        });
        void logUrlScanEvent(
          native.score,
          native.band,
          native.reasonCodes,
          native.domainHash,
          native.host,
        );
      }
      return;
    }
    const fallback = scanUrlOrPayload(scanInput);
    setScanResult(fallback);
    if (fallback.band !== 'INVALID') {
      void logUrlScanEvent(
        fallback.score,
        fallback.band,
        fallback.reasonCodes,
        fallback.domainHash,
        fallback.host,
      );
    }
  };

  const dialUssd = (code: string) => {
    Alert.alert(
      'Open dialer?',
      `MRP will open your Phone app with ${code}. Confirm there to run the network query.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Open dialer', onPress: () => openUrl(ussdTelUri(code))},
      ],
    );
  };

  const runBreachCheck = () => {
    Alert.alert(t(lang, 'breach_consent_title'), t(lang, 'breach_consent_body'), [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'OK',
        onPress: async () => {
          setBreachBusy(true);
          setBreachResult(null);
          try {
            const result = await checkEmailBreaches(breachEmail);
            setBreachResult(result);
            if (result.status === 'found' || result.status === 'clean') {
              try {
                await DigitalSafetyNative.recordBreachCheck(
                  result.email,
                  result.status,
                  result.breaches.length,
                );
              } catch {
                // Enrollment store is optional on this screen.
              }
            }
          } finally {
            setBreachBusy(false);
          }
        },
      },
    ]);
  };

  const runOtpScan = () => {
    const result = scanOtpSms(otpInput);
    setOtpResult(result);
    if (result.verdict === 'empty') return;
    let score = 0;
    if (result.verdict === 'scam_likely') score = 65;
    else if (result.verdict === 'caution') score = 35;
    else score = 10;
    const codes = result.reasons.map((_, i) => `OTP_${i}`);
    void logOtpScanEvent(result.verdict, score, codes);
  };

  const buckets = useMemo(() => {
    const critical = riskApps.filter(a => a.riskLevel === 'CRITICAL');
    const high = riskApps.filter(a => a.riskLevel === 'HIGH');
    const medium = riskApps.filter(a => a.riskLevel === 'MEDIUM');
    const low = riskApps.filter(a => a.riskLevel === 'LOW');
    const sideload = riskApps.filter(a =>
      (a.reasons || []).some(r => /sideload|unknown|non-Play/i.test(r)),
    );
    const stale = riskApps.filter(a => a.staleUpdate);
    const adware = riskApps.filter(a => a.adwareLikely);
    return {critical, high, medium, low, sideload, stale, adware};
  }, [riskApps]);

  const donut = useMemo(() => {
    const c = buckets.critical.length;
    const h = buckets.high.length;
    const m = buckets.medium.length;
    const l = buckets.low.length;
    const total = Math.max(1, c + h + m + l);
    return [
      {label: 'Critical', n: c, color: colors.red, pct: (c / total) * 100},
      {label: 'High', n: h, color: colors.amber, pct: (h / total) * 100},
      {label: 'Medium', n: m, color: colors.sky, pct: (m / total) * 100},
      {label: 'Low', n: l, color: colors.emerald, pct: (l / total) * 100},
    ];
  }, [buckets, colors]);

  const fraudLinks = useMemo(() => fraudLinksFor(lang), [lang]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.sky} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.langRow}>
        <Text style={styles.disclaimer}>{t(lang, 'disclaimer')}</Text>
        <View style={styles.langToggle}>
          {(['en', 'hi'] as SecLang[]).map(code => (
            <TouchableOpacity
              key={code}
              style={[styles.langBtn, lang === code && styles.langBtnActive]}
              onPress={() => setLanguage(code)}>
              <Text style={[styles.langBtnText, lang === code && styles.langBtnTextActive]}>
                {t(lang, code === 'en' ? 'lang_en' : 'lang_hi')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.tabs}>
        {(
          [
            ['ADVISOR', 'tab_advisor'],
            ['ANALYZER', 'tab_analyzer'],
            ['FRAUD', 'tab_fraud'],
            ['TOOLS', 'tab_tools'],
          ] as const
        ).map(([id, key]) => (
          <TouchableOpacity
            key={id}
            style={[styles.tab, tab === id && styles.tabActive]}
            onPress={() => setTab(id)}>
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{t(lang, key)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{flex: 1}} {...swipeHandlers}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.sky}
          />
        }>
        {tab === 'ADVISOR' ? (
          <>
            <View style={styles.gradeCard}>
              <Text style={styles.gradeLabel}>{t(lang, 'advisor_title')}</Text>
              <Text style={styles.gradeValue}>{grade}</Text>
              <Text style={styles.muted}>
                {checks.filter(c => !c.ok).length} {t(lang, 'open_items')}
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={runAdvisorScan}
                disabled={scanning}>
                <Text style={styles.primaryBtnText}>
                  {scanning ? t(lang, 'scanning') : t(lang, 'run_posture')}
                </Text>
              </TouchableOpacity>
            </View>
            {checks.map(c => (
              <View key={c.id} style={styles.checkRow}>
                <View
                  style={[
                    styles.pill,
                    {
                      backgroundColor: c.ok
                        ? colors.emeraldSoft
                        : c.severity === 'critical'
                          ? colors.redSoft
                          : colors.amberSoft,
                    },
                  ]}>
                  <Text style={styles.pillText}>{c.ok ? 'OK' : c.severity.toUpperCase()}</Text>
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.checkTitle}>{c.title}</Text>
                  <Text style={styles.muted}>{c.detail}</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {tab === 'ANALYZER' ? (
          <>
            <View style={styles.gradeCard}>
              <Text style={styles.gradeLabel}>{t(lang, 'analyzer_title')}</Text>
              <Text style={styles.muted}>{t(lang, 'analyzer_blurb')}</Text>
              <View style={styles.donutRow}>
                <View style={styles.donutBar}>
                  {donut.map(s => (
                    <View
                      key={s.label}
                      style={{
                        flex: Math.max(s.n, 0.15),
                        backgroundColor: s.color,
                        height: 14,
                      }}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.bucketGrid}>
                {donut.map(s => (
                  <View key={s.label} style={styles.bucketCell}>
                    <Text style={[styles.bucketN, {color: s.color}]}>{s.n}</Text>
                    <Text style={styles.muted}>{s.label}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={runThreatScan}
                disabled={scanning}>
                <Text style={styles.primaryBtnText}>
                  {scanning ? t(lang, 'scanning') : t(lang, 'full_scan')}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.section}>{t(lang, 'sideload_section')}</Text>
            {buckets.sideload.length === 0 && buckets.critical.length === 0 ? (
              <Text style={styles.muted}>{t(lang, 'sideload_empty')}</Text>
            ) : (
              [...buckets.critical, ...buckets.high, ...buckets.sideload]
                .filter((a, i, arr) => arr.findIndex(x => x.packageName === a.packageName) === i)
                .slice(0, 40)
                .map(a => (
                  <View key={a.packageName} style={styles.appRow}>
                    <Text style={styles.appName}>{a.appName || a.packageName}</Text>
                    <Text style={styles.muted}>
                      {a.riskLevel} · score {a.score} · {a.installer || 'unknown installer'}
                    </Text>
                    {(a.reasons || []).slice(0, 3).map((r, i) => (
                      <Text key={i} style={styles.reason}>
                        • {r}
                      </Text>
                    ))}
                  </View>
                ))
            )}

            <Text style={styles.section}>{t(lang, 'stale_section')}</Text>
            {buckets.stale.length === 0 ? (
              <Text style={styles.muted}>{t(lang, 'stale_empty')}</Text>
            ) : (
              buckets.stale.slice(0, 25).map(a => (
                <View key={`stale-${a.packageName}`} style={styles.appRow}>
                  <Text style={styles.appName}>{a.appName || a.packageName}</Text>
                  <Text style={styles.muted}>
                    {a.monthsSinceUpdate ?? '?'} {t(lang, 'months_ago')} · {a.riskLevel}
                  </Text>
                </View>
              ))
            )}

            <Text style={styles.section}>{t(lang, 'adware_section')}</Text>
            {buckets.adware.length === 0 ? (
              <Text style={styles.muted}>{t(lang, 'adware_empty')}</Text>
            ) : (
              buckets.adware.slice(0, 25).map(a => (
                <View key={`ad-${a.packageName}`} style={styles.appRow}>
                  <Text style={styles.appName}>{a.appName || a.packageName}</Text>
                  <Text style={styles.muted}>
                    {a.riskLevel} · score {a.score}
                  </Text>
                  {(a.reasons || [])
                    .filter(r => /adware|overlay|non-Play/i.test(r))
                    .slice(0, 3)
                    .map((r, i) => (
                      <Text key={i} style={styles.reason}>
                        • {r}
                      </Text>
                    ))}
                </View>
              ))
            )}
          </>
        ) : null}

        {tab === 'FRAUD' ? (
          <>
            <View style={styles.gradeCard}>
              <Text style={styles.gradeLabel}>{t(lang, 'fraud_title')}</Text>
              <Text style={styles.muted}>{t(lang, 'fraud_blurb')}</Text>
            </View>

            <Text style={styles.section}>{t(lang, 'lost_mobile')}</Text>
            <TouchableOpacity style={styles.actionRow} onPress={enableFindMyDevice}>
              <Text style={styles.appName}>{t(lang, 'find_device')}</Text>
              <Text style={styles.muted}>{t(lang, 'find_device_sub')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => (mrpmModule as any).openFindMyDevice?.()}>
              <Text style={styles.appName}>{t(lang, 'google_find')}</Text>
              <Text style={styles.muted}>{t(lang, 'google_find_sub')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionRow} onPress={panic}>
              <Text style={styles.appName}>{t(lang, 'panic_sms')}</Text>
              <Text style={styles.muted}>{t(lang, 'panic_sms_sub')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionRow} onPress={softWipe}>
              <Text style={styles.appName}>{t(lang, 'soft_wipe')}</Text>
              <Text style={styles.muted}>{t(lang, 'soft_wipe_sub')}</Text>
            </TouchableOpacity>

            <Text style={styles.section}>{t(lang, 'portals')}</Text>
            {fraudLinks.map(l => (
              <TouchableOpacity key={l.id} style={styles.actionRow} onPress={() => openUrl(l.url)}>
                <Text style={styles.appName}>{l.title}</Text>
                <Text style={styles.muted}>{l.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        {tab === 'TOOLS' ? (
          <>
            <View style={styles.gradeCard}>
              <Text style={styles.gradeLabel}>{t(lang, 'tools_wifi')}</Text>
              <Text style={styles.gradeValue}>
                {wifiCheck
                  ? wifiCheck.detail.includes('·')
                    ? wifiCheck.detail.split('·').pop()?.trim() || wifiCheck.detail
                    : wifiCheck.ok
                      ? 'OK'
                      : 'Weak'
                  : '—'}
              </Text>
              <Text style={styles.muted}>
                {wifiCheck?.detail || t(lang, 'tools_wifi_hint')}
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={runAdvisorScan}
                disabled={scanning}>
                <Text style={styles.primaryBtnText}>
                  {scanning ? t(lang, 'scanning') : t(lang, 'refresh_wifi')}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.section}>{t(lang, 'breach_section')}</Text>
            <View style={styles.gradeCard}>
              <Text style={styles.muted}>{t(lang, 'breach_blurb')}</Text>
              <TextInput
                style={styles.inputSingle}
                placeholder={t(lang, 'breach_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={breachEmail}
                onChangeText={setBreachEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={runBreachCheck}
                disabled={breachBusy}>
                <Text style={styles.primaryBtnText}>
                  {breachBusy ? t(lang, 'breach_checking') : t(lang, 'breach_check')}
                </Text>
              </TouchableOpacity>
              {breachResult ? (
                <View style={{marginTop: 8, gap: 4}}>
                  <Text
                    style={[
                      styles.appName,
                      {
                        color:
                          breachResult.status === 'found'
                            ? colors.red
                            : breachResult.status === 'clean'
                              ? colors.emerald
                              : colors.amber,
                      },
                    ]}>
                    {breachResult.status.toUpperCase()}
                  </Text>
                  <Text style={styles.muted}>{breachResult.message}</Text>
                  {breachResult.breaches.slice(0, 12).map((b, i) => (
                    <Text key={i} style={styles.reason}>
                      • {b}
                    </Text>
                  ))}
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => openUrl(XPOSED_OR_NOT_URL)}>
                <Text style={styles.secondaryBtnText}>{t(lang, 'breach_open_xon')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => openUrl(HIBP_URL)}>
                <Text style={styles.secondaryBtnText}>{t(lang, 'breach_open_hibp')}</Text>
              </TouchableOpacity>
              {breachResult &&
              (breachResult.status === 'found' || breachResult.status === 'clean') ? (
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    Alert.alert(t(lang, 'breach_enroll_title'), t(lang, 'breach_enroll_body'), [
                      {text: 'Cancel', style: 'cancel'},
                      {
                        text: 'Enroll',
                        onPress: async () => {
                          try {
                            await DigitalSafetyNative.enrollBreachEmail(breachResult.email);
                            Alert.alert(
                              t(lang, 'breach_enrolled_title'),
                              t(lang, 'breach_enrolled_body'),
                            );
                          } catch (e: any) {
                            Alert.alert(
                              t(lang, 'breach_enroll_title'),
                              e?.message || t(lang, 'breach_enroll_failed'),
                            );
                          }
                        },
                      },
                    ]);
                  }}>
                  <Text style={styles.secondaryBtnText}>{t(lang, 'breach_enroll')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={styles.section}>{t(lang, 'otp_section')}</Text>
            <View style={styles.gradeCard}>
              <Text style={styles.muted}>{t(lang, 'otp_blurb')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t(lang, 'otp_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={otpInput}
                onChangeText={setOtpInput}
                multiline
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={runOtpScan}>
                <Text style={styles.primaryBtnText}>{t(lang, 'otp_scan')}</Text>
              </TouchableOpacity>
              {otpResult ? (
                <View style={{marginTop: 8, gap: 4}}>
                  <Text
                    style={[
                      styles.appName,
                      {
                        color:
                          otpResult.verdict === 'scam_likely'
                            ? colors.red
                            : otpResult.verdict === 'caution'
                              ? colors.amber
                              : colors.emerald,
                      },
                    ]}>
                    {otpResult.verdict.toUpperCase()}
                  </Text>
                  {otpResult.reasons.map((r, i) => (
                    <Text key={i} style={styles.reason}>
                      • {r}
                    </Text>
                  ))}
                  {otpResult.tips.map((tip, i) => (
                    <Text key={`t${i}`} style={styles.muted}>
                      {tip}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            <Text style={styles.section}>{t(lang, 'url_section')}</Text>
            <View style={styles.gradeCard}>
              <Text style={styles.muted}>{t(lang, 'url_blurb')}</Text>
              <TextInput
                style={styles.input}
                placeholder="https://… or WIFI:T:WPA;S:…"
                placeholderTextColor={colors.textMuted}
                value={scanInput}
                onChangeText={setScanInput}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={runUrlScan}>
                <Text style={styles.primaryBtnText}>{t(lang, 'scan_paste')}</Text>
              </TouchableOpacity>
              {scanResult ? (
                <View style={{marginTop: 8, gap: 4}}>
                  <Text
                    style={[
                      styles.appName,
                      {
                        color:
                          scanResult.verdict === 'risky'
                            ? colors.red
                            : scanResult.verdict === 'caution'
                              ? colors.amber
                              : scanResult.verdict === 'safe'
                                ? colors.emerald
                                : colors.textPrimary,
                      },
                    ]}>
                    Verdict: {scanResult.verdict.toUpperCase()}
                    {scanResult.score >= 0 ? ` · Risk ${scanResult.score}/100 (${scanResult.band})` : ''}
                  </Text>
                  {scanResult.normalized ? (
                    <Text style={styles.muted} numberOfLines={2}>
                      {scanResult.normalized}
                    </Text>
                  ) : null}
                  {scanResult.reasons.map((r, i) => (
                    <Text key={i} style={styles.reason}>
                      • {r}
                    </Text>
                  ))}
                  {scanResult.normalized && scanResult.verdict !== 'risky' ? (
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => openUrl(scanResult.normalized!)}>
                      <Text style={styles.secondaryBtnText}>Open in browser</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>

            <Text style={styles.section}>{t(lang, 'ussd_section')}</Text>
            <Text style={styles.muted}>{t(lang, 'ussd_blurb')}</Text>
            {USSD_CODES.map(u => (
              <TouchableOpacity
                key={u.id}
                style={styles.actionRow}
                onPress={() => dialUssd(u.code)}>
                <Text style={styles.appName}>
                  {u.title} · {u.code}
                </Text>
                <Text style={styles.muted}>{u.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : null}
      </ScrollView>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    root: {flex: 1},
    center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg},
    langRow: {paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: 8},
    disclaimer: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    langToggle: {flexDirection: 'row', gap: 6, alignSelf: 'flex-end'},
    langBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    langBtnActive: {borderColor: colors.sky, backgroundColor: colors.skySoft},
    langBtnText: {fontSize: 12, fontWeight: '600', color: colors.textMuted},
    langBtnTextActive: {color: colors.sky},
    tabs: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    tabActive: {
      borderColor: colors.sky,
      backgroundColor: colors.skySoft,
    },
    tabText: {fontSize: 11, fontWeight: '600', color: colors.textMuted},
    tabTextActive: {color: colors.sky},
    scroll: {padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.sm},
    gradeCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
      marginBottom: spacing.sm,
    },
    gradeLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
      letterSpacing: 0.4,
    },
    gradeValue: {fontSize: 28, fontWeight: '700', color: colors.textPrimary},
    muted: {fontSize: 12, color: colors.textMuted, lineHeight: 17},
    primaryBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.sky,
      borderRadius: radius.md,
      paddingVertical: 10,
      alignItems: 'center',
    },
    primaryBtnText: {color: '#fff', fontWeight: '700'},
    secondaryBtn: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 8,
      alignItems: 'center',
    },
    secondaryBtnText: {color: colors.sky, fontWeight: '600'},
    input: {
      marginTop: 8,
      minHeight: 72,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 10,
      color: colors.textPrimary,
      backgroundColor: colors.bg,
      textAlignVertical: 'top',
      fontSize: 13,
    },
    inputSingle: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 10,
      paddingVertical: 10,
      color: colors.textPrimary,
      backgroundColor: colors.bg,
      fontSize: 13,
    },
    checkRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
      alignItems: 'flex-start',
    },
    pill: {paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999},
    pillText: {fontSize: 10, fontWeight: '700', color: colors.textPrimary},
    checkTitle: {fontSize: 14, fontWeight: '600', color: colors.textPrimary},
    section: {
      marginTop: spacing.md,
      marginBottom: 6,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    donutRow: {marginTop: 8},
    donutBar: {flexDirection: 'row', borderRadius: 8, overflow: 'hidden', height: 14},
    bucketGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10},
    bucketCell: {
      width: '47%',
      backgroundColor: colors.bg,
      borderRadius: radius.md,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bucketN: {fontSize: 22, fontWeight: '700'},
    appRow: {
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
      gap: 2,
    },
    appName: {fontSize: 14, fontWeight: '600', color: colors.textPrimary},
    reason: {fontSize: 11, color: colors.textMuted},
    actionRow: {
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
      gap: 2,
    },
  });
}
