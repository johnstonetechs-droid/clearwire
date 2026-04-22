# ClearWire — Backlog

Everything post-V1 lives here. Git history on `feature/field-app` is
authoritative for what's shipped — this file tracks only what's still open.

---

## Open — field app

### Check on the queued EAS dev build
An Android development client was queued on the free tier on 2026-04-19 from
`apps/field-native`. Build URL is in the terminal history; also retrievable via
`pnpm exec eas build:list`.

Once it completes:
1. Download the APK and sideload.
2. Run `pnpm app:dev-client` to verify push delivery end-to-end.
3. Commit real app icons (currently commented out in `app.config.ts`) before
   any production build.

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

### Website ↔ app map drift (`packages/map-logic`)
The app map (`apps/field-native/app/incidents.tsx`) and the website map were
built independently. The original plan was to extract the website map's core
logic into `packages/map-logic` (platform-agnostic TypeScript — Supabase
queries, filter state hook, clustering, bounding-box math) and have both sides
import from there. This was never done; drift risk is real today.

Open question: is the website's existing code worth extracting, or cleaner to
rewrite fresh into `packages/map-logic`?

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
