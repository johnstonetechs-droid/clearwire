# ClearWire — Backlog

Everything post-V1 lives here. Git history on `feature/field-app` is
authoritative for what's shipped — this file tracks only what's still open.

---

## Open — field app

### Real app icons before any production build
Dev-client sideload is working and connects to Metro fine. Before kicking a
production EAS build, commit real PNG/SVG app icons and uncomment the
`icon`, `splash`, `adaptiveIcon`, and `favicon` references in
`apps/field-native/app.config.ts` (currently commented out so the dev build
prebuild step doesn't fail on missing assets).

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

- **SEO — site is client-side rendered.** Googlebot sees a near-empty HTML
  shell because Vite + React renders after JS load. Options:
    - Prerender.io or Vercel prerendering (easy)
    - Migrate to Next.js for real SSR/SSG (medium effort, big payoff)
    - Rich metadata (Open Graph, JSON-LD, per-page title/description) as a
      quick win regardless

- **Search Console verification (post-merge of `website/robots-txt`).**
  After the robots.txt + root `vercel.json` PR ships, re-request indexing
  in Search Console for any URLs previously flagged "Excluded by 'noindex'
  tag." If anything is still excluded, the next suspect is the CSR-empty-
  HTML problem above (Googlebot rendering deep pages without enough
  signal), not a noindex header.

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
- FCM credentials wired: Firebase project `clearwire-14f0a`, Android app
  `com.clearwire.field` registered, `google-services.json` bundled via
  `googleServicesFile` in `app.config.ts`, FCM v1 service-account key
  uploaded to EAS. Dev-client rebuild in progress.

**Resolved schema questions:**
- Additional photos → `text[]` column on `reports` (not a child table)
- Magic-link auth → kept as fallback; email+password is primary
- damage_type vs services_affected → split into two fields (commit `3227f56`)

**In-flight branches off main (open PRs):**
- `website/robots-txt` — adds `public/robots.txt` (`26e54e5`) and root
  `vercel.json` forcing `X-Robots-Tag: index, follow` (`3c86b28`) to the
  clearwire.app root site. Open PR:
  https://github.com/johnstonetechs-droid/clearwire/pull/new/website/robots-txt
