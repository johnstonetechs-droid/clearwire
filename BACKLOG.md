# ClearWire — Backlog

Everything post-V1 lives here. Git history on `feature/field-app` is
authoritative for what's shipped — this file tracks only what's still open.

---

## Open — field app

### Wire FCM credentials so Android push actually delivers
The dev-client APK installs and runs, but enabling proximity alerts errors
with `Default FirebaseApp is not initialized` because `google-services.json`
isn't bundled and EAS has no FCM v1 service-account key. Self-test (local)
push works because that path doesn't go through Firebase.

Steps:
1. Firebase Console → create/pick project → Add app → Android → package
   `com.clearwire.field` → register → download `google-services.json`.
2. Drop the file at `apps/field-native/google-services.json` (gitignored).
3. Firebase Console → Project settings → Service accounts → Generate new
   private key → save JSON.
4. Upload that service-account JSON to EAS via
   https://expo.dev/accounts/clearwire/projects/clearwire-field/credentials
   (Android → FCM V1 service account key).
5. Then the assistant adds `googleServicesFile: './google-services.json'`
   under `android` in `app.config.ts`, gitignores the file, and kicks a
   fresh EAS dev-client build. Sideload → proximity push works.

Reference: https://docs.expo.dev/push-notifications/fcm-credentials/

### Real app icons before any production build
Dev-client sideload is working and connects to Metro fine. Before kicking a
production EAS build, commit real PNG/SVG app icons and uncomment the
`icon`, `splash`, `adaptiveIcon`, and `favicon` references in
`apps/field-native/app.config.ts` (currently commented out so the dev build
prebuild step doesn't fail on missing assets).

### Service-type vs. damage-type on map pins (schema decision)
The incidents map uses a single "damage type" field for both the physical
observation (downed line, leaning pole) and the service affected (power, fiber,
cable, phone). These are logically different — a downed line can disrupt any
combination of services.

Proposed split:
- `damage_type` (existing) — physical observation
- `services_affected text[]` — which services are disrupted

Pins would render by `services_affected`; filter chips would offer both.
Needs a product/UX call before code work — not a pure implementation task.

---

## Open — shared architecture

### Migrate the website to `packages/map-logic`
The app side of `packages/map-logic` shipped in `dff180d` — the three map
screens now import shared types, RPC wrappers, and filter predicates from
the package. The website still runs its own duplicated copies of this
logic. Next pass (separate PR to `main`, in the other website working
copy) should update the website's map component to import from the same
package so the two can't drift again.

A later `packages/map-ui` (shared pin / card / filter-chip components via
React Native Web) is worth considering only when drift becomes painful.

---

## Open — website

- **robots.txt missing.** `https://clearwire.app/robots.txt` returns 404.
  Add a basic robots.txt that allows indexing and points to a sitemap.

- **SEO — site is client-side rendered.** Googlebot sees a near-empty HTML
  shell because Vite + React renders after JS load. Options:
    - Prerender.io or Vercel prerendering (easy)
    - Migrate to Next.js for real SSR/SSG (medium effort, big payoff)
    - Rich metadata (Open Graph, JSON-LD, per-page title/description) as a
      quick win regardless

- **Search Console noindex investigation.** Earlier Search Console notice
  flagged "Excluded by 'noindex' tag." Homepage is fine (`index, follow` in
  both meta tag and header). Affected URLs are likely Vercel preview URLs
  (auto-noindex, harmless) or a dev-leftover `noindex` in one of the
  subprojects. Resolve during the next SEO pass.

---

## Recently shipped (for orientation)

V1 submit flow, plus Sessions 2 (map), 3 (pro auth + push), and 4 (capture
polish) from the prior roadmap are all done. Headline commits on
`feature/field-app`:

- `f845641` unified damage + outage incidents map (org filter in `incidents.tsx`)
- `abcd6af` map filters, list/map toggle, pin clustering, reporter attribution
- `64fcc63` email+password auth, OTP fallback, change-password UI
- `0c02e5f` multi-photo capture, gallery upload, damage-chip icons, EXIF coords
- `e216985` change-location sheet (GPS refresh, address geocode, map picker)
- `083cb2f` + `bc68279` proximity push alerts (edge function + webhook)
- `d0a2da7` magic link sign-in + pro profile screen
- `8206df9` + `c4aeb5f` + `2a46c0f` "My submissions" screen, edit-until-ack,
  landing-screen surfacing

**Resolved schema questions:**
- Additional photos → `text[]` column on `reports` (not a child table)
- Magic-link auth → kept as fallback; email+password is primary
