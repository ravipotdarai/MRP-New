"""Re-crop logo from brand board and make background truly transparent."""
from collections import deque
from PIL import Image, ImageFilter

BOARD = r"C:\Users\manav\.cursor\projects\d-Projects-MRP-New\assets\c__Users_manav_AppData_Roaming_Cursor_User_workspaceStorage_b67ac6e137ab398d5cddbc0992717ae7_images_App_design2-5b7f54af-fd08-48b2-9034-01029460c74b.png"
OUT = r"d:\Projects\MRP New\MRP\src\assets\brand\logo-mark.png"
STACKED = r"d:\Projects\MRP New\MRP\src\assets\brand\logo-stacked.png"


def is_bg(r: int, g: int, b: int, a: int) -> bool:
    if a < 8:
        return True
    # board wash / paper
    if min(r, g, b) >= 248:
        return True
    if r >= 215 and g >= 225 and b >= 238:
        return True
    if r >= 200 and g >= 215 and b >= 235 and (b - r) >= 8:
        return True
    # pale grey paper
    if abs(r - g) < 8 and abs(g - b) < 8 and r >= 235:
        return True
    return False


def main() -> None:
    board = Image.open(BOARD).convert("RGBA")
    # Tight crop of top-left logo mark on brand sheet
    logo = board.crop((28, 18, 268, 210)).resize((640, 510), Image.Resampling.LANCZOS)
    w, h = logo.size
    px = logo.load()

    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = px[x, y]
        if not is_bg(r, g, b, a):
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q.append((x + dx, y + dy))

    # Clear leftover bg islands that touch transparency
    for _ in range(2):
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or not is_bg(r, g, b, a):
                    continue
                touch = False
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        touch = True
                        break
                if touch:
                    px[x, y] = (0, 0, 0, 0)

    # Soften fringe: half-alpha pale edge pixels
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= 230 and g >= 235 and b >= 240:
                neigh_t = 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        neigh_t += 1
                if neigh_t >= 1:
                    px[x, y] = (r, g, b, 0)

    # Crop to content bbox with small pad
    bbox = logo.getbbox()
    if bbox:
        pad = 8
        x0, y0, x1, y1 = bbox
        logo = logo.crop(
            (
                max(0, x0 - pad),
                max(0, y0 - pad),
                min(w, x1 + pad),
                min(h, y1 + pad),
            )
        )

    # Final square canvas with transparent pad for nice RN display
    cw = max(logo.size)
    canvas = Image.new("RGBA", (cw, cw), (0, 0, 0, 0))
    ox = (cw - logo.size[0]) // 2
    oy = (cw - logo.size[1]) // 2
    canvas.paste(logo, (ox, oy), logo)
    canvas = canvas.resize((512, 512), Image.Resampling.LANCZOS)

    canvas.save(OUT)
    canvas.save(STACKED)
    print("alpha corner", canvas.getpixel((0, 0)))
    print("saved", OUT, canvas.size)


if __name__ == "__main__":
    main()
