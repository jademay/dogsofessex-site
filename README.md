# Dogs of Essex

The local guide for dog owners in Essex — walks, cafés, pubs, beaches and adventures
for Essex dogs and their humans. *Think "Time Out meets AllTrails for Essex dog owners."*

## Brand feel
Warm · outdoorsy · local · trustworthy · practical · premium without being fancy.
Large landscape photography, earthy colours, lots of breathing space, real dog photos,
easy-to-scan information. **No cartoon dogs or bright paw prints everywhere.**

## Structure
```
index.html              Homepage (hand-authored)
data/
  walks.json            The walks "database" — one entry per walk
  places.json           Dog-friendly places (cafés, pubs, beaches…)
  tips.json             Community tips, keyed by walkId
build.js                Bakes the data into static walk pages
walks/                  GENERATED walk pages — do not edit by hand
  tiptree-heath.html    (output of build.js)
styles.css              Shared stylesheet + design system (CSS variables at top)
script.js               Footer year, mobile nav, newsletter handler
walk.js                 Walk-page interactivity (carousel, save/share)
.github/workflows/      Auto-rebuild pages when data changes (optional)
```

## Data-driven pages
Walk pages are **generated** from `data/walks.json` by `build.js`. Each section —
hero, at-a-glance, gallery, route, what-to-expect, SEO, plus the auto-computed
"Make a Day of It" (from `places.json`), "Explore Nearby" (from `walks.json`) and
community tips (from `tips.json`) — is baked into real HTML so it's fast and
SEO-friendly. `walk.js` then only adds interactivity on top.

### Build
```bash
node build.js        # or: npm run build
```
This writes `walks/<id>.html` for every walk with `"hasPage": true`.
Re-run after editing any file in `data/`. The build is deterministic.

> If the GitHub Action is enabled, editing `data/*.json` on GitHub rebuilds the
> pages automatically — no local build needed.

## Adding a new walk
1. Add an entry to `data/walks.json` (set `"hasPage": true`, fill in the fields —
   copy the Tiptree Heath entry as a model).
2. Run `node build.js` (or push the data change and let the Action build).
3. Add a featured/linked card on `index.html` if you want it on the homepage.

## Adding a place / tip
Add an object to `data/places.json` or `data/tips.json` and rebuild — it appears
on every nearby walk page automatically.

## Photography
Image areas currently use styled placeholders labelled with what belongs there
(e.g. "Photo: Poppy in the bluebells"). Replace these with real landscape photos —
for the hero/walk hero, set a `background-image` on the `.hero` / `.walk-hero`
element; for cards, swap `.photo-ph` for an `<img>`.

## Design tokens
Colours and fonts are defined as CSS variables at the top of `styles.css`
(forest green primary, terracotta accent, warm cream/sand backgrounds; Fraunces +
Inter typefaces).

## Roadmap
- **Year 1:** 20–30 walks, Instagram, newsletter, some cafés/pubs.
- **Year 2:** meetups, local business listings, sponsored features, affiliate links.
- **Year 3:** the site Essex dog owners check before deciding their weekend.

## Local preview
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```
