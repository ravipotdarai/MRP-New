from PIL import Image
import os

src = r"C:\Users\manav\.cursor\projects\d-Projects-MRP-New\assets\c__Users_manav_AppData_Roaming_Cursor_User_workspaceStorage_b67ac6e137ab398d5cddbc0992717ae7_images_App_design2-5b7f54af-fd08-48b2-9034-01029460c74b.png"
# Also try the earlier higher-detail board if present
alts = [
    r"C:\Users\manav\.cursor\projects\d-Projects-MRP-New\assets\c__Users_manav_AppData_Roaming_Cursor_User_workspaceStorage_b67ac6e137ab398d5cddbc0992717ae7_images_App_design2-5b907571-c937-4adc-8edc-2faa3d2f46ba.png",
]
for a in alts:
    if os.path.exists(a):
        print("alt", a, Image.open(a).size)

im = Image.open(src)
w, h = im.size
print("main", w, h)
probe = r"d:\Projects\MRP New\MRP\src\assets\brand\_probe"
os.makedirs(probe, exist_ok=True)
crops = {
    "tl": (0, 0, w // 2, h // 2),
    "tr": (w // 2, 0, w, h // 2),
    "bl": (0, h // 2, w // 2, h),
    "br": (w // 2, h // 2, w, h),
    "logo_guess": (10, 10, int(w * 0.32), int(h * 0.38)),
    "features_guess": (10, int(h * 0.35), int(w * 0.55), int(h * 0.58)),
    "icons_row": (int(w * 0.5), 10, w - 10, int(h * 0.35)),
}
for name, box in crops.items():
    im.crop(box).save(os.path.join(probe, f"{name}.png"))
print("saved probes to", probe)
