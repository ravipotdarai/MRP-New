"""Extract logo crop + generate crisp brand feature icons (Google palette)."""
from PIL import Image, ImageDraw
import os

SRC = r"C:\Users\manav\.cursor\projects\d-Projects-MRP-New\assets\c__Users_manav_AppData_Roaming_Cursor_User_workspaceStorage_b67ac6e137ab398d5cddbc0992717ae7_images_App_design2-5b7f54af-fd08-48b2-9034-01029460c74b.png"
OUT = r"d:\Projects\MRP New\MRP\src\assets\brand"
FEAT = os.path.join(OUT, "features")
os.makedirs(FEAT, exist_ok=True)

BLUE, RED, YELLOW, GREEN = "#1A73E8", "#EA4335", "#FBBC04", "#34A853"
ONYX, SURFACE, WHITE = "#202124", "#F8FAFD", "#FFFFFF"

im = Image.open(SRC).convert("RGBA")
# Tight logo mark (eagle + phone) from board top-left
logo = im.crop((28, 18, 268, 210)).resize((512, 408), Image.Resampling.LANCZOS)
logo.save(os.path.join(OUT, "logo-mark.png"))

# Stacked wordmark area if present below logo on board — composite mark-only for RN
logo.save(os.path.join(OUT, "logo-stacked.png"))

def rounded_icon(draw_fn, name, size=256, bg="#E8F0FE"):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 8
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=48, fill=bg)
    draw_fn(d, size)
    path = os.path.join(FEAT, f"{name}.png")
    img.save(path)
    print("wrote", path)

def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)) + (255,)

def device_protection(d, s):
    # shield
    cx, cy = s // 2, s // 2 + 4
    pts = [
        (cx, cy - 70),
        (cx + 58, cy - 42),
        (cx + 58, cy + 20),
        (cx, cy + 72),
        (cx - 58, cy + 20),
        (cx - 58, cy - 42),
    ]
    d.polygon(pts, fill=hex_to_rgb(BLUE))
    # check
    d.line([(cx - 22, cy + 4), (cx - 4, cy + 24), (cx + 28, cy - 22)], fill=WHITE, width=12)

def live_location(d, s):
    cx, cy = s // 2, s // 2 - 8
    d.ellipse([cx - 50, cy - 20, cx + 50, cy + 55], outline=hex_to_rgb(GREEN), width=8)
    d.ellipse([cx - 28, cy, cx + 28, cy + 38], outline=hex_to_rgb(GREEN), width=5)
    # pin
    d.ellipse([cx - 22, cy - 48, cx + 22, cy - 4], fill=hex_to_rgb(RED))
    d.polygon([(cx - 18, cy - 18), (cx + 18, cy - 18), (cx, cy + 28)], fill=hex_to_rgb(RED))
    d.ellipse([cx - 8, cy - 34, cx + 8, cy - 18], fill=WHITE)

def drive_backup(d, s):
    cx, cy = s // 2, s // 2 + 10
    # cloud
    d.ellipse([cx - 55, cy - 25, cx - 5, cy + 25], fill=hex_to_rgb(BLUE))
    d.ellipse([cx - 20, cy - 45, cx + 40, cy + 15], fill=hex_to_rgb(BLUE))
    d.ellipse([cx + 10, cy - 20, cx + 60, cy + 30], fill=hex_to_rgb(BLUE))
    d.rounded_rectangle([cx - 50, cy - 5, cx + 50, cy + 35], radius=16, fill=hex_to_rgb(BLUE))
    # G colors bars
    d.rectangle([cx - 28, cy + 8, cx - 10, cy + 22], fill=hex_to_rgb(BLUE))
    d.rectangle([cx - 8, cy + 8, cx + 10, cy + 22], fill=hex_to_rgb(RED))
    d.rectangle([cx + 12, cy + 8, cx + 30, cy + 22], fill=hex_to_rgb(YELLOW))
    d.rectangle([cx - 8, cy - 8, cx + 10, cy + 6], fill=hex_to_rgb(GREEN))

def sim_alert(d, s):
    cx, cy = s // 2 - 6, s // 2
    d.rounded_rectangle([cx - 40, cy - 55, cx + 40, cy + 55], radius=12, fill=hex_to_rgb("#FB8C00"))
    d.polygon([(cx + 10, cy - 55), (cx + 40, cy - 55), (cx + 40, cy - 25)], fill=hex_to_rgb(SURFACE))
    d.ellipse([cx + 28, cy - 70, cx + 70, cy - 28], fill=hex_to_rgb(RED))
    d.line([(cx + 49, cy - 58), (cx + 49, cy - 46)], fill=WHITE, width=5)
    d.ellipse([cx + 46, cy - 40, cx + 52, cy - 34], fill=WHITE)

def unlock_selfie(d, s):
    cx, cy = s // 2, s // 2
    d.rounded_rectangle([cx - 55, cy - 40, cx + 55, cy + 40], radius=16, fill=hex_to_rgb(BLUE))
    d.ellipse([cx - 28, cy - 28, cx + 28, cy + 28], fill=WHITE)
    d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=hex_to_rgb(BLUE))
    d.rounded_rectangle([cx + 28, cy - 32, cx + 48, cy - 18], radius=4, fill=WHITE)

def geofencing(d, s):
    cx, cy = s // 2, s // 2 + 6
    d.ellipse([cx - 60, cy - 45, cx + 60, cy + 55], outline=hex_to_rgb(GREEN), width=8)
    d.ellipse([cx - 18, cy - 42, cx + 18, cy - 6], fill=hex_to_rgb(BLUE))
    d.polygon([(cx - 14, cy - 18), (cx + 14, cy - 18), (cx, cy + 22)], fill=hex_to_rgb(BLUE))
    d.ellipse([cx - 6, cy - 32, cx + 6, cy - 20], fill=WHITE)

def remote_lock(d, s):
    cx, cy = s // 2, s // 2 + 10
    d.arc([cx - 32, cy - 70, cx + 32, cy - 10], 0, 180, fill=hex_to_rgb(BLUE), width=12)
    d.line([(cx - 28, cy - 40), (cx - 28, cy - 10)], fill=hex_to_rgb(BLUE), width=12)
    d.line([(cx + 28, cy - 40), (cx + 28, cy - 10)], fill=hex_to_rgb(BLUE), width=12)
    d.rounded_rectangle([cx - 48, cy - 18, cx + 48, cy + 55], radius=14, fill=hex_to_rgb(BLUE))
    d.ellipse([cx - 10, cy + 5, cx + 10, cy + 25], fill=WHITE)
    d.rectangle([cx - 5, cy + 22, cx + 5, cy + 40], fill=WHITE)

def activity_timeline(d, s):
    cy = s // 2
    pts = [(40, cy + 10), (70, cy - 30), (100, cy + 5), (130, cy - 45), (160, cy + 20), (190, cy - 15), (220, cy + 8)]
    for i in range(len(pts) - 1):
        d.line([pts[i], pts[i + 1]], fill=hex_to_rgb(BLUE), width=10)
    for x, y in pts:
        d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=hex_to_rgb(BLUE))

rounded_icon(device_protection, "device-protection")
rounded_icon(live_location, "live-location")
rounded_icon(drive_backup, "drive-backup")
rounded_icon(sim_alert, "sim-alert")
rounded_icon(unlock_selfie, "unlock-selfie")
rounded_icon(geofencing, "geofencing")
rounded_icon(remote_lock, "remote-lock")
rounded_icon(activity_timeline, "activity-timeline")
print("done")
