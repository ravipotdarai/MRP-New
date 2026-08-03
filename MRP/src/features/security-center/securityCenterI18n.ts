/**
 * EN / HI copy for Security Center (Advisor + Fraud + shared chrome).
 */

export type SecLang = 'en' | 'hi';

type Dict = Record<string, string>;

const en: Dict = {
  disclaimer:
    'Local heuristics only — not antivirus / Play Protect. Fraud tools open official portals; MRP never uploads your vault to Nest for these scans.',
  tab_advisor: 'Advisor',
  tab_analyzer: 'Analyzer',
  tab_fraud: 'Fraud',
  tab_tools: 'Tools',
  advisor_title: 'Security Advisor',
  open_items: 'open items',
  run_posture: 'Run posture scan',
  scanning: 'Scanning…',
  analyzer_title: 'Threat Analyzer',
  analyzer_blurb: 'Heuristic risk buckets from installed apps (not a malware engine).',
  full_scan: 'Start full scan',
  sideload_section: 'Sideloaded / elevated risk',
  sideload_empty: 'No high-signal sideload / critical apps in report.',
  stale_section: 'Stale updates (6+ months)',
  stale_empty: 'No stale non-system apps flagged.',
  adware_section: 'Adware-style signals',
  adware_empty: 'No strong adware heuristics in this scan.',
  fraud_title: 'Report Fraud',
  fraud_blurb:
    'Opens official portals. Digital-arrest scams: hang up, verify via bank app, report via cybercrime.gov.in — MRP will not ask for OTPs or remote access.',
  lost_mobile: 'Lost mobile',
  find_device: 'Find my device (emergency track)',
  find_device_sub: 'High-accuracy path → PathSync Locate',
  google_find: 'Google Find My Device',
  google_find_sub: 'Opens Google’s locate page',
  panic_sms: 'Panic SMS',
  panic_sms_sub: 'Alert recovery contacts',
  soft_wipe: 'Soft wipe local evidence',
  soft_wipe_sub: 'Clears on-device MRP captures (confirm WIPE)',
  portals: 'Official portals',
  tools_wifi: 'Wi‑Fi security grade',
  tools_wifi_hint: 'Run Advisor posture scan for live Wi‑Fi crypto.',
  refresh_wifi: 'Refresh Wi‑Fi / posture',
  url_section: 'URL / QR paste scanner',
  url_blurb:
    'Paste a website URL or QR payload (including WIFI:…). Local heuristics only — not Google Safe Browsing.',
  scan_paste: 'Scan paste',
  ussd_section: 'USSD call-forward helper',
  ussd_blurb: 'Opens the dialer with check codes. Confirm in Phone app. Carrier support varies.',
  breach_section: 'Data breach email check',
  breach_blurb:
    'User-initiated only. Your email goes to XposedOrNot (not MRP servers / not vault). Confirm before checking.',
  breach_placeholder: 'you@example.com',
  breach_check: 'Check email',
  breach_checking: 'Checking…',
  breach_consent_title: 'Send email to XposedOrNot?',
  breach_consent_body:
    'MRP will query the public XposedOrNot API with the address you typed. Nothing is stored in your Drive vault.',
  breach_open_xon: 'Open XposedOrNot',
  breach_open_hibp: 'Open Have I Been Pwned',
  otp_section: 'OTP / SMS scam check',
  otp_blurb:
    'Paste an SMS (MRP does not read your inbox). Local keyword heuristics only — never share real OTPs here for storage.',
  otp_placeholder: 'Paste SMS text…',
  otp_scan: 'Analyze SMS',
  lang_en: 'EN',
  lang_hi: 'हिंदी',
  fraud_ncrp: 'Cybercrime (NCRP / cybercrime.gov.in)',
  fraud_ncrp_sub: 'Report online fraud, phishing, hacking',
  fraud_1930: 'National cyber helpline 1930',
  fraud_1930_sub: 'Call for financial cyber fraud assistance',
  fraud_chakshu: 'Sanchar Saathi / Chakshu',
  fraud_chakshu_sub: 'Report suspected fraud calls & SMS',
  fraud_ceir: 'CEIR — block lost/stolen phone',
  fraud_ceir_sub: 'IMEI blocking for lost mobile',
  fraud_rbi: 'RBI Sachet / banking fraud',
  fraud_rbi_sub: 'Banking & digital payment fraud guidance',
  fraud_uidai: 'UIDAI — Aadhaar',
  fraud_uidai_sub: 'Aadhaar lock / report misuse',
  fraud_ncw: 'Women helpline 181',
  fraud_ncw_sub: 'National Commission for Women resources',
  months_ago: 'months since update',
};

const hi: Dict = {
  disclaimer:
    'केवल स्थानीय जाँच — एंटीवायरस / Play Protect नहीं। धोखाधड़ी उपकरण आधिकारिक पोर्टल खोलते हैं; MRP इन स्कैन के लिए आपका वॉल्ट Nest पर नहीं भेजता।',
  tab_advisor: 'सलाहकार',
  tab_analyzer: 'विश्लेषक',
  tab_fraud: 'धोखाधड़ी',
  tab_tools: 'उपकरण',
  advisor_title: 'सुरक्षा सलाहकार',
  open_items: 'खुले मुद्दे',
  run_posture: 'पोस्चर स्कैन चलाएँ',
  scanning: 'स्कैन हो रहा है…',
  analyzer_title: 'खतरा विश्लेषक',
  analyzer_blurb: 'इंस्टॉल ऐप्स की अनुमानित जोखिम श्रेणियाँ (मैलवेयर इंजन नहीं)।',
  full_scan: 'पूर्ण स्कैन शुरू करें',
  sideload_section: 'साइडलोड / उच्च जोखिम',
  sideload_empty: 'कोई मजबूत साइडलोड / क्रिटिकल ऐप नहीं मिला।',
  stale_section: 'पुराने अपडेट (6+ महीने)',
  stale_empty: 'कोई पुराना गैर-सिस्टम ऐप नहीं।',
  adware_section: 'एडवेयर जैसे संकेत',
  adware_empty: 'इस स्कैन में मजबूत एडवेयर संकेत नहीं।',
  fraud_title: 'धोखाधड़ी रिपोर्ट',
  fraud_blurb:
    'आधिकारिक पोर्टल खोलता है। डिजिटल गिरफ्तारी घोटाला: कॉल काटें, बैंक ऐप से जाँचें, cybercrime.gov.in पर रिपोर्ट करें — MRP OTP या रिमोट एक्सेस नहीं माँगेगा।',
  lost_mobile: 'खोया मोबाइल',
  find_device: 'मेरा डिवाइस खोजें (आपातकालीन ट्रैक)',
  find_device_sub: 'उच्च सटीकता पथ → PathSync Locate',
  google_find: 'Google Find My Device',
  google_find_sub: 'Google की खोज पृष्ठ खोलता है',
  panic_sms: 'पैनिक SMS',
  panic_sms_sub: 'रिकवरी संपर्कों को सूचित करें',
  soft_wipe: 'स्थानीय साक्ष्य सॉफ्ट वाइप',
  soft_wipe_sub: 'फ़ोन पर MRP कैप्चर साफ़ (WIPE पुष्टि)',
  portals: 'आधिकारिक पोर्टल',
  tools_wifi: 'Wi‑Fi सुरक्षा ग्रेड',
  tools_wifi_hint: 'लाइव Wi‑Fi क्रिप्टो के लिए सलाहकार स्कैन चलाएँ।',
  refresh_wifi: 'Wi‑Fi / पोस्चर ताज़ा करें',
  url_section: 'URL / QR पेस्ट स्कैनर',
  url_blurb:
    'वेबसाइट URL या QR पेस्ट करें (WIFI:… सहित)। केवल स्थानीय जाँच — Google Safe Browsing नहीं।',
  scan_paste: 'पेस्ट स्कैन करें',
  ussd_section: 'USSD कॉल-फॉरवर्ड सहायक',
  ussd_blurb: 'डायलर में जाँच कोड खोलता है। फ़ोन ऐप में पुष्टि करें।',
  breach_section: 'डेटा ब्रीच ईमेल जाँच',
  breach_blurb:
    'केवल आपकी अनुमति पर। ईमेल XposedOrNot को जाता है (MRP सर्वर / वॉल्ट नहीं)।',
  breach_placeholder: 'you@example.com',
  breach_check: 'ईमेल जाँचें',
  breach_checking: 'जाँच हो रही है…',
  breach_consent_title: 'XposedOrNot को ईमेल भेजें?',
  breach_consent_body:
    'MRP आपके टाइप किए पते से सार्वजनिक XposedOrNot API पूछेगा। Drive वॉल्ट में कुछ नहीं सहेजा जाता।',
  breach_open_xon: 'XposedOrNot खोलें',
  breach_open_hibp: 'Have I Been Pwned खोलें',
  otp_section: 'OTP / SMS घोटाला जाँच',
  otp_blurb:
    'SMS पेस्ट करें (MRP इनबॉक्स नहीं पढ़ता)। केवल स्थानीय संकेत — यहाँ OTP संग्रहीत नहीं होता।',
  otp_placeholder: 'SMS टेक्स्ट पेस्ट करें…',
  otp_scan: 'SMS विश्लेषण',
  lang_en: 'EN',
  lang_hi: 'हिंदी',
  fraud_ncrp: 'साइबर अपराध (NCRP / cybercrime.gov.in)',
  fraud_ncrp_sub: 'ऑनलाइन धोखाधड़ी, फ़िशिंग, हैकिंग रिपोर्ट',
  fraud_1930: 'राष्ट्रीय साइबर हेल्पलाइन 1930',
  fraud_1930_sub: 'वित्तीय साइबर धोखाधड़ी सहायता',
  fraud_chakshu: 'संचार साथी / चक्षु',
  fraud_chakshu_sub: 'संदिग्ध धोखाधड़ी कॉल और SMS रिपोर्ट',
  fraud_ceir: 'CEIR — खोया/चोरी फ़ोन ब्लॉक',
  fraud_ceir_sub: 'खोए मोबाइल के लिए IMEI ब्लॉकिंग',
  fraud_rbi: 'RBI Sachet / बैंकिंग धोखाधड़ी',
  fraud_rbi_sub: 'बैंकिंग और डिजिटल भुगतान मार्गदर्शन',
  fraud_uidai: 'UIDAI — आधार',
  fraud_uidai_sub: 'आधार लॉक / दुरुपयोग रिपोर्ट',
  fraud_ncw: 'महिला हेल्पलाइन 181',
  fraud_ncw_sub: 'राष्ट्रीय महिला आयोग संसाधन',
  months_ago: 'महीने से अपडेट नहीं',
};

const TABLES: Record<SecLang, Dict> = {en, hi};

export function t(lang: SecLang, key: string): string {
  return TABLES[lang][key] ?? TABLES.en[key] ?? key;
}

export function fraudLinksFor(lang: SecLang): {id: string; title: string; subtitle: string; url: string}[] {
  return [
    {id: 'ncrp', title: t(lang, 'fraud_ncrp'), subtitle: t(lang, 'fraud_ncrp_sub'), url: 'https://cybercrime.gov.in/'},
    {id: '1930', title: t(lang, 'fraud_1930'), subtitle: t(lang, 'fraud_1930_sub'), url: 'tel:1930'},
    {
      id: 'chakshu',
      title: t(lang, 'fraud_chakshu'),
      subtitle: t(lang, 'fraud_chakshu_sub'),
      url: 'https://sancharsaathi.gov.in/',
    },
    {id: 'ceir', title: t(lang, 'fraud_ceir'), subtitle: t(lang, 'fraud_ceir_sub'), url: 'https://www.ceir.gov.in/'},
    {id: 'rbi', title: t(lang, 'fraud_rbi'), subtitle: t(lang, 'fraud_rbi_sub'), url: 'https://sachet.rbi.org.in/'},
    {id: 'uidai', title: t(lang, 'fraud_uidai'), subtitle: t(lang, 'fraud_uidai_sub'), url: 'https://uidai.gov.in/'},
    {id: 'ncw', title: t(lang, 'fraud_ncw'), subtitle: t(lang, 'fraud_ncw_sub'), url: 'https://ncw.nic.in/'},
  ];
}
