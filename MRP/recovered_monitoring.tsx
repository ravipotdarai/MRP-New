Created At: 2026-07-14T02:45:37Z
Completed At: 2026-07-14T02:45:37Z
File Path: `file:///d:/Projects/MRP%20New/MRP/src/features/monitoring/MonitoringScreen.tsx`
Total Lines: 648
Total Bytes: 18574
Showing lines 90 to 120
The following code has been modified to include a line number before every line, in the format: <line_number>: <original_line>. Please note that any changes targeting the original code should remove the line number, colon, and leading space.
90: }
91: 
92: export function MonitoringScreen() {
93:   const {settings, loading, updateSetting} = useSettings();
94:   const [isDeviceAdminEnabled, setIsDeviceAdminEnabled] = useState(false);
95:   const [hasCameraPerm, setHasCameraPerm] = useState(false);
96:   const [hasLocationPerm, setHasLocationPerm] = useState(false);
97: 
98:   const checkPermissions = async () => {
99:     try {
100:       const [admin, camGranted, locGranted] = await Promise.all([
101:         mrpmModule.isDeviceAdminEnabled(),
102:         Platform.OS === 'android'
103:           ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)
104:           : Promise.resolve(true),
105:         Platform.OS === 'android'
106:           ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
107:           : Promise.resolve(true),
108:       ]);
109:       setIsDeviceAdminEnabled(admin);
110:       setHasCameraPerm(camGranted);
111:       setHasLocationPerm(locGranted);
112:     } catch (e) {
113:       console.warn('Failed to check permissions:', e);
114:     }
115:   };
116: 
117:   const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
118:   const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);
119: 
120:   const loadPhotos = async () => {
The above content does NOT show the entire file contents. If you need to view any lines of the file which were not shown to complete your task, call this tool again to view those lines.
