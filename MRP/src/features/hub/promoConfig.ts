/**
 * Config-driven promotions & affiliates (P7-7).
 * Replace URLs at launch; optional future Remote Config overlay.
 */
export type PromoLink = {
  id: string;
  title: string;
  subtitle: string;
  url: string;
};

export const PROMOTIONS: PromoLink[] = [
  {
    id: 'launch',
    title: 'Launch offer',
    subtitle: 'Premium trial messaging — configure before store release',
    url: 'https://mobileresilienceplatform.web.app',
  },
];

export const AFFILIATES: PromoLink[] = [
  {
    id: 'share',
    title: 'Share MRP',
    subtitle: 'Invite friends — affiliate tracking arrives with Nest billing',
    url: 'https://mobileresilienceplatform.web.app',
  },
];
