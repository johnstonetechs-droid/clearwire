# ClearWire Field App — Backlog

Post-V1 improvements. Not blocking the current session; these are captured so they
don't get lost while we finish the core submit flow and wire up real branding.

Grouped by area. Priority is rough ordering within each group.

---

## Capture flow

- **Gallery upload alternative.** Report Damage currently opens directly to the
  camera. Add a second path: pick an existing photo from the device gallery.
  Uses `expo-image-picker` with `launchImageLibraryAsync`. UX: either a two-button
  entry screen (Camera / Gallery) or an icon in the camera toolbar to switch modes.
  EXIF data from gallery photos may include location — prefer that over current
  GPS when available, falls back to live GPS when EXIF has no coords.

- **Additional photos per report.** Currently one photo per submission. Allow up
  to N (start with 4) additional photos for context — overview shot, close-up,
  different angles. Requires: `reports.photo_url` becomes `reports.photo_urls`
  (text array) or a `report_photos` child table; pick based on whether we want
  ordering/captions per photo (child table) or simple array (text[]). DB migration
  plus updating `insert_report` RPC and the classify screen UI.

- **Damage type icons.** Replace the text-only chips with icon + text, where the
  icon matches the same glyph used for the map pin for that damage type. Need a
  single source of truth: a `DAMAGE_TYPE_META` object in `packages/supabase/src`
  that has `{ label, icon, color }` per damage type, consumed by both the chip
  picker and the map pin renderer. Suggested icon library: `lucide-react-native`
  (already works in the RN/web stack).

## Location handling

Current behavior: location is auto-captured from device GPS at the moment the
camera screen mounts. Field conditions often need more flexibility.

- **Option A: Auto GPS (current default).** Keep as fastest path.
- **Option B: Manually enter address/coords.** Text input that geocodes via
  Supabase PostGIS + a geocoding provider (Mapbox geocoding API if we're already
  paying for Mapbox for maps, otherwise Nominatim for free).
- **Option C: Pick a spot on the map.** Draggable pin on a Mapbox map centered on
  the user's current position. Tap/drag to set final location.

UX: a small "change location" link on the classify screen, opens a bottom sheet
with the three options. Whatever they pick updates the `location` state before
submit.

Edge case: when the photo's EXIF has different coords than current GPS (e.g. they
took the photo earlier and are submitting from home), surface this conflict and
let them pick which to use.

## Nearby reports (map view)

The V1 plan had a basic map with pins. Expand it to match the `clearwire.app`
web experience.

- **Visual parity with web map.** Same Mapbox style, same pin design, same
  clustering behavior, same tap-to-expand card as the existing website map.
  Reuse tokens from `packages/brand` so they stay in sync automatically.

- **Filter by damage type.** Multi-select filter chips at the top. Reuses the
  same `DAMAGE_TYPE_META` icons from the capture flow.

- **Filter by company affected.** Requires a new column on reports
  (`affected_company text` or better, a normalized `companies` table with a join)
  and the UI to surface it. Useful for contractors who only care about their own
  customers. Pro users likely want this saved as a preference.

- **Pin icon = service type affected.** Instead of a generic damage pin, the map
  pin's glyph should reflect what service is disrupted (power, fiber, cable,
  phone, etc.). May require distinguishing "damage type" (physical — downed line,
  leaning pole) from "services affected" (logical — fiber is out, power is out),
  which could be separate fields on the report. Worth discussing before schema
  change.

- **View modes: split / list-only / map-only.** Toggle in the header. On tablet
  and desktop (via PWA later) split view is default; on phone, map-only is
  default with a drawer for the list. Persist the user's preference.

## Pro user auth

Current state: Supabase magic link only. Every session requires tapping a fresh
email link. Not acceptable for field use where someone opens the app once a day.

- **Username + password signup/login.** Standard Supabase email+password auth
  (`signUp` with email+password, then `signInWithPassword`). Replaces magic link
  as the primary path but we can keep magic link as a "forgot password" recovery
  mechanism.

- **Persistent sessions.** Supabase's RN client with AsyncStorage already
  persists sessions by default — we just need to not call `signOut()` on app
  close, and set a long session lifetime. Session refresh tokens handle the rest.
  Current `auth.autoRefreshToken: true` is already on.

- **Username (display name).** Separate from email. Collected at signup, stored
  in `pro_profiles.display_name`. Shown on map pins and in the dashboard as the
  contributor attribution. Unique constraint recommended.

- **Profile screen.** Basic account management: change password, update display
  name, set alert radius, toggle notification preferences, sign out.

## Other captured notes

- **Check in on the queued EAS dev build.** An Android development client
  was queued on the free tier on 2026-04-19 from `apps/field-native`
  (build URL stored in the terminal history; can also look up via
  `pnpm exec eas build:list`). Once it completes, download the APK,
  sideload, and run `pnpm app:dev-client` to verify push delivery
  end-to-end. Commit placeholder app icons (currently commented out
  in `app.config.ts`) before building for production.

- **Unified damage + outage map.** Today there are two separate screens
  (`/map` and `/outages`) each with their own pin style and filter
  chips. A single map showing both layers is a better UX — one view,
  toggle chips to include/exclude damage and outage markers. Keeps the
  diamond-vs-circle pin distinction so they're visually different at
  a glance. Ideally the filter bar becomes: [Damage] [Outages] |
  [damage-type chips] | [service-type chips] | [company/provider
  chips from combined results]. Probably replaces both current
  screens with a single `/incidents` or similar.

---

## Working order suggestion

Session 2 (map view) should probably tackle:
1. Nearby reports map with visual parity (no filters yet)
2. Filter by damage type
3. Split/list/map view toggle

Session 3 (pro features) should tackle:
1. Username+password auth replacing magic link
2. Persistent sessions
3. Proximity push alerts (previously planned)
4. Profile screen

Session 4 (capture flow polish) should tackle:
1. Gallery upload alternative
2. Additional photos
3. Damage type icons (ties into icon system shared with map pins)
4. Manual location + map pin picker

Service-type-vs-damage-type schema question should be resolved BEFORE the map
work starts so we don't rebuild the pin renderer twice.
