# Kursi.io Phase 1 — Handoff Doc

**You're switching from web chat to Claude Code. This document is for the new Claude session to read first so it can pick up where the old one left off.**

---

## Project context

Kursi.io is an event ticketing site for Kuwait. Live at https://alkhatemtv.github.io/kursi-frontend/ (frontend) and https://kursi-backend.onrender.com (backend FastAPI on Render). Built by Abdullah Alkhatem as a college project for MSIT 500.

**Stack:**
- Frontend: single `index.html` file, hosted on GitHub Pages (`alkhatemtv/kursi-frontend` repo)
- Backend: FastAPI + SQLite on Render (`alkhatemtv/kursi-backend` repo)
- Auth: Auth0 (managed login, JWT)

---

## What we were doing

Phase 1 of an upgrade. The user picked these features over a full rebuild:

1. ✅ Stylized SVG illustrations replacing emoji on event cards
2. ✅ Light/dark mode toggle with localStorage persistence
3. ✅ Google sign-in via Auth0 (Apple skipped)
4. ✅ 3-seat-max limit per booking
5. ⚠️ 24-hour refund rule (helper added but not wired into UI)
6. ⚠️ QR code on tickets (generator embedded but not wired into `showTicket()`)

---

## What's IN the in-progress `index.html` already

The file in `phase1-in-progress/index.html` has these changes layered on top of the user's live version:

### Added near the top of `<body>`:
- `<svg style="display:none">` sprite containing 6 illustrations as `<symbol>` elements:
  - `#ev-illust-theater`, `#ev-illust-cinema`, `#ev-illust-talkshow`
  - `#ev-illust-stadium`, `#ev-illust-opera`, `#ev-illust-hall`

### Appended to the existing `<style>` block:
- Light theme CSS variables under `html.light-theme` selector
- `.ev-card-illust` class for embedded illustrations on event cards
- `.theme-toggle` and `.theme-toggle-app` button styles
- `.book-limit-banner` for 3-seat-max warnings
- `.refund-btn-disabled` for blocked refund buttons
- `#ticket-qr-canvas` for QR display

### Inserted into the nav (before `.lang-sw`):
- Theme toggle button with sun/moon SVG icons

### Appended before `</body>`:
- `<script src="https://cdn.auth0.com/.../auth0-spa-js.production.js">`
- A new `<script>` block with these globals:
  - `window.toggleTheme()` — toggles dark/light, persists to localStorage
  - `window.kursiIllustFor(ev)` — returns sprite ID like 'theater'
  - `window.kursiIllustHTML(ev)` — returns `<svg><use href="#..."/></svg>`
  - `window.makeQRCode(text, size)` — returns SVG string of QR code (full Reed-Solomon impl)
  - `window.kursiCanRefund(eventDate)` — returns true if >24h before event
  - `window.kursiRefundMessage(lang)` — returns localized "no refund within 24h" message
  - `window.kursiSignInWithGoogle()` — triggers Auth0 Google flow

### Modified in-place:
- `socialLogin()` function — now accepts 'google' / 'apple' and routes through Auth0
- The Google buttons in the auth modal call `socialLogin('google')`
- The Apple buttons call `socialLogin('apple')` (which shows "not enabled" toast)
- Event card rendering in `renderPublicEvents()` — uses `kursiIllustHTML(ev)` with emoji fallback span
- `toggleCoSeat(seat)` — now enforces MAX_SEATS_PER_BOOKING = 3 with bilingual toast

---

## What's NOT done — pick up here

These are the unfinished items from Phase 1, in priority order:

### 1. Wire QR generator into `showTicket()` ⚠️ HIGH IMPACT
File location: search for `function showTicket(booking)` in `index.html`
Around line 4045 there's a call like:
```javascript
document.getElementById('tk-qr').innerHTML = generateQRSVG(booking.ref);
```
Change `generateQRSVG` to `window.makeQRCode`:
```javascript
document.getElementById('tk-qr').innerHTML = window.makeQRCode(booking.ref, 160);
```
The old `generateQRSVG` was a placeholder that returned a fake QR. The new `makeQRCode` produces a real scannable QR encoding the booking ref.

### 2. Apply 24-hour refund rule to refund buttons
The user's customer dashboard renders bookings with a refund button. Find where the refund button is generated (search `refund-btn`) and replace the simple button with logic like:
```javascript
const canRefund = window.kursiCanRefund(booking.eventDate);
const refundBtn = canRefund
  ? `<button class="refund-btn" onclick="requestRefund('${booking.ref}')">Request Refund</button>`
  : `<button class="refund-btn-disabled" disabled title="${window.kursiRefundMessage(lang)}">Refund Unavailable</button>
     <div class="refund-window-msg">${window.kursiRefundMessage(lang)}</div>`;
```

### 3. Add 3 more events to DUMMY_EVENTS so all illustrations show
Search for `const DUMMY_EVENTS=[` around line 2763. Currently has theater/cinema/talk show. Add stadium, opera, hall events with appropriate dates (use future ISO dates so refunds are allowed) and `tag: 'Stadium'` / `'Opera'` / `'Hall'`. The `kursiIllustFor()` helper auto-detects these tags.

### 4. Add theme toggle to seat editor topbar
The seat builder app has its own topbar (`#app-topbar`). Add a `<button class="theme-toggle-app" onclick="toggleTheme()">...</button>` with the same sun/moon SVGs (use the small CSS class `.theme-toggle-app` already defined). Same for the venue dashboard topbar (`.vdash-topbar`).

### 5. Verify and ship
- Open the file in a browser
- Test: toggle theme, view event cards (should show illustrations), try to select 4 seats (should block at 3), check console for errors
- Validate CSS brace balance: `python3 -c "css = open('index.html').read(); print(css.count('{') - css.count('}'))"` should output `0`
- Validate JS: open browser console, look for red errors
- Once clean, push to `kursi-frontend` repo

---

## Important constraints to know

1. **Do NOT use Apple sign-in.** The user doesn't have an Apple Developer account. Apple buttons show a "not enabled" message — keep it that way.

2. **Auth0 is configured but Google connection may not be enabled yet on Auth0.** If `loginWithRedirect({connection: 'google-oauth2'})` fails, the user needs to enable the Google social connection in Auth0 dashboard → Authentication → Social → Google. Check this if Google sign-in errors out.

3. **The CSS in `index.html` is ONE giant minified line.** Don't try to reformat it. Always use targeted `str_replace` patches against unique substrings. The Phase 1 additions were appended as a separate `/* ═══ KURSI 2.0 ADDITIONS ═══ */` block at the end of the existing `<style>`.

4. **The user is on Render's free tier.** SQLite database wipes on every backend redeploy. Acceptable for a college demo.

5. **The user wants Phase 2 next:** A Seats.io-style canvas-based seat editor. This was deferred for a future session because it's a multi-hour rewrite. The existing seat editor uses absolutely-positioned divs — Phase 2 should rebuild on Konva.js or Fabric.js.

---

## File map

```
phase1-in-progress/
├── index.html                    ← The in-progress file (load this in Claude Code)
├── illustrations-sprite.svg       ← Reference: the SVG sprite that's embedded in index.html
├── theme-additions.css            ← Reference: the CSS that was appended
├── kursi-additions.js             ← Reference: the JS that was appended (incl. QR generator)
└── event-illustrations/
    ├── theater.svg / .png         ← Source illustrations (and previews)
    ├── cinema.svg / .png
    ├── talkshow.svg / .png
    ├── stadium.svg / .png
    ├── opera.svg / .png
    └── hall.svg / .png
```

The reference files (`theme-additions.css`, `kursi-additions.js`) are NOT separate files in the running site — their contents are already inlined into `index.html`. They're kept for reference in case anything needs to be re-added.

---

## Phase 2 backlog

- **Add organizer photo upload** — when an organizer creates a new event, let them upload an image (or paste an Unsplash URL). Save to localStorage as `ev.photoUrl`. Until then, user-created events use the SVG fallback by tag.

---

## Next-session checklist for Claude Code

1. `cd ~/Documents/kursi-frontend` (or wherever the user has their repo locally)
2. Read `index.html` to confirm the Phase 1 additions are present (look for the comment `KURSI 2.0 ADDITIONS`)
3. Knock out items 1-5 from "What's NOT done" above in order
4. Run a local browser preview, fix any console errors
5. Commit with message like `Complete Phase 1: QR codes, refund rules, theme toggle, illustrations`
6. Push and verify the live site at https://alkhatemtv.github.io/kursi-frontend/
