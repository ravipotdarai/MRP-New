from pathlib import Path
import re

p = Path(r"d:\Projects\MRP New\MRP\android\app\src\main\java\com\mrp\MrpNativeModule.kt")
src = p.read_text(encoding="utf-8")


def wrap_method(text: str, sig_pattern: str, error_code: str) -> str:
    m = re.search(sig_pattern, text)
    if not m:
        print("NOT FOUND:", error_code)
        return text
    start = m.start()
    brace = text.find("{", m.end() - 1)
    i = brace
    depth = 0
    end = None
    while i < len(text):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
        i += 1
    if end is None:
        print("NO END", error_code)
        return text

    body = text[brace + 1 : end - 1].strip()
    if body.startswith("try"):
        # Extract try block contents
        try_brace = body.find("{")
        d = 0
        for k in range(try_brace, len(body)):
            if body[k] == "{":
                d += 1
            elif body[k] == "}":
                d -= 1
                if d == 0:
                    inner = body[try_brace + 1 : k]
                    break
        else:
            print("bad try", error_code)
            return text
        new_body = inner
    else:
        new_body = body

    # Indent inner body one level if needed
    lines = new_body.strip("\n").splitlines()
    # Ensure content has base indent of 12 spaces inside runAsync
    rebuilt = []
    for line in lines:
        if not line.strip():
            rebuilt.append("")
            continue
        # normalize: strip to content then add 12 spaces
        rebuilt.append("            " + line.lstrip())
    new_body = "\n".join(rebuilt)

    header = text[start:brace]
    new_method = (
        header
        + "{\n"
        + f'        runAsync(promise, "{error_code}") {{\n'
        + new_body
        + "\n        }\n"
        + "    }"
    )
    print("WRAPPED", error_code)
    return text[:start] + new_method + text[end:]


specs = [
    (r"@ReactMethod\s+fun getAppUsageForRange\(days: Double, promise: Promise\)", "GET_APP_USAGE_ERROR"),
    (r"@ReactMethod\s+fun getGpsTrailDays\(promise: Promise\)", "GPS_TRAIL_DAYS"),
    (r"@ReactMethod\s+fun getGpsTrailForDay\(dayKey: String, promise: Promise\)", "GPS_TRAIL_DAY"),
    (r"@ReactMethod\s+fun deleteTimelineEntry\(entryId: String, promise: Promise\)", "DELETE_TIMELINE_ERROR"),
    (r"@ReactMethod\s+fun clearTimeline\(promise: Promise\)", "CLEAR_TIMELINE_ERROR"),
    (r"@ReactMethod\s+fun getSensitivePermissionSections\(promise: Promise\)", "SENSITIVE_PERMS"),
    (r"@ReactMethod\s+fun evaluateDataRiskRules\(promise: Promise\)", "DATA_RISK_EVAL"),
    (r"@ReactMethod\s+fun runBreachPostureScan\(promise: Promise\)", "POSTURE"),
    (r"@ReactMethod\s+fun getMrpBatteryUsage\(promise: Promise\)", "BATTERY_USAGE"),
    (r"@ReactMethod\s+fun getEvents\(promise: Promise\)", "GET_EVENTS_ERROR"),
    (r"@ReactMethod\s+fun performSoftWipe\(promise: Promise\)", "SOFT_WIPE"),
    (r"@ReactMethod\s+fun deleteAllPhotos\(promise: Promise\)", "DELETE_ALL_PHOTOS"),
    (r"@ReactMethod\s+fun getSimRecoveryStatus\(promise: Promise\)", "SIM_STATUS"),
]

for pat, code in specs:
    src = wrap_method(src, pat, code)

p.write_text(src, encoding="utf-8")
print("done")
