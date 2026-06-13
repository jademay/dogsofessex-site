# Dogs of Essex

The local guide for dog owners in Essex — walks, cafés, pubs, beaches and adventures
for Essex dogs and their humans. *Think "Time Out meets AllTrails for Essex dog owners."*

## Brand feel
Warm · outdoorsy · local · trustworthy · practical · premium without being fancy.
Large landscape photography, earthy colours, lots of breathing space, real dog photos,
easy-to-scan information. **No cartoon dogs or bright paw prints everywhere.**

## Structure
```
index.html              Homepage (hero, featured walks, categories, best-for,
                        meetups, places, newsletter, footer)
walks/                  Individual walk pages
  tiptree-heath.html    Fully-built example — use as the template for new walks
styles.css              Shared stylesheet + design system (CSS variables at top)
script.js               Footer year, mobile nav, newsletter handler
```

## Adding a new walk
1. Copy `walks/tiptree-heath.html` to `walks/your-walk.html`.
2. Update the title, intro, quick facts, "best for", facilities, write-up and the
   Google Map `q=` query.
3. Add a featured/linked card on `index.html` pointing to the new file.

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
