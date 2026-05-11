# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The repo has two apps — only one is live

The repo is called `truckpay-calculator` and the README/QUICKSTART/DEPLOYMENT docs describe a React + Vite + Tesseract.js OCR app called "TruckPay". **That app is obsolete.** The actually-deployed app is a separate, hand-written, single-file vanilla-JS app called **"DriverPay Pro"** living entirely in `index.html` (~1280 lines, with inline `<style>` and `<script>`). It is what GitHub Pages serves.

When the user asks for changes to "the app", they almost certainly mean `index.html`. Confirm before touching anything in `src/`.

| Path | Status | Notes |
|---|---|---|
| `index.html` | **LIVE** — DriverPay Pro, vanilla JS, self-contained | All app logic lives here |
| `src/PayCalculator.jsx`, `src/App.jsx`, `src/main.jsx` | Abandoned React prototype | Different name ("TruckPay"), different feature set, different (older) pay formula |
| `app.html` | Another abandoned standalone prototype | Ignore unless asked |
| `README.md`, `QUICKSTART.md`, `DEPLOYMENT.md` | Describe the abandoned React app | Treat as stale — verify before quoting |

The `npm` scripts (`dev`/`build`/`preview`) and the `.github/workflows/deploy.yml` pipeline build the React app in `src/` into `dist/` and publish that — they have **no effect on the live `index.html`**, which is served as-is from the repo root by GitHub Pages. If you want to preview the live app, open `index.html` directly in a browser or run any static file server in the repo root (e.g. `python3 -m http.server`). There is no build step, no bundler, no test framework, and no linter for the live app.

## DriverPay Pro architecture (`index.html`)

Single-file SPA. No framework. State lives entirely in `localStorage` under two keys:

- `driver_history` — array of **settlements** (one per payout week). Each settlement is `{ id, payoutDate, loads: [...] }`. Each load is `{ id, miles, tons, day, pricingMode?, customTotal?, customRate?, note?, ticket? }`. `ticket` is a base64 JPEG data URL.
- `driverpay_settings` — `{ avgTons }`, clamped to [17, 30].

`sanitizeHistory()` runs on startup and repairs malformed loads (missing tons/day, NaN miles, missing IDs). Preserve this contract when modifying load shape — if you add a field, add validation here too.

### Settlement week (non-obvious)

A "settlement" is a Friday-through-Thursday work week that pays out the **following Saturday**. `getPayoutDate(isoDate)` always rounds forward to that Saturday — Fri/Sat get the *next* week's Saturday, Sun-Thu get the upcoming Saturday. New loads auto-file into the right settlement based on today's date. Don't change this without understanding it.

### Pay calculation (current, correct formula)

```
driver_pay = rate × tons × 0.30
```

where `rate` comes from `getRate(miles)` — a piecewise-linear interpolation over the `rateData` table at the top of the script, with `m<=2` clamped to 3.84 and `m>=92` extrapolated linearly. The 30% commission is hardcoded; tonnage is user-set (default 25, range 17–30).

Three pricing modes (set per-load via the edit modal, dispatched in `getLoadPay()`):
- `auto` — formula above
- `fixed` — `customTotal × 0.30` (driver gets 30% of a fixed truck payout)
- `perton` — `customRate × tons × 0.30`

> **Heads up:** the README and `src/PayCalculator.jsx` document a different, older formula (`miles × rate × (tons/100) × (commission/100)` — note the `/100`). That formula is **wrong for the live app**. Always trust `getRate()` + `getLoadPay()` in `index.html`.

### Image pipeline (load tickets)

Tickets are captured via `<input type="file" capture="environment">` and processed entirely client-side in `compressImage()`:

1. Resize to max 1024px wide
2. `autoCropDocument()` — downsamples to 240px wide, box-blurs, thresholds at 88% of peak brightness, finds the bright rectangle by row/column counts, crops with 10px padding
3. `applyScannerFilter()` — adaptive local thresholding using a large box blur as the local mean; pixels above 0.85× local mean go white, below get gamma-curved toward black
4. Export as JPEG at quality 0.7 into a data URL stored on the load

`boxBlur2D()` is a separable two-pass blur shared by both crop and filter. If you change blur radius/thresholds, test on both crisp and dim photos — the auto-crop falls back to the full image if the detected region is implausibly small or full-frame.

### UI patterns to preserve

- **Touch swipe**: `swipe-container` cards use `ts/tm/te` handlers. Swiping left (xDiff > 40) reveals delete; right reveals edit. Only one card is open at a time. The threshold and one-at-a-time behavior matter for feel — don't change casually.
- **Body scroll lock**: every modal calls `lockBodyScroll()` / `unlockBodyScroll()`. These use `position: fixed` + saved `scrollY` to avoid iOS Safari rubber-banding. If you add a new modal, wire both calls.
- **Render preserves UI state**: `renderHistory()` snapshots which settlement cards are expanded and which day-sections are collapsed *before* tearing down the DOM, then reapplies that state after re-render. On first render of a settlement, only today's day-section stays open. If you refactor the render path, replicate this — otherwise every state change collapses the user's view.
- **`appConfirm()`** is the custom replacement for `window.confirm()` — use it for any destructive action; it returns a Promise.

### Caveats when editing `index.html`

- All HTML/CSS/JS is inline. There's no module system, no import order — top-to-bottom only.
- Tailwind is loaded via CDN (`https://cdn.tailwindcss.com`) for utility classes, but most styling is in the inline `<style>` block. Both coexist in the same elements.
- IDs are compared loosely (`==`) throughout because settlements use `Date.now()` (number) IDs while loads use random base36 (string) IDs. Don't tighten to `===` without auditing every comparison.
- No build step means **no source maps and no minification** — what you write is what ships. Keep readability.

## Common tasks

- **Edit the live app**: change `index.html`, commit, push to `main`. GitHub Pages serves the file at the repo root directly; the workflow's `dist/` publish is unrelated to it.
- **Run the live app locally**: `python3 -m http.server 8000` (or any static server) in the repo root, then open `http://localhost:8000/`. Do NOT use `npm run dev` for this — Vite would try to bundle the React app in `src/`.
- **Reset local app state during testing**: in DevTools console, `localStorage.removeItem('driver_history'); localStorage.removeItem('driverpay_settings'); location.reload()`.
- **Inspect rate curve**: in DevTools console, `getRate(N)` for any miles N.
