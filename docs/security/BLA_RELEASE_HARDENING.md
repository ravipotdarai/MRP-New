# BLA release hardening (MRP)

**Tool:** [qybaihe/bla](https://github.com/qybaihe/bla) — `bla-agents` (Blind LLM Agents).  
**Goal:** Raise the cost of AI reverse-engineering / casual cloning of **our** release artifacts (DEX + JS).  
**Not a claim:** Stopping JADX / Frida / Magisk permanently.

Companion: [`../plans/ANTI_CLONE_HARDENING.md`](../plans/ANTI_CLONE_HARDENING.md).

## Why BLA for MRP

| Layer | What it does |
|-------|----------------|
| BLA | Poisons / exhausts analyzer budgets on **build outputs** (DEX, JS, …) |
| R8 + Hermes | Classic shrink / obfuscate |
| `RuntimeIntegrityChecker` | Soft package / signing mismatch → `SECURITY_TAMPER` |
| Play Integrity (later) | Policy gates on vault restore / recovery / premium |

## Constraints

1. **Signed APKs fail closed** in BLA — harden **unsigned** APK/DEX, then resign.
2. Prefer Node **^22.23.4 or ≥24** for `bla-agents`.
3. Always **dry-run / mirror first**; `--apply` only after install + smoke test.
4. Do **not** harden source trees — only Gradle/Metro **outputs**.
5. Official install only: `npx bla-agents@latest …` or `npm i bla-agents` from [qybaihe/bla](https://github.com/qybaihe/bla).

## Recommended pipeline

```text
1. assembleRelease (or bundleRelease) with signing temporarily off / unsigned intermediate
2. npx bla-agents@latest harden <outputs-dir>          # writes .bla-hardened/ mirror
3. Resign hardened APK/AAB with Play upload / app signing key
4. Install on device → auth, Drive vault, selfie, SIM, monitoring smoke
5. If OK: harden … --apply (or promote the mirror) and keep that artifact for store
6. If broken: harden … --restore and fix before retrying
```

### Commands (from repo root)

```powershell
# 1) Build (example — adjust if you use a dedicated unsigned buildType)
cd MRP\android
.\gradlew.bat :app:assembleRelease

# 2) Dry harden outputs (nothing ships yet)
cd ..\..
npx bla-agents@latest harden "MRP/android/app/build/outputs"

# 3) After manual resign + smoke test, promote:
# npx bla-agents@latest harden "MRP/android/app/build/outputs" --apply
```

Optional agent setup (Cursor / Claude / etc.):

```bash
npx bla-agents@latest setup
```

Then you can prompt: `Harden my software against REA` (skill drives weave → harden → verify).

## What to smoke-test after BLA

- Google sign-in / Account  
- Drive vault backup & restore  
- Monitoring events + selfie capture  
- SIM recovery contacts  
- Panic SMS path  
- Subscription / entitlements (hardcoded or Play)

## Status

- [ ] First dry-run on unsigned `assembleRelease` outputs  
- [ ] Smoke test after resign  
- [ ] Wire into store release checklist (`STORE_V1_CHECKLIST` / Play AAB)  
- [ ] Pin `bla-agents` version in CI once stable  
