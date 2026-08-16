/**
 * MRP brand kit assets + Google-inspired tokens.
 * Source: App_design2 brand sheet.
 */
export const brandColors = {
  googleBlue: '#1A73E8',
  googleRed: '#EA4335',
  googleYellow: '#FBBC04',
  googleGreen: '#34A853',
  onyx: '#202124',
  surface: '#F8FAFD',
  iconBg: '#E8F0FE',
} as const;

export const brandCopy = {
  name: 'MRP',
  fullName: 'MOBILE RESILIENCE PLATFORM',
  tagline: 'Your Mobile. Always Protected.',
  pillars: 'Protect · Monitor · Recover',
  driveFooter: 'Backed by Google Drive',
} as const;

export const brandImages = {
  logoMark: require('./logo-clear.png'),
  logoStacked: require('./logo-stacked.png'),
  features: {
    deviceProtection: require('./features/device-protection.png'),
    liveLocation: require('./features/live-location.png'),
    driveBackup: require('./features/drive-backup.png'),
    simAlert: require('./features/sim-alert.png'),
    unlockSelfie: require('./features/unlock-selfie.png'),
    geofencing: require('./features/geofencing.png'),
    remoteLock: require('./features/remote-lock.png'),
    activityTimeline: require('./features/activity-timeline.png'),
  },
} as const;
