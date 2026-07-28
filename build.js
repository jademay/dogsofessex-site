/* ===========================================================
   build.js - bakes the data layer into static walk pages.

   Reads data/walks.json, data/places.json, data/tips.json and writes
   a fully-rendered walks/<id>.html for every walk with "hasPage": true.
   The content is real HTML (good for SEO); walk.js then adds only
   interactivity (carousel, save/share) on top.

   Run:  node build.js   (or: npm run build)
   Zero dependencies - plain Node.
   =========================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'walks');

// Cache-busting asset versions (content hash) so updated CSS/JS reach browsers.
// Content-based (not mtime) keeps the build deterministic across machines, so
// local and CI builds produce identical output.
const crypto = require('crypto');
const assetVer = (file) => {
    try {
        return crypto.createHash('sha256')
            .update(fs.readFileSync(path.join(ROOT, file)))
            .digest('hex').slice(0, 8);
    } catch (e) { return '1'; }
};
const V_CSS = assetVer('styles.css');
const V_JS = assetVer('script.js');
const V_WALK = assetVer('walk.js');

// --- Lucide icons (lucide.dev) ---
const ICONS = require('./icons.js');
const icon = (name) => ICONS[name] || '';
// Emoji -> Lucide name, for swapping emojis baked into the data (e.g. badges).
const EMOJI_ICON = {
    '📍': 'map-pin', '🐕': 'paw-print', '🦮': 'dog', '🚗': 'car', '👶': 'baby',
    '🌳': 'trees', '🌲': 'tree-pine', '⚓': 'anchor', '☕': 'coffee', '🚻': 'toilet',
    '🅿': 'square-parking', '🏖': 'parasol', '🏊': 'waves', '🌊': 'waves', '🐦': 'bird',
    '🦋': 'bird', '🚶': 'footprints', '🎨': 'palette', '🌿': 'leaf', '🌄': 'mountain',
    '🤫': 'feather', '🦌': 'binoculars', '💧': 'droplets', '🏛': 'landmark',
    '🚤': 'sailboat', '⛵': 'sailboat'
};
// Render a "📍 Label" badge string, swapping a leading emoji for its Lucide icon.
function badgeLabel(text) {
    const t = String(text == null ? '' : text).trim();
    const first = [...t][0];
    const name = first && EMOJI_ICON[first];
    if (!name) return esc(t);
    const rest = t.slice(first.length).replace(/^️/, '').trim();
    return icon(name) + ' ' + esc(rest);
}

// Tuning (keep in sync with the values documented on the site)
const DAY_RADIUS_MI = 10;          // partners/free shown within this radius (no count cap)
const NEARBY_WALK_RADIUS_MI = 25;
const NEARBY_WALK_MAX = 6;
const AVG_MPH = 26;
const ROAD_FACTOR = 1.25;

const TYPE_META = {
    cafe: { icon: icon('coffee'), label: 'Café' },
    pub: { icon: icon('beer'), label: 'Pub' },
    restaurant: { icon: icon('utensils'), label: 'Restaurant' },
    'garden-centre': { icon: icon('sprout'), label: 'Garden Centre' },
    beach: { icon: icon('waves'), label: 'Beach' },
    seaside: { icon: icon('waves'), label: 'Seaside' },
    'swim-spot': { icon: icon('waves'), label: 'Swim Spot' },
    attraction: { icon: icon('ferris-wheel'), label: 'Attraction' },
    shop: { icon: icon('shopping-bag'), label: 'Shop' },
    'dog-service': { icon: icon('dog'), label: 'Dog Service' },
    groomer: { icon: icon('scissors'), label: 'Dog Groomer' },
    vet: { icon: icon('stethoscope'), label: 'Vet' },
    daycare: { icon: icon('house'), label: 'Dog Daycare' },
    'dog-walker': { icon: icon('dog'), label: 'Dog Walker' }
};

// "Make a Day of It" categories, in display order. Each place type maps
// into one of these; anything unmatched falls into "More nearby".
const CATEGORIES = [
    { icon: icon('coffee'), label: 'Cafés nearby', types: ['cafe'] },
    { icon: icon('beer'), label: 'Pubs nearby', types: ['pub'] },
    { icon: icon('utensils'), label: 'Restaurants nearby', types: ['restaurant'] },
    { icon: icon('waves'), label: 'Swim spots nearby', types: ['beach', 'seaside', 'swim-spot'] },
    { icon: icon('shopping-bag'), label: 'Shops nearby', types: ['shop', 'garden-centre'] },
    { icon: icon('dog'), label: 'Dog services nearby', types: ['dog-service', 'groomer', 'vet', 'daycare', 'dog-walker'] }
];
// "At a glance" filter categories for the walks index (key -> data attribute)
const GLANCE_FILTERS = [
    { key: 'reactive', label: 'Reactive Dogs' },
    { key: 'puppies', label: 'Puppies' },
    { key: 'senior', label: 'Senior Dogs' },
    { key: 'pushchairs', label: 'Pushchairs' },
    { key: 'swimming', label: 'Swimming' },
    { key: 'offlead', label: 'Off Lead' },
    { key: 'shade', label: 'Shade' },
    { key: 'mud', label: 'Low Mud' }
];
const GLANCE_KEYS = Object.fromEntries(GLANCE_FILTERS.map((f) => [f.label, f.key]));

// "Best For" categories. Each ranks reviewed walks by `key` (a glance key)
// or, when `rank` is set, by a custom measure. Add new objects here and the
// /best-for grid + a curated /best-for/<slug>/ page appear automatically -
// no layout changes needed.
const BEST_FOR = [
    { slug: 'reactive-dogs', emoji: icon('dog'), title: 'Reactive Dogs', key: 'reactive',
        blurb: 'Quiet Essex walks with fewer surprises and more space.',
        intro: 'Looking for calmer walks? These routes tend to be quieter, with good visibility and room to create distance - so reactive dogs can relax and enjoy the sniffs.' },
    { slug: 'puppies', emoji: icon('baby'), title: 'Puppies', key: 'puppies',
        blurb: 'Shorter routes ideal for little legs and training.',
        intro: 'Short, manageable walks that suit little legs and growing bodies - with plenty of gentle new sights, sounds and smells for early socialisation and training.' },
    { slug: 'senior-dogs', emoji: icon('bone'), title: 'Senior Dogs', key: 'senior',
        blurb: 'Gentle walks suited to older dogs.',
        intro: 'Looking for gentler walks for older dogs? These routes offer shorter distances, easier terrain and plenty of opportunities for breaks.' },
    { slug: 'pushchairs', emoji: icon('baby'), title: 'Pushchairs', key: 'pushchairs',
        blurb: 'Buggy-friendly routes for families with little ones.',
        intro: 'Firm, even paths and gentle gradients make these walks easy to enjoy with a pushchair alongside the dog.' },
    { slug: 'swimming', emoji: icon('waves'), title: 'Swimming Dogs', key: 'swimming',
        blurb: 'Walks with opportunities for paddling or swimming.',
        intro: 'For dogs who love the water - these walks offer safe spots to paddle, splash and swim. Always check conditions and seasonal restrictions before letting your dog in.' },
    { slug: 'low-mud', emoji: icon('footprints'), title: 'Low Mud', key: 'mud',
        blurb: 'The driest routes for wet-weather walks.',
        intro: 'Best during wet weather - these are the firmer, better-drained routes that stay walkable when everywhere else turns to mud.' },
    { slug: 'hot-weather', emoji: icon('sun'), title: 'Hot Weather', key: 'shade',
        blurb: 'Shaded routes and water to keep dogs cool.',
        intro: 'Shaded, sheltered walks - often with water access - to help keep dogs cool and comfortable on warmer days. Always walk early or late and carry water in the heat.' },
    { slug: 'off-lead', emoji: icon('paw-print'), title: 'Off Lead', key: 'offlead',
        blurb: 'Safe spaces for dogs with reliable recall.',
        intro: 'Open, enclosed or quiet spaces suited to dogs with reliable recall. Always check local signage for livestock, ground-nesting birds and seasonal lead rules.' },
    { slug: 'high-energy', emoji: icon('zap'), title: 'High-Energy Dogs', rank: 'distance',
        blurb: 'Longer walks to burn off energy.',
        intro: 'Longer, more varied routes that give high-energy dogs the distance and stimulation they need to come home happily tired.' }
];

// The Senior Dogs rating scale, shown on the senior-dogs category page.
const SENIOR_SCALE = [
    { stars: 5, label: 'Excellent', note: 'Short, flat routes with resting opportunities.' },
    { stars: 4, label: 'Good', note: 'Suitable for most older dogs.' },
    { stars: 3, label: 'Moderate', note: 'Longer distances or uneven terrain.' },
    { stars: 2, label: 'Limited', note: 'May be tiring for some senior dogs.' },
    { stars: 1, label: 'Not recommended', note: 'Demanding routes unsuitable for most senior dogs.' }
];

const SCENERY_ICON = {
    woodland: icon('trees'), heathland: icon('leaf'), parkland: icon('trees'),
    coastal: icon('waves'), seaside: icon('waves'), park: icon('trees'), garden: icon('flower'), beach: icon('parasol'),
    riverside: icon('waves'), 'nature-reserve': icon('leaf'), countryside: icon('mountain')
};

// --- helpers ---
const toRad = (d) => (d * Math.PI) / 180;
function miles(a, b) {
    const R = 3958.8;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
const driveMins = (mi) => Math.max(3, Math.round((mi * ROAD_FACTOR) / AVG_MPH * 60));
const distLabel = (mi) => `${mi.toFixed(1)} mi · ~${driveMins(mi)} min`;
const distLine = (p) => `${p._mi.toFixed(1)} mi • ${driveMins(p._mi)} mins`;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// A walk may define multiple `routes` (each {name, distance, time, terrain?,
// notes?}) for one location. These derive the card/hero summary from them.
// The parsers cope with real-world strings - decimals, unicode fractions
// ("2¼ miles"), trailing "(3.4 km)", and "1 hour 20 minutes".
const FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
function parseMiles(s) {
    const m = /^(\d+(?:\.\d+)?)?\s*([¼½¾⅓⅔⅛])?/.exec(String(s == null ? '' : s).trim());
    if (!m || (m[1] == null && !m[2])) return null;
    return (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? FRACTIONS[m[2]] : 0);
}
function parseMinutes(s) {
    s = String(s == null ? '' : s).toLowerCase();
    let mins = 0, found = false;
    const h = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/.exec(s);
    if (h) { mins += parseFloat(h[1]) * 60; found = true; }
    const mm = /(\d+)\s*(?:minutes?|mins?|m)\b/.exec(s);
    if (mm) { mins += parseFloat(mm[1]); found = true; }
    if (!found) { const n = /(\d+(?:\.\d+)?)/.exec(s); if (n) { mins += parseFloat(n[1]); found = true; } }
    return found ? mins : null;
}
function rangeBy(values, parse) {
    const ns = values.map(parse).filter((v) => v != null);
    if (!ns.length) return null;
    return { min: Math.min(...ns), max: Math.max(...ns) };
}
const trimNum = (n) => (Math.round(n * 100) / 100).toString();
function milesLabel(walk) {
    if (walk.routes && walk.routes.length) {
        const r = rangeBy(walk.routes.map((x) => x.distance), parseMiles);
        if (r) return r.min === r.max ? `${trimNum(r.min)} miles` : `${trimNum(r.min)}-${trimNum(r.max)} miles`;
    }
    return walk.distance || '';
}
function timeLabel(walk, short) {
    if (walk.routes && walk.routes.length) {
        // Show the actual time strings of the shortest and longest routes
        // (e.g. "1hr 40 mins–3hrs 20 mins") rather than a raw minutes range.
        const timed = walk.routes
            .map((x) => ({ label: x.time, mins: parseMinutes(x.time) }))
            .filter((x) => x.label && x.mins != null);
        if (timed.length) {
            const lo = timed.reduce((a, b) => (b.mins < a.mins ? b : a));
            const hi = timed.reduce((a, b) => (b.mins > a.mins ? b : a));
            return lo.label === hi.label ? lo.label : `${lo.label}-${hi.label}`;
        }
    }
    return short ? (walk.timeShort || walk.time || '') : (walk.time || walk.timeShort || '');
}
// Numeric miles range for sorting. Returns { min, max } so "shortest" can sort
// on the lower bound and "longest" on the upper bound — across multiple routes
// or a single range distance like "0.8–1.5 miles".
function milesRange(walk) {
    if (walk.routes && walk.routes.length) {
        const r = rangeBy(walk.routes.map((x) => x.distance), parseMiles);
        if (r) return r;
    }
    // walk.distance may itself be a range; parse only the part before "mile(s)"
    // so the "(x km)" suffix is ignored.
    const beforeMile = String(walk.distance || '').split(/mile/i)[0];
    const parts = beforeMile.split(/[–—-]/).map(parseMiles).filter((v) => v != null);
    if (parts.length) return { min: Math.min(...parts), max: Math.max(...parts) };
    const f = parseFloat(walk.distance) || 0;
    return { min: f, max: f };
}

// Promotion is separate from quality. `partnerTier` (free | sponsored |
// partner, plus internal bronze/silver/gold that all read as a paid slot)
// only ever buys a small ranking boost and a tiny "Sponsored" label - every
// tier gets the exact same card. `doePick` is the editorial "Dogs of Essex
// Pick" badge: earned, never bought, and deliberately kept OUT of the ranking
// (Michelin-star logic - it changes perception, not the running order).
// `editorScore` (excellent | very-good | good | standard) is the recommendation
// signal that DOES feed the ranking.
const EXAMPLE_PLACEHOLDER = 'https://example.com';

// Which contact details each tier is allowed to show. Tune freely.
// `pick` is the fuller treatment used on venue detail pages.
const TIER_CONTACT = {
    pick: { phone: true, email: true, socials: true },
    partner: { phone: false, email: false, socials: true },
    sponsored: { phone: false, email: false, socials: true },
    free: { phone: false, email: false, socials: false }
};
const SOCIAL_LABELS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', twitter: 'X' };
const SOCIAL_ICONS = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6c-.8-.1-1.6-.15-2.4-.15-2.4 0-4.05 1.47-4.05 4.16v2.29H7.5V13h2.75v8h3.25z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 5.6a4.3 4.3 0 01-1-2.6h-2.9v11.4a2.1 2.1 0 11-2.1-2.1c.2 0 .4 0 .6.1V9.5a5 5 0 00-.6 0 5 5 0 105 5V8.7a7.1 7.1 0 004 1.2V7a4.3 4.3 0 01-3-1.4z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22 12c0-1.7-.2-3.3-.4-4a2.5 2.5 0 00-1.7-1.7C18.3 6 12 6 12 6s-6.3 0-7.9.3A2.5 2.5 0 002.4 8c-.2.7-.4 2.3-.4 4s.2 3.3.4 4a2.5 2.5 0 001.7 1.7c1.6.3 7.9.3 7.9.3s6.3 0 7.9-.3a2.5 2.5 0 001.7-1.7c.2-.7.4-2.3.4-4zM10 15V9l5 3-5 3z"/></svg>',
    twitter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>'
};

// Dog-access chips (premium card). Add keys as needed.
const ACCESS_META = {
    inside: { icon: icon('house'), label: 'Dogs inside' },
    outside: { icon: icon('trees'), label: 'Dogs outside' },
    garden: { icon: icon('trees'), label: 'Garden' },
    'water-bowls': { icon: icon('droplets'), label: 'Water bowls' },
    'dog-menu': { icon: icon('bone'), label: 'Dog menu' },
    treats: { icon: icon('cookie'), label: 'Treats available' },
    'off-lead': { icon: icon('paw-print'), label: 'Off-lead area' }
};

// "Places" categories. Each gathers dog-friendly venues whose `type` is in
// `types`; partner/featured venues become "Dogs of Essex Picks" with their own
// venue page, free venues become "More nearby" pills. Add a category here and a
// /places/<slug>/ page (plus venue pages) appear automatically.
const PLACE_CATEGORIES = [
    { slug: 'eat-drink', emoji: icon('coffee'), title: 'Eat & Drink', plural: 'places to eat & drink',
        image: 'eat-drink.webp',
        types: ['cafe', 'pub', 'restaurant'],
        blurb: 'Grab lunch, coffee or a pint after your walk.',
        cta: 'Explore eat & drink →',
        intro: 'All the dog-friendly places to eat and drink near your walk - cafés, pubs and restaurants. Use the filters to narrow it down.',
        filters: [
            { type: 'all', label: 'All' },
            { type: 'cafe', label: 'Cafés' },
            { type: 'pub', label: 'Pubs' },
            { type: 'restaurant', label: 'Restaurants' }
        ] },
    { slug: 'things-to-do', emoji: icon('compass'), title: 'Things to Do', plural: 'things to do',
        soon: true, image: 'thingstodo.webp', imgPos: 'center 20%',
        types: ['attraction', 'garden-centre', 'shop'],
        blurb: 'Make a full day of it.',
        cta: 'Explore things to do →',
        intro: 'Dog-friendly days out beyond a walk - garden centres, National Trust properties, estates, country parks, markets, farm shops and seasonal attractions.' },
    // Beaches deliberately omitted from Places — coastal spots live on the
    // Walks side and get added there as more are visited.
    { slug: 'stay', emoji: icon('bed-double'), title: 'Stay', comingSoon: true,
        image: 'stay.webp', imgPos: 'center 68%',
        blurb: 'Dog-friendly places to stay across Essex.',
        cta: 'Coming soon' }
];

// Resolve a place's tier to `free`, `sponsored` or `partner`. Legacy values
// are mapped, internal levels collapse to a paid slot, and any paid tier whose
// featuredUntil has passed drops back to free.
function effectiveTier(p) {
    let tier = p.partnerTier || 'free';
    if (tier === 'premium' || tier === 'featured') tier = 'sponsored';
    if (tier === 'bronze' || tier === 'silver' || tier === 'gold') tier = 'partner';
    if (tier === 'none') tier = 'free';
    if (tier !== 'free' && p.featuredUntil) {
        const until = Date.parse(p.featuredUntil);
        if (!isNaN(until) && until < Date.now()) tier = 'free';
    }
    return (tier === 'sponsored' || tier === 'partner') ? tier : 'free';
}
// Any paid tier. All paid tiers look identical to the visitor ("Sponsored").
const isPaid = (p) => effectiveTier(p) !== 'free';

// --- Ranking -------------------------------------------------------------
// Final score = distance (dominant) + editor recommendation + a small, bounded
// sponsor boost. Distance is 10 pts/mile within the cap, so the +5 sponsor
// boost is worth ~half a mile: enough to nudge a sponsor up a place or two, but
// it can NEVER leapfrog somewhere significantly closer and better recommended,
// and no boost can lift an awful/distant place near the top. `doePick` is
// intentionally absent - it is a badge, not a lever.
const RANK_DIST_CAP_MI = 10;
const EDITOR_POINTS = { excellent: 12, 'very-good': 8, good: 4, standard: 0 };
const SPONSOR_BOOST = 5;

function editorKey(p) {
    const k = String(p.editorScore || 'standard').toLowerCase().replace(/\s+/g, '-');
    return EDITOR_POINTS[k] != null ? k : 'standard';
}
const editorPoints = (p) => EDITOR_POINTS[editorKey(p)];

// mi may be null/undefined (unknown distance) - treated as the cap (0 pts).
function rankScore(p, mi) {
    const d = (mi == null || isNaN(mi)) ? RANK_DIST_CAP_MI : mi;
    const distScore = Math.max(0, 100 - (Math.min(d, RANK_DIST_CAP_MI) / RANK_DIST_CAP_MI) * 100);
    return distScore + editorPoints(p) + (isPaid(p) ? SPONSOR_BOOST : 0);
}

// The PLACE_CATEGORIES entry a place belongs to (drives its detail-page URL).
function placeCategoryOf(p) {
    return PLACE_CATEGORIES.find((c) => !c.comingSoon && (c.types || []).includes(p.type)) || null;
}
// Root-relative URL of a place's detail page, or '' if its type has no category.
function venueHref(p, prefix) {
    const c = placeCategoryOf(p);
    return c ? `${prefix || ''}places/${c.slug}/${p.id}/index.html` : '';
}

// Tiny corner labels. Every paid tier reads simply "Sponsored" (internal
// bronze/silver/gold is never surfaced). The Pick is editorial only.
function tierNoteHTML(p) {
    return isPaid(p) ? '<span class="tier-note tier-sponsored">Sponsored</span>' : '';
}
function pickTagHTML(p) {
    return p.doePick ? '<span class="tier-note tier-pick">★ Dogs of Essex Pick</span>' : '';
}
function cardLabelsHTML(p) {
    // The "Sponsored" note now sits on the title line (see placeCardHTML); this
    // corner row is just the editorial Pick badge.
    const labels = pickTagHTML(p);
    return labels ? `\n                                    <div class="card-labels">${labels}</div>` : '';
}
// Sort/filter data attributes shared by every place card (client re-ranking
// recomputes distance + score from data-lat/lng + data-editor + data-boost).
function rankAttrs(p, opts) {
    const mi = opts.mi;
    return ` data-dist="${mi != null && !isNaN(mi) ? mi.toFixed(2) : 9999}"`
        + ` data-editor="${editorPoints(p)}" data-boost="${isPaid(p) ? SPONSOR_BOOST : 0}"`
        + ` data-score="${rankScore(p, mi).toFixed(2)}" data-order="${opts.order || 0}"`
        + ` data-added="${esc(p.added || p.lastChecked || '')}"`
        + ` data-name="${esc((p.name || '').toLowerCase())}"`
        + ` data-access="${esc((p.dogAccess || []).join(' '))}"`;
}
function placeUrl(p) {
    return (p.website && p.website !== '#' && p.website !== EXAMPLE_PLACEHOLDER) ? p.website : '';
}

// Google Maps link that opens the business listing. Prefer an exact share
// link (mapsLink); otherwise search by name + address.
function mapsUrl(p) {
    if (p.mapsLink) return p.mapsLink;
    const q = p.address ? `${p.name}, ${p.address}` : `${p.name}, Essex, UK`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return esc(iso || '');
    return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
function formatMonthYear(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return esc(iso || '');
    return `${MONTHS_FULL[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

// Dog-friendly note (e.g. "Dogs welcome indoors and outside.")
function dogNoteHTML(p) {
    return p.dogFriendlyNotes
        ? `\n                                <span class="dog-note">${icon('dog')} ${esc(p.dogFriendlyNotes)}</span>` : '';
}

// Dog-access chips from a structured dogAccess array (pick card)
function accessHTML(p) {
    const items = p.dogAccess || [];
    if (!items.length) return '';
    const chips = items.map((k) => {
        const m = ACCESS_META[k] || { icon: icon('paw-print'), label: k };
        return `<span class="access-chip">${m.icon} ${esc(m.label)}</span>`;
    }).join('');
    return `\n                                    <div class="premium-access">${chips}</div>`;
}

// A few compact dog tags for partner cards (up to `max`)
function dogTagsHTML(p, max) {
    const items = (p.dogAccess || []).slice(0, max || 4);
    if (!items.length) return '';
    const chips = items.map((k) => {
        const m = ACCESS_META[k] || { icon: icon('paw-print'), label: k };
        return `<span class="access-chip">${m.icon} ${esc(m.label)}</span>`;
    }).join('');
    return `\n                                <div class="pc-tags">${chips}</div>`;
}

// Verification / freshness line (who checked it and when)
function verifyHTML(p) {
    if (!p.verified) return '';
    const by = p.checkedBy ? ` by ${esc(p.checkedBy)}` : '';
    const when = p.lastChecked ? ` • ${formatMonthYear(p.lastChecked)}` : '';
    return `\n                                <span class="place-verify">${icon('circle-check')} Last checked${by}${when}</span>`;
}

// Distance + drive time as chips (premium card)
function distChipsHTML(p) {
    return `<div class="info-chips">
                                        <span class="access-chip">${icon('map-pin')} ${p._mi.toFixed(1)} miles</span>
                                        <span class="access-chip">${icon('car')} ${driveMins(p._mi)} mins</span>
                                    </div>`;
}

// Contact block - only the details this place's tier is allowed to show.
function contactHTML(p, tier) {
    tier = tier || p._tier || effectiveTier(p);
    const show = TIER_CONTACT[tier] || TIER_CONTACT.free;
    const bits = [];
    if (show.phone && p.phone) {
        bits.push(`<a class="contact-link" href="tel:${esc(p.phone.replace(/\s+/g, ''))}">${icon('phone')} ${esc(p.phone)}</a>`);
    }
    if (show.email && p.email) {
        bits.push(`<a class="contact-link" href="mailto:${esc(p.email)}">${icon('mail')} ${esc(p.email)}</a>`);
    }
    let icons = '';
    if (show.socials && p.socials) {
        const links = Object.keys(SOCIAL_ICONS).map((key) => {
            const url = p.socials[key];
            return url
                ? `<a class="social-icon" href="${esc(url)}" target="_blank" rel="noopener" aria-label="${SOCIAL_LABELS[key]}">${SOCIAL_ICONS[key]}</a>`
                : '';
        }).join('');
        if (links) icons = `<span class="social-icons">${links}</span>`;
    }
    if (!bits.length && !icons) return '';
    return `\n                                <div class="place-contact">${bits.join('')}${icons}</div>`;
}
function starsHTML(score) {
    const s = Math.max(0, Math.min(5, Math.round(score) || 0));
    return `<span class="on">${'★'.repeat(s)}</span><span class="off">${'☆'.repeat(5 - s)}</span>`;
}
const walkHref = (w) => (w.hasPage ? `/walks/${w.id}.html` : '/#walks');

// --- section renderers (return HTML strings) ---

function heroHTML(walk) {
    const rating = walk.rating || {};
    const pct = rating.value ? Math.round((rating.value / 5) * 1000) / 10 : 0;
    const metaLine = [cap((walk.scenery || '').replace(/-/g, ' ')), walk.routeType, timeLabel(walk, true), walk.mud ? 'Mud: ' + walk.mud : '']
        .filter(Boolean).join(' • ');
    const badges = (walk.badges || []).map((b) => `<span class="chip">${badgeLabel(b)}</span>`).join('');
    const ratingBlock = rating.value ? `
                <div class="walk-rating">
                    <span class="star-track" aria-hidden="true"><span class="fill" style="width:${pct}%"></span></span>
                    <span class="rating-score">${esc(rating.value)}</span>
                    <span class="rating-count">Dogs of Essex score</span>
                </div>` : '';
    return `
                <h1>${esc(walk.name)}</h1>${ratingBlock}
                ${metaLine ? `<p class="meta-line">${esc(metaLine)}</p>` : ''}
                ${badges ? `<div class="walk-chips">${badges}</div>` : ''}`;
}

// Asset #1 of 3: a static route-overview image shown near the top of the page
// (also used as the social/OG share image). Self-removes if the file is missing.
function routeOverviewHTML(walk) {
    if (!walk.routeImage) return '';
    return `
            <div class="container narrow">
                <figure class="route-overview">
                    <img src="../${esc(walk.routeImage)}" alt="Route overview map of ${esc(walk.name)}" loading="eager" onerror="this.closest('.route-overview').remove()">
                </figure>
            </div>`;
}

// What each 1–5 score means per category (index 0 = 1 star … index 4 = 5 stars).
const RATING_SCALES = {
    'Reactive Dogs': [
        'Busy, narrow paths, dogs everywhere',
        'Often busy, few escape routes',
        'Mixed, depends on time of day',
        'Generally quiet with space to move away',
        'Excellent visibility and lots of space'
    ],
    'Puppies': [
        'Long, difficult, overwhelming',
        'Not ideal for young dogs',
        'Fine with breaks',
        'Great starter walk',
        'Perfect for puppies'
    ],
    'Senior Dogs': [
        'Long and strenuous - tough for older dogs',
        'Some demanding stretches or rough ground',
        'Doable at a gentle pace, with a few harder bits',
        'Mostly easy going with places to rest',
        'Short, flat and gentle - perfect for seniors'
    ],
    'Pushchairs': [
        'Impossible',
        'Some sections manageable',
        'Mostly accessible',
        'Easy with care',
        'Fully accessible'
    ],
    'Swimming': [
        'No water',
        'Water but difficult access',
        'Small streams/seasonal water',
        'Good swimming spots',
        'Destination for water-loving dogs'
    ],
    'Off Lead': [
        'Lead essential',
        'Very few opportunities',
        'Some suitable areas',
        'Mostly suitable with recall',
        'Excellent off-lead freedom'
    ],
    'Shade': [
        'Completely exposed',
        'Limited shade',
        'Some shaded stretches',
        'Mostly shaded',
        'Woodland cover throughout'
    ],
    'Low Mud': [
        'Bring a towel and spare clothes',
        'Expect muddy paws most of the year',
        'Mud after rain',
        'Occasional puddles',
        'Trainers stay clean'
    ]
};

function glanceHTML(items, explain) {
    if (!items || !items.length) return '';
    return items.map((row) => {
        const scale = explain && RATING_SCALES[row.label];
        const display = row.label === 'Low Mud' ? 'Mud' : row.label;
        const feature = scale
            ? `<button type="button" class="glance-feature gl-toggle" aria-expanded="false">${esc(display)}</button>`
            : `<span class="glance-feature">${esc(display)}</span>`;
        const explainBlock = scale ? `
                            <div class="glance-explain" hidden>
                                <p class="glance-explain-title">How we rate this</p>
                                <ul class="glance-scale">${scale.map((d, i) => `
                                    <li><span class="gs-stars">${starsHTML(i + 1)}</span> ${esc(d)}</li>`).join('')}
                                </ul>
                            </div>` : '';
        return `
                        <div class="glance-item">
                            <div class="glance-row">
                                ${feature}
                                <span class="glance-stars">${starsHTML(row.score)}</span>
                            </div>${explainBlock}
                        </div>`;
    }).join('');
}

function galleryHTML(items) {
    if (!items || !items.length) return '';
    return items.map((g, i) => {
        const big = i === 0 ? ' g-big' : '';
        const c = esc(g.caption || '');
        // Always give the image descriptive alt text, even when the (optional)
        // visible caption is blank.
        const alt = esc(g.caption || g.alt || '');
        if (g.image) {
            return `
                        <figure class="photo-ph g-item${big}">
                            <img src="${esc(g.image)}" alt="${alt}" loading="lazy" onerror="this.remove();this.parentNode.classList.add('noimg')">
                            <figcaption>${c}</figcaption>
                        </figure>`;
        }
        return `
                        <figure class="photo-ph g-item noimg${big}"><figcaption>${c}</figcaption></figure>`;
    }).join('');
}

// Colours for the little route dots, cycled by card index.
const ROUTE_DOT_COLORS = ['#1F5A44', '#BC6A48', '#3C7D4E', '#C9972B', '#5E6E54', '#A2583A', '#2C382E'];

// Turn a GPX file's track into a compact inline SVG route-line preview at build
// time - crisp and dependency-free (no runtime map needed in the card).
function routeLineSVG(gpxFile) {
    if (!gpxFile) return '';
    let xml;
    try { xml = fs.readFileSync(path.join(ROOT, gpxFile), 'utf8'); } catch (e) { return ''; }
    const pts = [];
    const re = /<trkpt[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"/g;
    let m;
    while ((m = re.exec(xml))) pts.push([parseFloat(m[2]), parseFloat(m[1])]); // [lon, lat]
    if (pts.length < 2) return '';
    const meanLat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const k = Math.cos(meanLat * Math.PI / 180);
    const xs = pts.map((p) => p[0] * k), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const W = 100, H = 60, pad = 8;
    const sx = (maxX - minX) || 1e-9, sy = (maxY - minY) || 1e-9;
    const scale = Math.min((W - 2 * pad) / sx, (H - 2 * pad) / sy);
    const ox = (W - sx * scale) / 2, oy = (H - sy * scale) / 2;
    const step = Math.max(1, Math.floor(pts.length / 90));
    const poly = [];
    for (let i = 0; i < pts.length; i += step) {
        poly.push((ox + (xs[i] - minX) * scale).toFixed(1) + ',' + (oy + (maxY - ys[i]) * scale).toFixed(1));
    }
    return `<svg class="route-line" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><polyline points="${poly.join(' ')}" fill="none" stroke="#1F5A44" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function routePlaceholderSVG() {
    return `<svg class="route-line route-line-ph" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="M12 46 Q32 14 52 34 T90 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="3 5" stroke-linecap="round"/></svg>`;
}

// Normalise a walk into a list of route objects for the cards.
function routeList(walk) {
    if (walk.routes && walk.routes.length) {
        return walk.routes.map((r, i) => ({
            name: r.name || ('Route ' + (i + 1)),
            distance: r.distance || '', time: r.time || '',
            routeType: r.routeType || '', notes: r.notes || '',
            gpxFile: r.gpxFile || '', bestCarPark: r.bestCarPark || ''
        }));
    }
    return [{
        name: '', distance: walk.distance || '', time: walk.timeShort || walk.time || '',
        routeType: walk.routeType || '', notes: '', gpxFile: walk.gpxFile || ''
    }];
}

function routeCardHTML(route, i, walk) {
    const color = ROUTE_DOT_COLORS[i % ROUTE_DOT_COLORS.length];
    const gpx = route.gpxFile ? `../${esc(route.gpxFile)}` : '';
    const bestPark = route.bestCarPark ? ` data-bestpark="${esc(route.bestCarPark)}"` : '';
    const previewHTML = gpx
        ? `<div class="route-card-preview route-card-map" data-gpx="${gpx}" data-name="${esc(route.name || walk.name)}"${bestPark}>${routeLineSVG(route.gpxFile)}</div>`
        : `<div class="route-card-preview is-empty">${routePlaceholderSVG()}</div>`;
    const meta = [route.distance, route.time].filter(Boolean).join(' • ');
    const link = gpx
        ? `<button type="button" class="route-card-link" data-gpx="${gpx}" data-name="${esc(route.name || walk.name)}"${bestPark}>View route →</button>`
        : `<a class="route-card-link" href="https://www.google.com/maps?q=${walk.lat},${walk.lng}" target="_blank" rel="noopener">View location →</a>`;
    return `
                        <article class="route-card">
                            ${previewHTML}
                            <div class="route-card-body">
                                ${route.name ? `<h3 class="route-card-name"><span class="route-dot" style="background:${color}"></span>${esc(route.name)}</h3>` : ''}
                                ${meta ? `<p class="route-card-meta">${esc(meta)}</p>` : ''}
                                ${route.routeType ? `<p class="route-card-type">${esc(route.routeType)}</p>` : ''}
                                ${route.bestCarPark ? `<p class="route-card-park">${icon('square-parking')} <span>Best car park: ${esc(route.bestCarPark)}</span></p>` : ''}
                                ${route.notes ? `<p class="route-card-notes">${esc(route.notes)}</p>` : ''}
                                ${link}
                            </div>
                        </article>`;
}

function walkRoutesInner(walk) {
    const routes = routeList(walk);
    if (!routes.length) return '';
    const heading = routes.length > 1 ? 'Walk Routes' : 'Walk Route';
    return `<h2>${icon('map')} ${heading}</h2>
                    <div class="route-carousel">${routes.map((r, i) => routeCardHTML(r, i, walk)).join('')}
                    </div>`;
}

// Car parks with coordinates, exposed for the route map to drop pins.
function carParksScript(walk) {
    const r = walk.route || {};
    const cps = (Array.isArray(r.carParks) ? r.carParks : [])
        .filter((cp) => cp && cp.name && cp.lat != null && cp.lng != null)
        .map((cp) => ({ name: cp.name, lat: cp.lat, lng: cp.lng, recommended: !!cp.recommended }));
    return cps.length ? ` window.WALK_CARPARKS = ${JSON.stringify(cps)};` : '';
}

function gettingThereInner(walk) {
    const r = walk.route || {};
    const parts = [];
    const carParks = Array.isArray(r.carParks) ? r.carParks.filter((cp) => cp && cp.name) : [];
    if (carParks.length) {
        // "Recommended" only means something when there's a choice - with a single
        // car park it isn't shown, even if the data marks it recommended.
        const multiCp = carParks.length > 1;
        // Cards say it all - the parking blurb is intentionally not shown here.
        parts.push(`<div class="car-park-cards">${carParks.map((cp, i) =>
            `<div class="cp-card${cp.recommended && multiCp ? ' is-recommended' : ''}" data-cp-name="${esc(cp.name)}">
                        <div class="cp-card-head">
                            <span class="cp-num">${i + 1}</span>
                            ${icon('square-parking')}
                            <span class="cp-card-name" title="${esc(cp.name)}">${esc(cp.name)}</span>${cp.recommended && multiCp ? `
                            <span class="cp-rec" title="Recommended" aria-label="Recommended">★</span>` : ''}
                            <a class="cp-card-maps" href="https://www.google.com/maps/search/?api=1&query=${cp.lat},${cp.lng}" target="_blank" rel="noopener" aria-label="Open ${esc(cp.name)} in Google Maps" title="Open in Google Maps">↗</a>
                        </div>${cp.info ? `
                        <p class="cp-card-info">${esc(cp.info)}</p>` : ''}
                    </div>`
        ).join('')}</div>`);
    } else if (r.parking) {
        parts.push(`<p class="parking-lead">${esc(r.parking)}</p>`);
    }
    // Car parks with coordinates -> interactive multi-pin car-park map. Otherwise
    // a reliable Leaflet/OSM location map centred on the walk (an explicit custom
    // mapEmbed, if ever set, is still honoured as an iframe). We deliberately no
    // longer fall back to Google's keyless `output=embed`, which Google blocks.
    const mappedCarParks = carParks.filter((cp) => cp.lat != null && cp.lng != null);
    if (mappedCarParks.length) {
        const clickMsg = mappedCarParks.length === 1
            ? 'Click the car park above to open it in Google Maps'
            : 'Click a car park above to open it in Google Maps';
        parts.push(`<div class="carparks-map" id="carparks-map"></div>
                    <p class="carparks-map-link">${icon('map-pin')} ${clickMsg}</p>`);
    } else if (r.mapEmbed) {
        parts.push(`<div class="map-embed"><iframe src="${esc(r.mapEmbed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map to ${esc(walk.name)}"></iframe></div>`);
    } else if (walk.lat != null && walk.lng != null) {
        parts.push(`<div class="getting-there-map" id="getting-there-map" data-lat="${walk.lat}" data-lng="${walk.lng}"></div>
                    <p class="carparks-map-link"><a class="gt-maps-link" href="https://www.google.com/maps/search/?api=1&query=${walk.lat},${walk.lng}" target="_blank" rel="noopener">${icon('map-pin')} Open this location in Google Maps</a></p>`);
    }
    if (!parts.length) return '';
    return `<h2>${icon('map-pin')} Getting there</h2>
                    ${parts.join('\n                    ')}`;
}

function whatToExpectHTML(paras) {
    if (!paras || !paras.length) return '';
    return paras.map((p) => `
                    <p>${esc(p)}</p>`).join('');
}

// Section inner content (no <section> wrapper - the band wrapper adds it).
// Optional sections return '' when they have no content.
function officialInner(walk) {
    const o = walk.official;
    if (!o || !o.managedBy) return '';
    const site = o.website
        ? `\n                        <li>${icon('globe')} <a href="${esc(o.website)}" target="_blank" rel="noopener">${esc(o.managedBy)} website →</a></li>`
        : '';
    return `<h2>Official Information</h2>
                    <p>Managed by ${esc(o.managedBy)}.</p>
                    <ul class="official-list">${site}
                        <li>${icon('triangle-alert')} Check for seasonal updates, conservation notices and temporary closures.</li>
                    </ul>`;
}

// Auto-discovered photos for a walk, from images/walks/<id>/ (sorted naturally
// so -img-1, -img-2 ... -img-10 order correctly). Returns paths relative to the
// site root; callers add any needed prefix. First image doubles as the hero.
function walkImages(walk) {
    const dir = path.join(ROOT, 'images', 'walks', walk.id);
    let files = [];
    try {
        files = fs.readdirSync(dir)
            .filter((f) => /\.(jpe?g|png|webp|avif|gif)$/i.test(f))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    } catch (e) { /* no folder yet - falls back to the gradient hero / no gallery */ }
    return files.map((f) => `images/walks/${walk.id}/${f}`);
}

function galleryInner(walk) {
    const imgs = walkImages(walk);
    if (!imgs.length) return '';
    // Optional captions, matched by order to walk.gallery[i].caption.
    const captions = (walk.gallery || []).map((g) => g.caption || '');
    const items = imgs.map((img, i) => ({ image: `../${img}`, caption: captions[i] || '', alt: captions[i] || `${walk.name} - photo ${i + 1}` }));
    return `<h2>${icon('camera')} Photo gallery</h2>
                    <p class="section-lead">See what it actually looks like before you go.</p>
                    <div id="gallery" class="carousel gallery-mosaic">
                        <button class="carousel-btn prev" type="button" aria-label="Previous photos">‹</button>
                        <div class="carousel-track">${galleryHTML(items)}
                        </div>
                        <button class="carousel-btn next" type="button" aria-label="More photos">›</button>
                    </div>
                    <hr class="section-divider">`;
}

function nextUpHTML(title) {
    return `<div class="next-up">
                        <span class="next-up-eyebrow">↓ Next up</span>
                        <span class="next-up-title">${esc(title)}</span>
                    </div>`;
}

function whatToExpectInner(walk) {
    if (!walk.whatToExpect || !walk.whatToExpect.length) return '';
    return `<h2>What to expect</h2>
                    <div id="what-to-expect">${whatToExpectHTML(walk.whatToExpect)}
                    </div>
                    ${nextUpHTML('Make a Day of It')}`;
}

// The one and only place card - used identically on walk pages, the places
// hub and category pages. Tier changes nothing here except the tiny "Sponsored"
// label (and the editorial Pick badge); everyone gets photo, description, dog
// badges, distance and the same actions. Callers pass the right detail-page URL
// and distance label for their context.
//   opts: { mi, order, cat, detailHref, distText }
function placeCardHTML(p, opts) {
    opts = opts || {};
    const meta = TYPE_META[p.type] || { icon: icon('map-pin'), label: p.type };
    const web = placeUrl(p);
    const detail = opts.detailHref;
    const distText = opts.distText != null
        ? opts.distText
        : (opts.mi != null && !isNaN(opts.mi) ? `${opts.mi.toFixed(1)} mi • ${driveMins(opts.mi)} mins` : '');
    const cat = opts.cat ? ` data-cat="${esc(opts.cat)}"` : '';
    const photo = p.image
        ? `\n                                    <div class="place-card-photo photo-ph"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.closest('.place-card-photo').remove()"></div>`
        : '';
    const actions = [
        detail ? `<a class="pc-cta" href="${esc(detail)}"><span class="cta-long">View details →</span><span class="cta-short">Details</span></a>` : '',
        web ? `<a class="pc-cta" href="${esc(web)}" target="_blank" rel="noopener"><span class="cta-long">Visit website ↗</span><span class="cta-short">Website</span></a>` : '',
        `<a class="pc-map" href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">${icon('map-pin')}<span class="cta-long"> Go to map</span><span class="cta-short"> Map</span></a>`
    ].filter(Boolean).join('\n                                            ');
    return `
                                <article class="place-card day-card${opts.extraClass || ''}" data-place-type="${esc(p.type)}"${cat} data-lat="${p.lat}" data-lng="${p.lng}"${rankAttrs(p, opts)}>${cardLabelsHTML(p)}${photo}
                                    <div class="place-card-body">
                                        <h3 class="pc-name">${meta.icon}<span class="pc-name-text">${esc(p.name)}</span>${tierNoteHTML(p)}</h3>
                                        ${distText ? `<span class="pc-dist place-dist">${distText}</span>` : ''}
                                        ${p.notes ? `<p class="pc-desc">${esc(p.notes)}</p>` : ''}${dogTagsHTML(p, 4)}
                                        <div class="pc-actions">
                                            ${actions}
                                        </div>
                                    </div>
                                </article>`;
}

function dayHTML(walk, places) {
    const origin = { lat: walk.lat, lng: walk.lng };

    const inRange = places
        .filter((p) => p.dogFriendly !== false && p.showOnWalkPages !== false)
        .map((p) => ({ ...p, _mi: miles(origin, { lat: p.lat, lng: p.lng }) }))
        .filter((p) => p._mi <= DAY_RADIUS_MI)
        // One flat list, best first: distance dominates, editor score and the
        // small sponsor boost fine-tune. Distance ties break by name.
        .sort((a, b) => rankScore(b, b._mi) - rankScore(a, a._mi) || a._mi - b._mi
            || (a.name || '').localeCompare(b.name || ''));

    if (!inRange.length) return '';

    // A short preview - the top 3 by our blended ranking, with up to 7 more (10
    // total) revealed by "Show more". Anything beyond that, plus filters, sort
    // and the map, lives on the places page via the "Browse all …" pill (which
    // only appears once the list has been expanded).
    const N = inRange.length;
    const cards = inRange.slice(0, 10)
        .map((p, i) => placeCardHTML(p, { mi: p._mi, order: i, detailHref: venueHref(p, '/'), distText: distLine(p), extraClass: i >= 3 ? ' day-extra' : '' }))
        .join('');

    const moreBtn = N > 3
        ? `\n                        <button type="button" class="day-more-toggle" aria-expanded="false">Show more ↓</button>` : '';
    const browseAll = N > 3
        ? `\n                        <a class="day-browse-all" href="/places/?near=${walk.lat},${walk.lng}&amp;walk=${encodeURIComponent(walk.name)}">Browse all ${N} nearby places (map included) →</a>` : '';

    const who = esc(walk.town || walk.name);
    return `
                    <h2>${icon('paw-print')} Make a Day of It</h2>
                    <p class="section-lead">Already heading to ${who}? These are the best nearby dog-friendly places to visit before or after your walk.</p>
                    <div class="day-explorer day-category">
                        <div class="day-list places-list">${cards}
                        </div>${moreBtn}${browseAll}
                    </div>`;
}

function exploreHTML(walk, walks) {
    const origin = { lat: walk.lat, lng: walk.lng };
    const nearby = walks
        .filter((w) => w.id !== walk.id)
        .map((w) => ({ ...w, _mi: miles(origin, { lat: w.lat, lng: w.lng }) }))
        .filter((w) => w._mi <= NEARBY_WALK_RADIUS_MI)
        .sort((a, b) => a._mi - b._mi)
        .slice(0, NEARBY_WALK_MAX);
    if (!nearby.length) return '';
    const cards = nearby.map((w) => {
        const sceneryIcon = SCENERY_ICON[w.scenery] || icon('paw-print');
        return `
                            <a href="${walkHref(w)}" class="walk-card nearby-card">
                                <div class="photo-ph">${walkPhotoHTML(w, '../')}</div>
                                <div class="walk-card-body">
                                    <h3>${esc(w.name)}</h3>
                                    <div class="nearby-meta">
                                        <span class="meta-badge">${icon('map-pin')} ${w._mi.toFixed(1)} mi</span>
                                        <span class="meta-badge">${icon('car')} ~${driveMins(w._mi)} min</span>
                                    </div>
                                    <span class="link-arrow">${w.hasPage ? 'Explore Walk →' : 'Coming soon'}</span>
                                </div>
                            </a>`;
    }).join('');
    return `
                    <h2>${icon('compass')} Explore Nearby</h2>
                    <p class="section-lead">Other dog-friendly walks within easy reach of ${esc(walk.name)}.</p>
                    <div class="carousel">
                        <button class="carousel-btn prev" type="button" aria-label="Scroll left">‹</button>
                        <div class="carousel-track">${cards}</div>
                        <button class="carousel-btn next" type="button" aria-label="Scroll right">›</button>
                    </div>`;
}

function tipsHTML(walkId, tips) {
    return tips.filter((t) => t.walkId === walkId).map((t) => `
                        <blockquote class="tip-card">${esc(t.tip)}${t.name ? `<cite>- ${esc(t.name)}</cite>` : ''}</blockquote>`).join('');
}

// --- shared chrome (parameterized by `prefix` = relative path to site root) ---

const BASE_URL = 'https://dogsofessex.co.uk';
const DEFAULT_OG_IMAGE = 'images/about/poppy.webp';

// Turn a path or URL into an absolute URL on the live domain.
function absUrl(u) {
    if (!u) return '';
    return /^https?:\/\//.test(u) ? u : BASE_URL + '/' + String(u).replace(/^\/+/, '');
}

// Canonical link + Open Graph + Twitter Card tags shared by every page.
// opts: { canonical (path), title, description, image (path/url), type }
function seoHead(opts) {
    opts = opts || {};
    const canonical = opts.canonical != null ? absUrl(opts.canonical) : '';
    const image = absUrl(opts.image) || absUrl(DEFAULT_OG_IMAGE);
    const type = opts.type || 'website';
    const t = esc(opts.title || '');
    const d = opts.description ? esc(opts.description) : '';
    return [
        canonical ? `<link rel="canonical" href="${canonical}">` : '',
        `<meta property="og:site_name" content="Dogs of Essex">`,
        `<meta property="og:locale" content="en_GB">`,
        `<meta property="og:type" content="${type}">`,
        `<meta property="og:title" content="${t}">`,
        d ? `<meta property="og:description" content="${d}">` : '',
        canonical ? `<meta property="og:url" content="${canonical}">` : '',
        `<meta property="og:image" content="${esc(image)}">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${t}">`,
        d ? `<meta name="twitter:description" content="${d}">` : '',
        `<meta name="twitter:image" content="${esc(image)}">`
    ].filter(Boolean).join('\n    ');
}

// Schema.org structured data for a walk page: the place itself + breadcrumbs.
function walkJsonLd(walk, description, imageUrl, pageUrl) {
    const place = {
        '@context': 'https://schema.org',
        '@type': 'TouristAttraction',
        name: walk.name,
        description: description || walk.summary || '',
        url: pageUrl
    };
    if (imageUrl) place.image = imageUrl;
    if (walk.lat != null && walk.lng != null) {
        place.geo = { '@type': 'GeoCoordinates', latitude: walk.lat, longitude: walk.lng };
    }
    place.address = {
        '@type': 'PostalAddress',
        addressLocality: walk.town || '',
        addressRegion: 'Essex',
        addressCountry: 'GB'
    };
    // Note: no aggregateRating here. Google's Review-snippet rich result only
    // supports a fixed allow-list of parent types and TouristAttraction is not
    // one of them, so nesting a rating triggers GSC's "Invalid object type for
    // field parent_node". The rating is still shown visually on the page.
    const crumbs = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL + '/' },
            { '@type': 'ListItem', position: 2, name: 'Walks', item: BASE_URL + '/walks/' },
            { '@type': 'ListItem', position: 3, name: walk.name, item: pageUrl }
        ]
    };
    const ld = (o) => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';
    return ld(place) + '\n    ' + ld(crumbs);
}

function headHTML(prefix, title, description, opts) {
    opts = opts || {};
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Analytics loads only after the visitor accepts (see script.js consent banner). -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${seoHead({ canonical: opts.canonical, title: title, description: description, image: opts.image, type: opts.type })}${opts.extra ? '\n    ' + opts.extra : ''}
    <!-- This page is generated by build.js - do not edit by hand. -->
    <link rel="icon" href="${prefix}favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="${prefix}favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="${prefix}favicon-16x16.png">
    <link rel="apple-touch-icon" href="${prefix}apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${prefix}styles.css?v=${V_CSS}">`;
}

// The mobile "Filter & sort" toggle button shared by the walks + places
// toolbars (collapses the controls behind it below 900px). `cls` selects the
// page's handler/CSS; `controlsId` is the collapsed region it controls.
function filterToggleHTML(cls, controlsId) {
    return `<button type="button" class="${cls}" aria-expanded="false" aria-controls="${controlsId}">
                        <span>Filter &amp; sort</span>
                        <svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </button>`;
}

function navHTML(prefix) {
    return `
    <header class="site-header">
        <div class="container">
            <nav class="nav">
                <a href="${prefix}index.html" class="logo">Dogs of Essex</a>
                <div class="nav-right">
                    <ul class="nav-links">
                        <li><a href="/walks/">Walks</a></li>
                        <li><a href="${prefix}best-for/index.html">Best For</a></li>
                        <li><a href="${prefix}places/index.html">Places</a></li>
                        <li><a href="${prefix}index.html#meetups">Meetups</a></li>
                        <li><a href="/saved/" class="nav-saved">${icon('heart')}<span>Saved</span></a></li>
                        <li><a href="${prefix}index.html#newsletter" class="nav-cta">Join the Pack</a></li>
                    </ul>
                    <button type="button" class="nav-search" aria-label="Search walks and places" aria-haspopup="dialog" hidden>${icon('search')}</button>
                    <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span class="nav-toggle-open">${icon('menu')}</span><span class="nav-toggle-close">${icon('x')}</span></button>
                </div>
            </nav>
        </div>
    </header>`;
}

function footerHTML(prefix) {
    return `
    <footer class="site-footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <a href="${prefix}index.html" class="logo">Dogs of Essex</a>
                    <p>The local guide for dog owners in Essex - walks, places and adventures worth sharing.</p>
                </div>
                <div class="footer-col">
                    <h4>Explore</h4>
                    <ul>
                        <li><a href="/walks/">Walks</a></li>
                        <li><a href="${prefix}best-for/index.html">Best For</a></li>
                        <li><a href="${prefix}places/index.html">Places</a></li>
                        <li><a href="/saved/">Saved</a></li>
                        <li><a href="${prefix}index.html#meetups">Meetups</a></li>
                    </ul>
                </div>
                <div class="footer-col">
                    <h4>Information</h4>
                    <ul>
                        <li><a href="${prefix}about.html">About</a></li>
                        <li><a href="${prefix}contact.html">Contact</a></li>
                        <li><a href="${prefix}privacy.html">Privacy Policy</a></li>
                        <li><a href="${prefix}terms.html">Terms of Use</a></li>
                        <li><button type="button" class="cookie-settings link-button">Cookie settings</button></li>
                    </ul>
                </div>
                <div class="footer-col footer-follow">
                    <h4>Follow</h4>
                    <ul>
                        <li><a href="https://instagram.com/dogsofessexuk" target="_blank" rel="noopener" aria-label="Instagram">${SOCIAL_ICONS.instagram}<span class="footer-social-label">Instagram</span></a></li>
                        <li><a href="https://facebook.com/dogsofessex" target="_blank" rel="noopener" aria-label="Facebook">${SOCIAL_ICONS.facebook}<span class="footer-social-label">Facebook</span></a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <span>&copy; <span id="year"></span> Dogs of Essex</span>
                <span>Made with muddy paws in Essex ${icon('paw-print')}</span>
            </div>
        </div>
    </footer>`;
}

// --- page assembly ---

function page(walk, walks, places, tips) {
    const seo = walk.seo || {};
    // First walk photo (if any) becomes the hero background behind the header.
    const heroImgs = walkImages(walk);
    // Optional per-walk vertical framing of the hero photo (CSS background-position
    // Y, e.g. "25%" or "top"). Lower % shows more of the top (sky); default centre.
    const heroPos = walk.heroFocus ? `;background-position:center ${esc(walk.heroFocus)}` : '';
    const heroAttrs = heroImgs.length
        ? ` has-photo" style="background-image:url('../${esc(heroImgs[0])}')${heroPos}"`
        : '"';
    const title = seo.title || `${walk.name} | Dogs of Essex`;
    const description = seo.description || walk.intro || '';
    const tipSubject = encodeURIComponent(`Walk tip: ${walk.name}`);
    // Prefer an explicit SEO image, then the first walk photo, then the route
    // overview image. Social platforms need an absolute URL.
    const ogImage = seo.image || (heroImgs.length ? heroImgs[0] : (walk.routeImage || ''));
    const canonicalPath = `walks/${walk.id}.html`;
    const og = seoHead({ canonical: canonicalPath, title: title, description: description, image: ogImage, type: 'article' })
        + '\n    ' + walkJsonLd(walk, description, absUrl(ogImage), absUrl(canonicalPath));
    // Leaflet is loaded on pages that have a GPX track, mapped car parks, or a
    // "Getting there" location map (any walk with coordinates).
    const needsMap = !!walk.gpxFile || (walk.routes || []).some(function (r) { return r.gpxFile; })
        || ((walk.route && walk.route.carParks) || []).some(function (cp) { return cp && cp.lat != null && cp.lng != null; })
        || (walk.lat != null && walk.lng != null);
    const mapHead = needsMap
        ? `\n    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">`
        : '';
    const mapScripts = needsMap
        ? `
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script src="https://unpkg.com/leaflet-gpx@1.7.0/gpx.js"></script>`
        : '';

    // Content bands - rendered in order, alternating background like the homepage.
    // Optional bands (gallery, what-to-expect, official) drop out when empty, and
    // the alternation re-computes so the stripes stay consistent.
    const localTip = (walk.route && walk.route.localTip)
        ? `<p class="local-tip">${icon('lightbulb')} <strong>Local tip:</strong> ${esc(walk.route.localTip)}</p>\n                    ` : '';
    const bands = [
        { narrow: true, html: `<p class="lead-intro" id="walk-intro">${esc(walk.intro || '')}</p>
                    ${localTip}<h2>At a glance</h2>
                    <p class="section-lead">Honest ratings, so you can decide in seconds whether it suits your dog.</p>
                    <button type="button" class="glance-explain-all" aria-expanded="false">How are these ratings decided?</button>
                    <div id="glance" class="glance">${glanceHTML(walk.glance, true)}
                    </div>` },
        (walkImages(walk).length) && { narrow: false, html: galleryInner(walk) },
        { narrow: true, html: walkRoutesInner(walk) },
        { narrow: true, html: gettingThereInner(walk) },
        (walk.whatToExpect && walk.whatToExpect.length) && { narrow: true, html: whatToExpectInner(walk) },
        { narrow: false, html: `<div id="make-a-day">${dayHTML(walk, places)}
                    </div>` },
        { narrow: false, html: `<div id="explore-nearby">${exploreHTML(walk, walks)}
                    </div>` },
        { narrow: true, html: `<h2>${icon('message-circle')} Community tips</h2>
                    <p class="section-lead">From local dog owners who've walked it.</p>
                    <div id="community-tips" class="tips-grid" data-walk="${esc(walk.id)}">${tipsHTML(walk.id, tips)}
                    </div>
                    <div id="tips-empty" class="tips-empty"${tips.filter((t) => t.walkId === walk.id).length ? ' hidden' : ''}>
                        <p class="tips-empty-lead">★ This walk doesn't have any community tips yet.</p>
                        <div class="tips-help">
                            <p><strong>Know something that would help another dog owner?</strong></p>
                            <ul>
                                <li>Is there a quieter entrance?</li>
                                <li>Does it get muddy after heavy rain?</li>
                                <li>Where's the best place for a swim?</li>
                                <li>Any livestock or seasonal hazards?</li>
                                <li>Is there a hidden picnic spot?</li>
                            </ul>
                        </div>
                    </div>
                    <div class="walk-actions">
                        <button type="button" class="btn btn-primary improve-btn" data-tiptype="walkingTip">${icon('message-circle')} Share a tip</button>
                    </div>` },
        { narrow: true, html: `<div id="improve" class="improve" data-walk="${esc(walk.name)}" data-walkid="${esc(walk.id)}">
                    <h2>${icon('lightbulb')} Help keep this guide up to date</h2>
                    <p class="section-lead">We'd love your help keeping Dogs of Essex accurate and up to date.</p>
                    <button type="button" class="btn btn-primary improve-btn" data-tiptype="walkingTip">${icon('message-circle')} Share something about this walk</button>
                </div>` },
        (walk.official && walk.official.managedBy) && { narrow: true, html: officialInner(walk) }
    ].filter(Boolean);

    const walkBody = bands.map((b, i) => `
            <section class="walk-section${i % 2 === 1 ? ' section-alt' : ''}">
                <div class="container${b.narrow ? ' narrow' : ''}">
                    ${b.html}
                </div>
            </section>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Analytics loads only after the visitor accepts (see script.js consent banner). -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${og}
    <!-- This page is generated by build.js from data/walks.json - do not edit by hand. -->
    <link rel="icon" href="../favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="../favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="../favicon-16x16.png">
    <link rel="apple-touch-icon" href="../apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css?v=${V_CSS}">${mapHead}
    <script>window.WALK_ID = "${walk.id}";${carParksScript(walk)}</script>
</head>
<body>${navHTML('../')}

    <main>
        <section class="walk-hero${heroAttrs}>
            <div class="walk-hero-top">
                <div class="container">
                    <p class="breadcrumb"><a href="../index.html">Home</a> · <a href="/walks/">Walks</a> · ${esc(walk.name)}</p>
                </div>
            </div>
            <div class="container walk-hero-inner" id="walk-hero">${heroHTML(walk)}
            </div>
            <div class="hero-actions">
                <a href="#" id="save-walk" class="btn btn-secondary js-save-btn" data-save-type="walk" data-save-id="${esc(walk.id)}">${icon('bookmark')}<span class="action-label">Save</span></a>
                <a href="#" id="email-walk" class="btn btn-secondary">${icon('mail')}<span class="action-label">Email</span></a>
                <a href="#" id="share-walk" class="btn btn-secondary">${icon('share-2')}<span class="action-label">Share</span></a>
            </div>
        </section>${routeOverviewHTML(walk)}

        <div class="walk-body">${walkBody}
        </div>
    </main>
${footerHTML('../')}

    <script src="../script.js?v=${V_JS}"></script>
    <script src="../walk.js?v=${V_WALK}"></script>${mapScripts}
</body>
</html>
`;
}

// --- walks index page (/walks/) ---

function indexWalkCard(w, i) {
    const sceneryIcon = SCENERY_ICON[w.scenery] || icon('paw-print');
    const meta = [milesLabel(w), timeLabel(w, true), w.mud ? 'Mud: ' + w.mud : ''].filter(Boolean).join(' • ');
    const tags = (w.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    // glance scores (for filtering) + sort metadata as data attributes
    const glance = (w.glance || []).map((g) => {
        const k = GLANCE_KEYS[g.label];
        return k ? ` data-${k}="${g.score}"` : '';
    }).join('');
    const mr = milesRange(w);
    const data = `${glance} data-lat="${w.lat}" data-lng="${w.lng}"`
        + ` data-miles-min="${mr.min}" data-miles-max="${mr.max}" data-order="${i}"`
        + ` data-pop="${(w.rating && w.rating.count) || 0}" data-added="${esc(w.added || '')}"`;
    const inner = `
                            <div class="photo-ph">${walkPhotoHTML(w, '../')}</div>
                            <div class="walk-card-body">
                                <h3>${esc(w.name)}</h3>
                                ${meta ? `<p class="walk-card-meta">${icon('footprints')}<span>${esc(meta)}</span></p>` : ''}
                                <p class="walk-card-distance" hidden></p>
                                <div class="tag-row">${tags}</div>
                                <div class="walk-card-stars" hidden></div>
                                <span class="link-arrow">${w.hasPage ? 'Explore Walk →' : 'Basic details available now. Full review coming soon.'}</span>
                            </div>`;
    return w.hasPage
        ? `\n                        <a href="/walks/${esc(w.id)}.html" class="walk-card"${data}>${inner}
                        </a>`
        : `\n                        <div class="walk-card walk-card-soon"${data}>${inner}
                        </div>`;
}

function walksIndexPage(walks) {
    const pills = GLANCE_FILTERS
        .map((f) => `<button type="button" class="filter-pill" data-key="${f.key}" aria-pressed="false">${f.label}</button>`)
        .join('\n                        ');

    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <h1 class="index-title">Dog walks in Essex</h1>
                    <p class="index-sub">Discover ${walks.length} dog-tested walk${walks.length === 1 ? '' : 's'} across Essex - with more added every month.</p>
                </div>
            </section>

            <div class="walks-toolbar">
                <div class="container">
                    <h2 class="controls-title">Find the perfect walk</h2>
                    <div class="walks-finder">
                        <div class="finder-search">
                            <span class="finder-label">Near:</span>
                            <form class="walks-locator" autocomplete="off">
                                <input type="text" class="locator-input" name="loc" placeholder="Postcode or town…" aria-label="Your postcode or town">
                                <button type="submit" class="btn btn-primary">Search</button>
                            </form>
                            <span class="finder-or" aria-hidden="true">or</span>
                            <button type="button" class="locator-geo btn btn-secondary">${icon('map-pin')} My location</button>
                        </div>
                    </div>
                    <p class="locator-status" role="status" hidden></p>
                    ${filterToggleHTML('walks-filter-toggle', 'walk-controls')}
                    <div class="controls-row" id="walk-controls">
                        <div class="walk-filters" aria-label="Filter walks by what they're best for">
                            ${pills}
                        </div>
                        <select class="walk-sort" aria-label="Sort walks">
                            <option value="featured">Recommended</option>
                            <option value="nearest">Nearest</option>
                            <option value="shortest">Shortest walk</option>
                            <option value="longest">Longest walk</option>
                            <option value="newest">Newest added</option>
                            <option value="popular">Most popular</option>
                        </select>
                    </div>
                </div>
            </div>

            <section class="walk-section section-alt walks-explorer-section">
                <div class="container">
                    <div class="walks-explorer">
                        <div class="walks-list-col">
                            <div class="walk-grid walks-index-grid">${walks.map((w, i) => indexWalkCard(w, i)).join('')}
                            </div>
                            <p class="no-results" hidden>No walks match those filters yet - try fewer.</p>
                        </div>
                        <aside class="walks-map-col">
                            <p class="walks-count" id="walks-count" aria-live="polite"></p>
                            <div id="walks-map" class="walks-map" aria-label="Map of all walks in Essex"></div>
                        </aside>
                    </div>
                </div>
            </section>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Analytics loads only after the visitor accepts (see script.js consent banner). -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dog Walks in Essex | Dogs of Essex</title>
    <meta name="description" content="Browse honest, dog-tested walks across Essex - woodland, heathland, parkland and coastal routes for you and your dog.">
    ${seoHead({ canonical: 'walks/', title: 'Dog Walks in Essex | Dogs of Essex', description: 'Browse honest, dog-tested walks across Essex - woodland, heathland, parkland and coastal routes for you and your dog.' })}
    <!-- This page is generated by build.js - do not edit by hand. -->
    <link rel="icon" href="../favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="../favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="../favicon-16x16.png">
    <link rel="apple-touch-icon" href="../apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
    <link rel="stylesheet" href="../styles.css?v=${V_CSS}">
</head>
<body>${navHTML('../')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('../')}

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script src="../script.js?v=${V_JS}"></script>
</body>
</html>
`;
}

// --- Best For pages (/best-for/ and /best-for/<slug>/) ---

// A walk's star score for a glance key (null if not rated for it).
function walkGlanceScore(walk, key) {
    const row = (walk.glance || []).find((g) => GLANCE_KEYS[g.label] === key);
    return row ? row.score : null;
}

// Reviewed walks ranked for a category: by glance key (then rating), or by distance.
function rankWalksForCategory(cat, walks) {
    const reviewed = walks.filter((w) => w.hasPage);
    if (cat.rank === 'distance') {
        return reviewed
            .filter((w) => parseFloat(w.distance))
            .sort((a, b) => (parseFloat(b.distance) || 0) - (parseFloat(a.distance) || 0))
            .map((w) => ({ walk: w }));
    }
    return reviewed
        .map((w) => ({ walk: w, score: walkGlanceScore(w, cat.key) }))
        .filter((x) => x.score != null)
        .sort((a, b) => b.score - a.score
            || ((b.walk.rating && b.walk.rating.value) || 0) - ((a.walk.rating && a.walk.rating.value) || 0));
}

function walkPhotoHTML(w, prefix) {
    prefix = prefix || '';
    const sceneryIcon = SCENERY_ICON[w.scenery] || icon('paw-print');
    const imgs = walkImages(w);
    return imgs.length
        ? `<img src="${prefix}${esc(imgs[0])}" alt="${esc(w.name)}" loading="lazy" onerror="this.remove();this.parentNode.classList.add('noimg')">`
        : `<span>${sceneryIcon} ${esc(w.name)}</span>`;
}

// The category's strongest walk - reuses the "Dogs of Essex Pick" premium styling.
function walkPickCardHTML(w, cat, prefix) {
    const href = `/walks/${esc(w.id)}.html`;
    const chips = [w.distance ? `${icon('ruler')} ${esc(w.distance)}` : '', w.time ? `${icon('clock')} ${esc(w.time)}` : '']
        .filter(Boolean).map((c) => `<span class="access-chip">${c}</span>`).join('');
    return `
                    <article class="day-card premium walk-pick">
                        <div class="premium-badge-bar">
                            <span class="badge-main">★ Dogs of Essex Pick</span>
                            <span class="badge-sub">Our top walk for ${esc(cat.title.toLowerCase())}</span>
                        </div>
                        <div class="premium-main">
                            <div class="premium-photo photo-ph">${walkPhotoHTML(w, prefix)}</div>
                            <div class="premium-content">
                                <span class="premium-type">${SCENERY_ICON[w.scenery] || icon('paw-print')} ${esc(cap(w.scenery))}</span>
                                <h3 class="premium-name">${esc(w.name)}</h3>
                                <div class="info-chips">${chips}</div>
                                ${w.intro ? `<p class="premium-desc">${esc(w.intro)}</p>` : ''}
                                <div class="glance walk-pick-glance">${glanceHTML(w.glance)}
                                </div>
                                <div class="pc-actions">
                                    <a class="btn btn-primary premium-cta" href="${href}">Explore Walk →</a>
                                </div>
                            </div>
                        </div>
                    </article>`;
}

// A standard walk card for the "more walks" list.
function bestForWalkCardHTML(w, prefix) {
    const sceneryIcon = SCENERY_ICON[w.scenery] || icon('paw-print');
    const meta = [milesLabel(w), timeLabel(w, true), w.mud ? 'Mud: ' + w.mud : ''].filter(Boolean).join(' • ');
    const tags = (w.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    return `
                        <a href="/walks/${esc(w.id)}.html" class="walk-card">
                            <div class="photo-ph">${walkPhotoHTML(w, prefix)}</div>
                            <div class="walk-card-body">
                                <h3>${esc(w.name)}</h3>
                                ${meta ? `<p class="walk-card-meta">${icon('footprints')}<span>${esc(meta)}</span></p>` : ''}
                                <div class="tag-row">${tags}</div>
                                <span class="link-arrow">Explore Walk →</span>
                            </div>
                        </a>`;
}

function bestForCardHTML(cat) {
    return `
                        <a href="${esc(cat.slug)}/index.html" class="bestfor-card">
                            <span class="bf-emoji" aria-hidden="true">${cat.emoji}</span>
                            <h3 class="bf-title">${esc(cat.title)}</h3>
                            <p class="bf-desc">${esc(cat.blurb)}</p>
                            <span class="link-arrow">View walks →</span>
                        </a>`;
}

function bestForIndexPage() {
    const cards = BEST_FOR.map(bestForCardHTML).join('');
    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <h1 class="index-title">Best walks for every dog</h1>
                    <p class="index-sub">Find the perfect Essex walk based on your dog's needs, age and personality.</p>
                </div>
            </section>

            <section class="walk-section section-alt">
                <div class="container">
                    <div class="best-for-grid">${cards}
                    </div>
                </div>
            </section>`;
    return `${headHTML('../', 'Best For - Find the right walk for your dog | Dogs of Essex',
        'Find the perfect Essex walk for your dog - reactive dogs, puppies, senior dogs, swimming, low mud, hot weather, off lead and high-energy dogs.',
        { canonical: 'best-for/' })}
</head>
<body>${navHTML('../')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('../')}

    <script src="../script.js?v=${V_JS}"></script>
</body>
</html>
`;
}

function seniorScaleHTML() {
    const rows = SENIOR_SCALE.map((s) => `
                        <div class="glance-row">
                            <span class="glance-stars">${starsHTML(s.stars)}</span>
                            <span class="glance-feature"><strong>${esc(s.label)}</strong> - ${esc(s.note)}</span>
                        </div>`).join('');
    return `<h2>How we rate walks for senior dogs</h2>
                    <p class="section-lead">Our Senior Dogs rating weighs distance, terrain difficulty, steep gradients, rest stops and surface quality.</p>
                    <div class="glance senior-scale">${rows}
                    </div>`;
}

function bestForCategoryPage(cat, walks) {
    const prefix = '../../';
    const ranked = rankWalksForCategory(cat, walks);
    const pick = ranked[0] ? ranked[0].walk : null;
    const others = ranked.slice(1).map((x) => x.walk);
    const lower = cat.title.toLowerCase();

    const pickBlock = pick
        ? walkPickCardHTML(pick, cat, prefix)
        : `<p class="section-lead">We're still reviewing walks for this category - check back soon.</p>`;

    const othersBlock = others.length ? `

            <section class="walk-section section-alt">
                <div class="container">
                    <h2>More walks for ${esc(lower)}</h2>
                    <div class="walk-grid">${others.map((w) => bestForWalkCardHTML(w, prefix)).join('')}
                    </div>
                </div>
            </section>` : '';

    const scaleBlock = cat.key === 'senior' ? `

            <section class="walk-section${others.length ? '' : ' section-alt'}">
                <div class="container narrow">
                    ${seniorScaleHTML()}
                </div>
            </section>` : '';

    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <p class="breadcrumb"><a href="${prefix}index.html">Home</a> · <a href="../index.html">Best For</a> · ${esc(cat.title)}</p>
                    <h1 class="index-title">${cat.emoji} Best Essex walks for ${esc(lower)}</h1>
                    <p class="index-sub">${esc(cat.intro)}</p>
                </div>
            </section>

            <section class="walk-section">
                <div class="container">
                    ${pickBlock}
                </div>
            </section>${othersBlock}${scaleBlock}`;

    const title = `Best Essex walks for ${lower} | Dogs of Essex`;
    return `${headHTML(prefix, title, cat.intro, { canonical: 'best-for/' + cat.slug + '/' })}
</head>
<body>${navHTML(prefix)}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML(prefix)}

    <script src="${prefix}script.js?v=${V_JS}"></script>
</body>
</html>
`;
}

// --- Places pages (/places/, /places/<cat>/ and /places/<cat>/<venue>/) ---

// Nearest reviewed walk to a place: { walk, mi } or null.
function nearestWalk(p, walks) {
    let best = null;
    walks.forEach((w) => {
        if (!w.hasPage || w.lat == null || w.lng == null) return;
        const mi = miles({ lat: p.lat, lng: p.lng }, { lat: w.lat, lng: w.lng });
        if (!best || mi < best.mi) best = { walk: w, mi };
    });
    return best;
}

function placeSocialsHTML(p) {
    if (!p.socials) return '';
    const links = Object.keys(SOCIAL_ICONS).map((key) => {
        const url = p.socials[key];
        return url
            ? `<a class="social-icon" href="${esc(url)}" target="_blank" rel="noopener" aria-label="${SOCIAL_LABELS[key]}">${SOCIAL_ICONS[key]}</a>`
            : '';
    }).join('');
    return links ? `<span class="social-icons">${links}</span>` : '';
}

function essentialInfoHTML(p) {
    const web = placeUrl(p);
    const rows = [];
    if (web) rows.push(`<li>${icon('globe')} <a href="${esc(web)}" target="_blank" rel="noopener">Visit website ↗</a></li>`);
    if (p.phone) rows.push(`<li>${icon('phone')} <a href="tel:${esc(p.phone.replace(/\s+/g, ''))}">${esc(p.phone)}</a></li>`);
    if (p.email) rows.push(`<li>${icon('mail')} <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></li>`);
    rows.push(`<li>${icon('map-pin')} <a href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">Go to map ↗</a></li>`);
    const socials = placeSocialsHTML(p);
    if (socials) rows.push(`<li>${socials}</li>`);
    return `<ul class="venue-info">${rows.join('')}</ul>`;
}

function accessBadgesHTML(p) {
    const items = p.dogAccess || [];
    if (!items.length) return '';
    const chips = items.map((k) => {
        const m = ACCESS_META[k] || { icon: icon('paw-print'), label: k };
        return `<span class="access-chip">${m.icon} ${esc(m.label)}</span>`;
    }).join('');
    return `<div class="premium-access">${chips}</div>`;
}

// A place on the hub / category pages: the same unified card, with distance
// shown relative to the nearest walk and a link to the place's detail page.
// opts: { pathPrefix (dir the detail page sits in, relative to this page),
//         cat, order }.
function placesCardHTML(p, walks, opts) {
    opts = opts || {};
    const near = nearestWalk(p, walks);
    const mi = near ? near.mi : null;
    return placeCardHTML(p, {
        mi,
        order: opts.order || 0,
        cat: opts.cat,
        detailHref: `${opts.pathPrefix || ''}${p.id}/index.html`,
        distText: near ? `${near.mi.toFixed(1)} mi from ${esc(near.walk.name)}` : ''
    });
}

function placesIndexPage(places, walks) {
    const cats = PLACE_CATEGORIES;
    // "Near a walk" options for the location bar - every walk with a page + coords.
    const walkOpts = walks
        .filter((w) => w.hasPage && w.lat != null && w.lng != null)
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((w) => `<option value="${w.lat},${w.lng}">${esc(w.name)}</option>`)
        .join('\n                                ');
    // Finder: set an origin by postcode/town, current location, or a walk;
    // distances + the map then re-centre on it. Deep-linkable via ?near=lat,lng.
    // The location controls. On desktop the .finder-option wrappers collapse
    // (display:contents) so this renders as the original one-line finder; on
    // mobile they become three clearly separated, labelled options inside the
    // "Location" accordion panel.
    const locatorBar = `
                    <div class="places-finder" id="places-location-panel" role="region" aria-labelledby="places-location-toggle">
                        <div class="finder-option finder-option-postcode">
                            <span class="finder-option-label">Postcode or town</span>
                            <span class="finder-label">Near:</span>
                            <form class="places-locator" autocomplete="off">
                                <input type="text" class="locator-input" name="loc" placeholder="Postcode or town…" aria-label="Your postcode or town">
                                <button type="submit" class="btn btn-primary">Search</button>
                            </form>
                        </div>
                        <span class="finder-or" aria-hidden="true">or</span>
                        <div class="finder-option finder-option-geo">
                            <span class="finder-option-label">My location</span>
                            <button type="button" class="locator-geo btn btn-secondary">${icon('map-pin')}<span class="geo-label geo-label-desktop"> My location</span><span class="geo-label geo-label-mobile">Use your location</span></button>
                        </div>
                        <span class="finder-sep" aria-hidden="true"></span>
                        <div class="finder-option finder-option-walk finder-walk">
                            <span class="finder-option-label">Near a walk</span>
                            <span class="finder-label">Walk:</span>
                            <select class="places-near-walk" aria-label="Show places near a walk">
                                <option value="">Select walk…</option>
                                ${walkOpts}
                            </select>
                            <button type="button" class="btn btn-primary places-walk-search">Search</button>
                        </div>
                        <p class="locator-status" role="status" hidden></p>
                    </div>`;
    const pills = `<button type="button" class="filter-pill is-active" data-cat="all" aria-pressed="true">All</button>\n                        `
        + cats.map((c) => `<button type="button" class="filter-pill" data-cat="${esc(c.slug)}" aria-pressed="false">${esc(c.title)}</button>`).join('\n                        ');

    // Eat & Drink sub-filters: venue type (single-select) plus dog-access
    // options (multi-select), shown only while that category is active. The
    // access pills are built from whichever dogAccess keys the venues use.
    const eat = cats.find((c) => c.slug === 'eat-drink');
    const eatPlaces = eat ? placesInCategory(eat, places) : [];
    const accessLabels = { inside: 'Dogs allowed inside', outside: 'Dogs allowed outside' };
    const accessKeys = Object.keys(ACCESS_META)
        .filter((k) => eatPlaces.some((p) => (p.dogAccess || []).includes(k)));
    const typePills = (eat && eat.filters ? eat.filters : [])
        .map((f, i) => `<button type="button" class="filter-pill subfilter-pill${i === 0 ? ' is-active' : ''}" data-subtype="${esc(f.type)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(f.label)}</button>`)
        .join('\n                            ');
    const accessPills = accessKeys
        .map((k) => `<button type="button" class="filter-pill subfilter-pill" data-subaccess="${esc(k)}" aria-pressed="false">${esc(accessLabels[k] || ACCESS_META[k].label)}</button>`)
        .join('\n                            ');
    const subfilter = (typePills || accessPills) ? `
                        <div class="places-subfilter" data-for="eat-drink" hidden aria-label="Filter places to eat and drink">
                            ${typePills}
                            <span class="subfilter-sep" aria-hidden="true"></span>
                            ${accessPills}
                        </div>` : '';

    // "Recommended" default order: the blended score (distance to nearest walk
    // + editor recommendation + small sponsor boost). Re-ranks client-side once
    // the visitor gives a location. The index becomes data-order.
    const tagged = cats.flatMap((cat) => placesInCategory(cat, places).map((p) => ({ p, cat })));
    const nearMi = (p) => { const n = nearestWalk(p, walks); return n ? n.mi : null; };
    tagged.sort((a, b) => rankScore(b.p, nearMi(b.p)) - rankScore(a.p, nearMi(a.p))
        || (nearMi(a.p) == null ? 1e9 : nearMi(a.p)) - (nearMi(b.p) == null ? 1e9 : nearMi(b.p))
        || (a.p.name || '').localeCompare(b.p.name || ''));
    const list = tagged.map(({ p, cat }, i) =>
        placesCardHTML(p, walks, { pathPrefix: cat.slug + '/', cat: cat.slug, order: i })).join('');

    // Coming-soon empty state for categories with no venues yet (shown by the
    // filter JS when that category is selected).
    const empties = cats.filter((c) => !placesInCategory(c, places).length).map((c) => `
                    <div class="places-empty" data-cat="${esc(c.slug)}" hidden>
                        <p class="section-lead">${esc(c.title)} is coming soon - we're still adding great spots.</p>
                        <p class="tip-cta">Know a great one? <a href="mailto:hello@dogsofessex.co.uk?subject=${encodeURIComponent('Place suggestion: ' + c.title)}">Tell us →</a></p>
                    </div>`).join('');

    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <h1 class="index-title">Dog-friendly places in Essex</h1>
                    <p class="index-sub">Cafés, pubs and days out worth visiting with your dog.</p>
                </div>
            </section>

            <div class="places-toolbar is-pre-search">
                <div class="container">
                    <div class="pa-toggle-bar">
                        <button type="button" class="pa-toggle places-location-toggle" id="places-location-toggle" aria-expanded="false" aria-controls="places-location-panel">
                            <span class="pa-toggle-label">${icon('map-pin')} Location</span>
                            <svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                        <button type="button" class="pa-toggle places-filter-toggle" id="places-filter-toggle" aria-expanded="false" aria-controls="places-controls">
                            <span class="pa-toggle-label">Filter &amp; Sort<span class="pa-count" hidden></span></span>
                            <svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                    </div>
                    ${locatorBar}
                    <div class="places-controls-wrap" id="places-controls" role="region" aria-labelledby="places-filter-toggle">
                        <div class="places-controls">
                            <div class="places-controls-top">
                                <div class="walk-filters places-cat-filter" aria-label="Filter places by category">
                                    ${pills}
                                </div>
                                <div class="places-sort-row">
                                    <label class="places-sort-label">Sort by
                                        <select class="places-sort" aria-label="Sort places">
                                            <option value="recommended">Recommended</option>
                                            <option value="distance">Distance</option>
                                            <option value="added">Recently added</option>
                                            <option value="az">A-Z</option>
                                        </select>
                                    </label>
                                    <label class="places-distance-wrap" hidden>Search radius
                                        <select class="places-distance" aria-label="Only show places within this distance">
                                            <option value="">Everywhere</option>
                                            <option value="20">20 miles</option>
                                            <option value="10" selected>10 miles</option>
                                            <option value="5">5 miles</option>
                                            <option value="3">3 miles</option>
                                        </select>
                                    </label>
                                </div>
                            </div>${subfilter}
                            <div class="places-active-filters" role="group" aria-label="Active filters" hidden></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="places-backdrop" hidden></div>

            <section class="walk-section section-alt places-section places-explorer-section">
                <div class="container">
                    <div class="places-explorer">
                        <div class="places-list-col">
                            <div class="places-list places-hub-list">${list}
                            </div>${empties}
                            <div class="places-dots" aria-hidden="true"><div class="places-dots-track"></div></div>
                        </div>
                        <aside class="places-map-col">
                            <p class="places-count places-count-map" aria-live="polite"></p>
                            <div class="places-map-wrap">
                                <div id="places-map" class="places-map" aria-label="Map of dog-friendly places in Essex"></div>
                                <button type="button" class="map-search-area" hidden>${icon('map-pin')} Search this area</button>
                            </div>
                        </aside>
                    </div>
                </div>
            </section>`;
    return `${headHTML('../', 'Dog-friendly places in Essex | Dogs of Essex', 'Browse dog-friendly cafés, pubs and days out across Essex - filter by category and find your nearest.', { canonical: 'places/' })}
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
</head>
<body>${navHTML('../')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('../')}

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script src="../script.js?v=${V_JS}"></script>
</body>
</html>
`;
}

// Venues in a category, dog-friendly only.
function placesInCategory(cat, places) {
    return places.filter((p) => p.dogFriendly !== false && (cat.types || []).includes(p.type));
}

function placesCategoryPage(cat, places, walks) {
    const prefix = '../../';
    const nearMi = (p) => { const n = nearestWalk(p, walks); return n ? n.mi : null; };
    // One list of every venue in blended-recommended order (distance to nearest
    // walk + editor score + small sponsor boost). Re-ranks client-side once the
    // visitor enters a location.
    const inCat = placesInCategory(cat, places).slice().sort((a, b) =>
        rankScore(b, nearMi(b)) - rankScore(a, nearMi(a))
        || (nearMi(a) == null ? 1e9 : nearMi(a)) - (nearMi(b) == null ? 1e9 : nearMi(b))
        || (a.name || '').localeCompare(b.name || ''));
    const noteBlock = cat.note ? `\n                    <p class="local-tip">${icon('triangle-alert')} ${esc(cat.note)}</p>` : '';

    const filterBar = cat.filters ? `
                    <div class="walk-filters places-filter" aria-label="Filter places to eat and drink by type">
                        ${cat.filters.map((f, i) => `<button type="button" class="filter-pill${i === 0 ? ' is-active' : ''}" data-type="${esc(f.type)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(f.label)}</button>`).join('\n                        ')}
                    </div>` : '';

    const locatorBar = inCat.length ? `
                    <div class="place-locator">
                        <form class="locator-form" autocomplete="off">
                            <input type="text" class="locator-input" name="loc" placeholder="Enter a postcode or town…" aria-label="Your postcode or town">
                            <button type="submit" class="btn btn-primary">Search</button>
                            <button type="button" class="locator-geo btn btn-secondary">${icon('map-pin')} Use my location</button>
                        </form>
                        <p class="locator-status" role="status" hidden></p>
                    </div>` : '';

    let content;
    if (!inCat.length) {
        content = `
            <section class="walk-section">
                <div class="container narrow">
                    <p class="section-lead">We're still adding dog-friendly ${esc(cat.plural)} - check back soon.</p>
                    <p class="tip-cta">Know a great one? <a href="mailto:hello@dogsofessex.co.uk?subject=${encodeURIComponent('Place suggestion: ' + cat.title)}">Tell us →</a></p>
                </div>
            </section>`;
    } else {
        const list = inCat.map((p, i) => placesCardHTML(p, walks, { cat: cat.slug, order: i })).join('');
        content = `
            <section class="walk-section section-alt places-section">
                <div class="container">
                    <p class="section-lead">In recommended order - enter your postcode above to re-rank by what's closest to you.</p>
                    <div class="places-list">${list}
                    </div>
                </div>
            </section>`;
    }

    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <p class="breadcrumb"><a href="${prefix}index.html">Home</a> · <a href="../index.html">Places</a> · ${esc(cat.title)}</p>
                    <h1 class="index-title">${cat.emoji} Dog-friendly ${esc(cat.plural)} in Essex</h1>
                    <p class="index-sub">${esc(cat.intro)}</p>${noteBlock}${filterBar}${locatorBar}
                </div>
            </section>${content}`;

    const title = `Dog-friendly ${cat.plural} in Essex | Dogs of Essex`;
    return `${headHTML(prefix, title, cat.intro, { canonical: 'places/' + cat.slug + '/' })}
</head>
<body>${navHTML(prefix)}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML(prefix)}

    <script src="${prefix}script.js?v=${V_JS}"></script>
</body>
</html>
`;
}

function venuePage(p, cat, walks) {
    const prefix = '../../../';
    const meta = TYPE_META[p.type] || { icon: icon('map-pin'), label: p.type };
    const near = walks
        .filter((w) => w.hasPage && w.lat != null && w.lng != null)
        .map((w) => ({ ...w, _mi: miles({ lat: p.lat, lng: p.lng }, { lat: w.lat, lng: w.lng }) }))
        .filter((w) => w._mi <= NEARBY_WALK_RADIUS_MI)
        .sort((a, b) => a._mi - b._mi)
        .slice(0, 4);

    const verify = p.verified
        ? `<p class="meta-line">${icon('circle-check')} Last checked${p.checkedBy ? ' by ' + esc(p.checkedBy) : ''}${p.lastChecked ? ' • ' + formatMonthYear(p.lastChecked) : ''}</p>`
        : '';
    const overview = p.notes
        ? `<p class="lead-intro">${esc(p.notes)}</p>`
        : `<p class="section-lead">A dog-friendly ${esc((meta.label || '').toLowerCase())} in Essex.</p>`;
    const badges = accessBadgesHTML(p);
    const dogNote = p.dogFriendlyNotes ? `\n                    <p>${esc(p.dogFriendlyNotes)}</p>` : '';
    const dogInfo = (badges || dogNote)
        ? `\n\n                    <h2>Dog information</h2>${badges ? '\n                    ' + badges : ''}${dogNote}`
        : '';

    const nearbyBlock = near.length ? `

            <section class="walk-section section-alt">
                <div class="container">
                    <h2>${icon('paw-print')} Nearby walks</h2>
                    <p class="section-lead">Pair your visit with a good walk close by.</p>
                    <div class="walk-grid">${near.map((w) => bestForWalkCardHTML(w, prefix)).join('')}
                    </div>
                </div>
            </section>` : '';

    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <p class="breadcrumb"><a href="${prefix}index.html">Home</a> · <a href="../../index.html">Places</a> · <a href="../index.html">${esc(cat.title)}</a> · ${esc(p.name)}</p>
                    <span class="premium-type">${meta.icon} ${esc(meta.label)}</span>
                    <h1 class="index-title">${esc(p.name)}</h1>
                    ${verify}
                    <div class="hero-actions venue-actions">
                        <a href="#" class="btn btn-secondary js-save-btn" data-save-type="place" data-save-id="${esc(p.id)}">${icon('bookmark')}<span class="action-label">Save</span></a>
                    </div>
                </div>
            </section>

            <section class="walk-section">
                <div class="container narrow">
                    <h2>Overview</h2>
                    ${overview}

                    <h2>Essential information</h2>
                    ${essentialInfoHTML(p)}${dogInfo}
                </div>
            </section>${nearbyBlock}`;

    const title = `${p.name} - dog-friendly ${(meta.label || '').toLowerCase()} in Essex | Dogs of Essex`;
    const description = p.notes || p.dogFriendlyNotes || `${p.name}, a dog-friendly ${(meta.label || '').toLowerCase()} in Essex.`;
    return `${headHTML(prefix, title, description, { canonical: 'places/' + cat.slug + '/' + p.id + '/', image: p.image || undefined, type: 'article' })}
</head>
<body>${navHTML(prefix)}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML(prefix)}

    <script src="${prefix}script.js?v=${V_JS}"></script>
</body>
</html>
`;
}

function aboutPhotoHTML() {
    const dir = path.join(ROOT, 'images', 'about');
    let file = '';
    try {
        file = fs.readdirSync(dir)
            .filter((f) => /\.(jpe?g|png|webp|avif|gif)$/i.test(f))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))[0] || '';
    } catch (e) { /* no folder yet */ }
    return file
        ? `<img src="images/about/${file}" alt="Poppy, the Dogs of Essex chief walk tester" loading="lazy" onerror="this.remove();this.parentNode.classList.add('noimg')">`
        : `<span>${icon('paw-print')} A photo of Poppy goes here</span>`;
}

function aboutPage() {
    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <h1 class="index-title">About Dogs of Essex</h1>
                    <p class="index-sub">Helping dog owners discover the very best walks across Essex.</p>
                </div>
            </section>

            <section class="walk-section section-alt">
                <div class="container">
                    <div class="about">
                        <h2>Why I created Dogs of Essex</h2>
                        <p>Dogs of Essex started with Poppy, my Labrador. Every time we wanted to try somewhere new, I found myself searching for the same answers:</p>
                        <ul>
                            <li>Can she be off lead?</li>
                            <li>Can she swim? (she loves a swim!)</li>
                            <li>Is there a dog-friendly café afterwards?</li>
                        </ul>
                        <p>No single website answered those questions. The information was scattered across reviews, forums and old blog posts - and rarely written with dogs in mind. So I started keeping my own notes, and Dogs of Essex grew from there: one honest, dog-first guide to walking in Essex.</p>

                        <h2>How we review walks</h2>
                        <p>Every walk is visited and reviewed using the same set of criteria, including suitability for reactive dogs, puppies and senior dogs, swimming opportunities, shade, mud, parking and nearby dog-friendly places. That's why the star ratings aren't random - they reflect the same checks applied to every walk, so you can compare them fairly.</p>

                        <h2>Accuracy</h2>
                        <p>We aim to keep every walk accurate and up to date, but things change - a café closes, a path floods, livestock arrives in a field. If you spot something that's out of date or wrong, we'd genuinely love to hear about it. Every walk page has a <strong>&ldquo;Help improve this walk&rdquo;</strong> section, and you can always get in touch below.</p>

                        <h2>Meet Poppy ${icon('paw-print')}</h2>
                        <figure class="about-poppy photo-ph">${aboutPhotoHTML()}</figure>
                        <p>Poppy is my Labrador and chief walk tester. If there's water nearby, she'll almost certainly find it.</p>

                        <blockquote class="about-quote">Dogs of Essex isn't about finding the longest walks - it's about finding the right walk for you and your dog.</blockquote>

                        <h2>Get in touch</h2>
                        <p>Want to help shape Dogs of Essex? Pick whichever fits:</p>
                        <div id="improve" class="improve" data-walk="" data-walkid="">
                            <div class="improve-actions">
                                <button type="button" class="btn btn-secondary improve-btn" data-tiptype="newWalkSuggestion">${icon('map-pin')} Suggest a new walk</button>
                                <button type="button" class="btn btn-secondary improve-btn" data-tiptype="report">${icon('triangle-alert')} Report an issue</button>
                                <a class="btn btn-secondary" href="mailto:hello@dogsofessex.co.uk?subject=Dogs%20of%20Essex%20Enquiry">${icon('mail')} Contact Dogs of Essex</a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>`;
    return `${headHTML('', 'About | Dogs of Essex', 'Why Dogs of Essex exists, how every walk is reviewed, and the Labrador who started it all.', { canonical: 'about.html' })}
</head>
<body>${navHTML('')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('')}

    <script src="script.js?v=${V_JS}"></script>
    <script src="walk.js?v=${V_WALK}"></script>
</body>
</html>
`;
}

function thankYouPage() {
    const prefix = '../';
    const body = `
            <section class="walk-section walk-index-head">
                <div class="container narrow centered">
                    <p class="eyebrow centered" style="color: var(--color-terracotta);">You're in ${icon('paw-print')}</p>
                    <h1 class="index-title">Welcome to the pack!</h1>
                    <p class="index-sub">Thanks for subscribing — you're all set for the best dog-friendly walks and places in Essex.</p>
                </div>
            </section>

            <section class="walk-section section-alt">
                <div class="container narrow centered">
                    <p class="section-lead">Keep an eye on your inbox — a welcome email is on its way. If it hasn't arrived in a few minutes, check your spam or promotions folder and mark us as safe so you don't miss a walk.</p>
                    <div class="ty-actions">
                        <a class="btn btn-primary" href="${prefix}walks/index.html">${icon('paw-print')} Browse walks</a>
                        <a class="btn btn-secondary" href="${prefix}places/index.html">Explore places</a>
                        <a class="btn btn-secondary" href="${prefix}index.html">Back to home</a>
                    </div>
                </div>
            </section>`;
    return `${headHTML(prefix, "You're in! | Dogs of Essex", 'Thanks for subscribing to Dogs of Essex - the best dog-friendly walks and places in Essex, straight to your inbox.', { canonical: 'thank-you/', extra: '<meta name="robots" content="noindex,follow">' })}
</head>
<body>${navHTML(prefix)}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML(prefix)}

    <script src="${prefix}script.js?v=${V_JS}"></script>
</body>
</html>
`;
}

function privacyPage() {
    const updated = 'Last updated: 28 June 2026';
    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <h1 class="index-title">Privacy Policy</h1>
                    <p class="index-sub">${updated}</p>
                </div>
            </section>

            <section class="walk-section section-alt">
                <div class="container">
                    <div class="legal">
                        <h2>1. Introduction</h2>
                        <p>Dogs of Essex is committed to protecting your privacy. This policy explains what information we collect, why we collect it, and how we use it. We aim to keep things simple and honest - this policy reflects how the site actually works, in plain English.</p>

                        <h2>2. Who We Are</h2>
                        <ul>
                            <li><strong>Website name:</strong> Dogs of Essex</li>
                            <li><strong>Website:</strong> <a href="https://dogsofessex.co.uk">dogsofessex.co.uk</a></li>
                            <li><strong>Contact:</strong> <a href="mailto:privacy@dogsofessex.co.uk">privacy@dogsofessex.co.uk</a></li>
                        </ul>

                        <h2>3. What Information We Collect</h2>
                        <h3>Information you provide</h3>
                        <p>When you use one of our forms or email us - for example, when you:</p>
                        <ul>
                            <li>submit a community tip</li>
                            <li>suggest a new walk</li>
                            <li>recommend a dog-friendly place</li>
                            <li>report incorrect information</li>
                            <li>contact us</li>
                        </ul>
                        <p>we may collect:</p>
                        <ul>
                            <li>your name (if provided)</li>
                            <li>your email address (if provided)</li>
                            <li>the message or submission itself</li>
                        </ul>
                        <p>Providing your name and email address is optional. You can submit a tip without giving either, though we won't be able to reply to you if you don't leave an email address.</p>

                        <h3>Location (only when you ask for it)</h3>
                        <p>Some pages let you find walks near you. If you use the &ldquo;nearest&rdquo; option, your browser will ask permission to share your location. We use this only in your browser to sort walks by distance - your location is not sent to us and is not stored.</p>
                        <p>If you instead search by typing a postcode or town, that text is sent to mapping services to look up the location (see <a href="#third-parties">Third-Party Services</a>). We don't store what you search for.</p>

                        <h2>4. How We Use Your Information</h2>
                        <p>We use the information you provide to:</p>
                        <ul>
                            <li>respond to enquiries</li>
                            <li>review community submissions</li>
                            <li>verify information before publishing</li>
                            <li>improve the website</li>
                        </ul>
                        <p>Submissions may be edited for clarity before being published.</p>

                        <h2>5. Publishing Community Tips</h2>
                        <p>If you submit a community tip, we may publish all or part of your submission on Dogs of Essex. We will only display the name you choose to provide (for example, &ldquo;Sarah &amp; Luna&rdquo;). Email addresses are never published.</p>

                        <h2>6. Community Contributions</h2>
                        <p>By submitting a tip, walk recommendation, or other contribution, you give Dogs of Essex permission to edit, publish, or decline your submission. We may make minor edits for spelling, grammar, length, or clarity while preserving the original meaning.</p>

                        <h2>7. Email Addresses</h2>
                        <p>If you provide an email address:</p>
                        <ul>
                            <li>it is only used so we can contact you about your submission or enquiry</li>
                            <li>it is never sold</li>
                            <li>it is never shared with third parties</li>
                        </ul>

                        <h2>8. Cookies &amp; Analytics</h2>
                        <p>Analytics on Dogs of Essex is <strong>optional and switched off by default</strong>. We use <strong>Google Analytics</strong>, provided by Google, to understand how visitors use the site (for example, which walks are most popular and where people get stuck) so we can improve it. It sets first-party &ldquo;_ga&rdquo; cookies and collects anonymised usage data such as pages viewed, device type and approximate location. We do not use it to identify you personally, and we do not use any advertising or ad-personalisation cookies.</p>
                        <p><strong>Nothing is loaded or sent to Google until you agree.</strong> On your first visit a banner asks you to <em>Accept analytics</em> or <em>Reject analytics</em>, with both choices given equal prominence. If you accept, Google Analytics loads with analytics permitted (advertising storage stays denied). If you reject, Google Analytics is never loaded.</p>
                        <p>You can change your decision at any time. Select <button type="button" class="cookie-settings link-inline">Cookie settings</button> (available here and in the footer of every page) to reopen the banner and accept or withdraw permission. If you withdraw, we stop Google Analytics and remove its &ldquo;_ga&rdquo; cookies from your browser where possible.</p>
                        <p>Your choice is saved on your device in your browser&rsquo;s local storage. It has no expiry date, so it is remembered until you change it here or clear your browser&rsquo;s site data. Because it is stored per browser and per device, you may be asked again if you visit from a different browser or device.</p>
                        <p>Aside from analytics, we only use essential cookies required for the website to function.</p>

                        <h2 id="third-parties">9. Third-Party Services</h2>
                        <p>We use a small number of trusted third-party services to run the site. These may process limited data on our behalf:</p>
                        <ul>
                            <li><strong>GitHub Pages</strong> - website hosting</li>
                            <li><strong>Google Analytics</strong> (Google) - optional, consent-based website usage statistics; only loaded if you accept analytics</li>
                            <li><strong>FormSubmit</strong> - delivers form submissions (tips, suggestions, reports) to us by email</li>
                            <li><strong>Google Workspace</strong> - our email accounts</li>
                            <li><strong>Postcodes.io</strong> and <strong>OpenStreetMap (Nominatim)</strong> - look up a postcode or town you type into the &ldquo;find walks near me&rdquo; search</li>
                        </ul>

                        <h2>10. Your Rights</h2>
                        <p>You can ask us to:</p>
                        <ul>
                            <li>access the personal information we hold about you</li>
                            <li>correct it</li>
                            <li>delete it</li>
                        </ul>
                        <p>To make a request, email <a href="mailto:privacy@dogsofessex.co.uk">privacy@dogsofessex.co.uk</a>.</p>

                        <h2>11. Data Retention</h2>
                        <p>We only keep personal information for as long as necessary to manage submissions and operate the website.</p>

                        <h2>12. Contact</h2>
                        <p>If you have any questions about this Privacy Policy or how your information is handled, please contact:</p>
                        <p><a href="mailto:privacy@dogsofessex.co.uk">privacy@dogsofessex.co.uk</a></p>
                    </div>
                </div>
            </section>`;
    return `${headHTML('', 'Privacy Policy | Dogs of Essex', 'How Dogs of Essex collects, uses and protects your information when you use the site or submit a community contribution.', { canonical: 'privacy.html' })}
</head>
<body>${navHTML('')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('')}

    <script src="script.js?v=${V_JS}"></script>
</body>
</html>
`;
}

function termsPage() {
    const updated = 'Last updated: July 2026';
    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <h1 class="index-title">Terms of Use</h1>
                    <p class="index-sub">${updated}</p>
                </div>
            </section>

            <section class="walk-section section-alt">
                <div class="container">
                    <div class="legal">
                        <p class="legal-lead">Dogs of Essex is an independent guide created by local dog owners. We visit every walk ourselves, take our own photographs and aim to keep our information as accurate and helpful as possible.</p>
                        <p>Welcome to Dogs of Essex. By using this website, you agree to these terms.</p>

                        <h2>1. Using Dogs of Essex</h2>
                        <p>Dogs of Essex is a guide to dog-friendly walks, places and information across Essex.</p>
                        <p>You may browse, share and use the information for your own personal, non-commercial use.</p>
                        <p>Please don't copy large parts of the website or republish our content without permission.</p>

                        <h2>2. Walk Information</h2>
                        <p>We do our best to keep every walk accurate and up to date, but things change. This includes:</p>
                        <ul>
                            <li>parking arrangements</li>
                            <li>livestock</li>
                            <li>seasonal closures</li>
                            <li>flooding</li>
                            <li>access restrictions</li>
                            <li>facilities</li>
                            <li>cafés</li>
                            <li>toilets</li>
                            <li>opening times</li>
                        </ul>
                        <p>Always use your own judgement when visiting a walk.</p>

                        <h2>3. Walking is at Your Own Risk</h2>
                        <p>You are responsible for your own safety and your dog's safety.</p>
                        <p>Dogs of Essex cannot accept responsibility for:</p>
                        <ul>
                            <li>injuries</li>
                            <li>accidents</li>
                            <li>lost dogs</li>
                            <li>damaged property</li>
                            <li>parking fines</li>
                            <li>changes to routes</li>
                            <li>weather conditions</li>
                            <li>tides</li>
                            <li>livestock encounters</li>
                        </ul>

                        <h2>4. Ratings &amp; Recommendations</h2>
                        <p>Our ratings and recommendations reflect our own experience and opinion and are intended as a guide only. Every dog is different, so what suits one may not suit another.</p>

                        <h2>5. GPX Routes</h2>
                        <p>If you download a GPX file:</p>
                        <ul>
                            <li>it is provided as a guide only</li>
                            <li>GPS accuracy isn't guaranteed</li>
                            <li>routes may change over time</li>
                            <li>always follow local signs and rights of way</li>
                        </ul>

                        <h2>6. Community Contributions</h2>
                        <p>If you submit:</p>
                        <ul>
                            <li>tips</li>
                            <li>corrections</li>
                            <li>new walks</li>
                            <li>photographs</li>
                            <li>comments</li>
                        </ul>
                        <p>you confirm:</p>
                        <ul>
                            <li>the information is accurate to the best of your knowledge</li>
                            <li>you own any photos you upload</li>
                            <li>you give Dogs of Essex permission to display and edit your submission.</li>
                        </ul>

                        <h2>7. External Websites</h2>
                        <p>We sometimes link to:</p>
                        <ul>
                            <li>Google Maps</li>
                            <li>cafés</li>
                            <li>pubs</li>
                            <li>official organisations</li>
                            <li>local councils</li>
                        </ul>
                        <p>We're not responsible for the content or availability of those websites.</p>

                        <h2>8. Copyright</h2>
                        <p>Unless stated otherwise, all text, photographs, ratings and website content belong to Dogs of Essex.</p>
                        <p>Please don't reproduce or republish our content without permission.</p>
                        <p>Sharing links to our website is always welcome.</p>

                        <h2>9. Changes</h2>
                        <p>We may update these terms from time to time. The latest version will always be available on this page.</p>

                        <h2>10. Contact</h2>
                        <p>If you have any questions about these Terms of Use, please contact us at:</p>
                        <p><a href="mailto:hello@dogsofessex.co.uk">hello@dogsofessex.co.uk</a></p>
                    </div>
                </div>
            </section>`;
    return `${headHTML('', 'Terms of Use | Dogs of Essex', 'The plain-English terms for using Dogs of Essex - walk information, GPX routes, community contributions, ratings and copyright.', { canonical: 'terms.html' })}
</head>
<body>${navHTML('')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('')}

    <script src="script.js?v=${V_JS}"></script>
</body>
</html>
`;
}

function contactPage() {
    // id="improve" + an .improve-btn lets walk.js wire up the same contribution
    // form modal used on every walk page (here the button just says "Contact us").
    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <h1 class="index-title">Contact</h1>
                    <p class="index-sub">Questions, suggestions, feedback or spotted something we've missed? We'd love to hear from you.</p>
                </div>
            </section>

            <section class="walk-section section-alt">
                <div class="container narrow">
                    <div class="legal contact-page" id="improve" data-walk="" data-walkid="">
                        <h2>Help keep Dogs of Essex up to date</h2>
                        <p>Found a hidden gem? Spotted a problem with a walk? Have feedback or a suggestion? We'd love to hear from you.</p>
                        <div class="improve-actions">
                            <button type="button" class="btn btn-secondary improve-btn" data-tiptype="walkingTip">Share a tip</button>
                            <button type="button" class="btn btn-secondary improve-btn" data-tiptype="report">Report an issue</button>
                            <button type="button" class="btn btn-secondary improve-btn" data-tiptype="newPlaceSuggestion">Recommend a place</button>
                            <button type="button" class="btn btn-secondary improve-btn" data-tiptype="newWalkSuggestion">Suggest a new walk</button>
                            <button type="button" class="btn btn-secondary improve-btn" data-tiptype="question">Ask a question</button>
                        </div>

                        <h2>Prefer to email us?</h2>
                        <p>For anything else, feel free to email us and we'll get back to you as soon as we can.</p>
                        <p class="contact-email">${icon('mail')} <span class="contact-email-address">hello@dogsofessex.co.uk</span></p>
                        <p><a class="btn btn-secondary" href="mailto:hello@dogsofessex.co.uk?subject=Dogs%20of%20Essex%20Enquiry">Email us</a></p>
                        <p class="contact-note">Clicking the button opens your email app.</p>

                        <h2>Follow Dogs of Essex</h2>
                        <p class="contact-socials">
                            <a class="social-icon-link" href="https://instagram.com/dogsofessexuk" target="_blank" rel="noopener">${SOCIAL_ICONS.instagram}<span>Instagram</span></a>
                            <a class="social-icon-link" href="https://facebook.com/dogsofessex" target="_blank" rel="noopener">${SOCIAL_ICONS.facebook}<span>Facebook</span></a>
                        </p>
                    </div>
                </div>
            </section>`;
    return `${headHTML('', 'Contact | Dogs of Essex', 'Get in touch with Dogs of Essex - questions, suggestions, or corrections about a walk. Send us a message or email hello@dogsofessex.co.uk.', { canonical: 'contact.html' })}
</head>
<body>${navHTML('')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('')}

    <script src="script.js?v=${V_JS}"></script>
    <script src="walk.js?v=${V_WALK}"></script>
</body>
</html>
`;
}

// GitHub Pages serves /404.html (with a 404 status) for any missing URL, at any
// depth - so every asset and link here is ROOT-RELATIVE (built with the '/'
// prefix), not relative. noindex + absent from the sitemap keeps it out of
// search. script.js still runs, so the consent banner and Cookie settings work.
function notFoundPage() {
    const body = `
            <section class="section">
                <div class="container">
                    <div class="notfound" id="improve" data-walk="" data-walkid="" data-report-prefill="Broken link: {url}">
                        <p class="eyebrow centered" style="color: var(--color-terracotta);">Error 404</p>
                        <h1>This page has wandered off</h1>
                        <p>We couldn't find the page you were looking for. It may have moved, or the link might be broken. Let's get you back on the trail.</p>
                        <div class="button-row">
                            <a href="/walks/" class="btn btn-primary">Browse walks</a>
                            <a href="/places/" class="btn btn-secondary">Dog-friendly places</a>
                            <a href="/" class="btn btn-secondary">Back to home</a>
                        </div>
                        <p class="notfound-report">Spotted a broken link? <button type="button" class="improve-btn link-inline" data-tiptype="report">Report it</button> and we'll fix it.</p>
                    </div>
                </div>
            </section>`;
    return `${headHTML('/', 'Page not found | Dogs of Essex', "Sorry, we couldn't find that page. Browse dog-friendly walks and places, or head back to the Dogs of Essex homepage.", { extra: '<meta name="robots" content="noindex">' })}
</head>
<body>${navHTML('/')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('/')}

    <script src="/script.js?v=${V_JS}"></script>
    <script src="/walk.js?v=${V_WALK}"></script>
</body>
</html>
`;
}

// --- Saved page ("Your saved adventures") -----------------------------------
// A combined, client-rendered list of the walks and venues a visitor has
// bookmarked. There are no accounts: saves live in the browser's localStorage.
// build.js pre-renders a card for every walk and venue into saved-data.json;
// the page injects the ones whose id is in the visitor's saved list, so the
// cards match the rest of the site exactly. See the Saved logic in script.js.

function slugifyName(s) {
    return String(s == null ? '' : s).toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function titleCaseTown(slug) {
    const small = { le: 'le', on: 'on', the: 'the', and: 'and', upon: 'upon' };
    return slug.split('-').filter(Boolean)
        .map((w) => small[w] || cap(w))
        .join(' ');
}

// Best-effort town for a venue. Places carry no town field, but their id is
// "<name-slug>-<town-slug>", so stripping the name-slug prefix usually yields
// the town. Fall back to a town we already know from a walk, then to the
// nearest walk's town.
function placeTown(p, walks, townSlugs) {
    const ns = slugifyName(p.name);
    if (p.id !== ns && p.id.startsWith(ns + '-')) {
        return titleCaseTown(p.id.slice(ns.length + 1));
    }
    const hit = (townSlugs || []).find((t) => p.id === t || p.id.endsWith('-' + t));
    if (hit) return titleCaseTown(hit);
    const near = nearestWalk(p, walks);
    return near && near.walk ? (near.walk.town || '') : '';
}

// The heart button shared by every saved card (and reused as the generic save
// control via the .js-save-btn hook wired in script.js).
function savedToggleBtn(type, id) {
    return `<button type="button" class="saved-toggle js-save-btn is-saved" data-save-type="${type}" data-save-id="${esc(id)}" aria-pressed="true" aria-label="Remove from saved">${icon('heart')}<span class="action-label">Saved</span></button>`;
}

function savedWalkCardHTML(w) {
    const meta = [w.town, milesLabel(w), timeLabel(w, true)].filter(Boolean).join(' • ');
    const tags = (w.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    return `<article class="walk-card saved-card" data-type="walk" data-id="${esc(w.id)}" data-name="${esc(w.name)}" data-lat="${w.lat}" data-lng="${w.lng}">
                            <div class="photo-ph">${walkPhotoHTML(w, '/')}</div>
                            <div class="walk-card-body">
                                <h3>${esc(w.name)}</h3>
                                ${meta ? `<p class="walk-card-meta">${icon('footprints')}<span>${esc(meta)}</span></p>` : ''}
                                <div class="tag-row">${tags}</div>
                                <div class="saved-actions">
                                    <a class="btn btn-secondary" href="/walks/${esc(w.id)}.html">View walk</a>
                                    ${savedToggleBtn('walk', w.id)}
                                </div>
                            </div>
                        </article>`;
}

// Saved place cards deliberately reuse the walk-card shell (media header +
// body) so walks and venues sit at a matching size in the mixed grid. Venues
// without a photo get the same gradient placeholder walks use, with the venue
// type icon + name.
function savedPlaceCardHTML(p, cat, town) {
    const meta = TYPE_META[p.type] || { icon: icon('map-pin'), label: p.type };
    const secondary = [meta.label, town].filter(Boolean).join(' • ');
    const media = p.image
        ? `<div class="photo-ph"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.parentNode.classList.add('noimg');this.remove()"></div>`
        : `<div class="photo-ph noimg"><span>${meta.icon} ${esc(p.name)}</span></div>`;
    const chips = (p.dogAccess || []).slice(0, 3).map((k) => {
        const m = ACCESS_META[k] || { icon: icon('paw-print'), label: k };
        return `<span class="access-chip">${m.icon} ${esc(m.label)}</span>`;
    }).join('');
    return `<article class="walk-card saved-card saved-place" data-type="place" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-lat="${p.lat}" data-lng="${p.lng}">
                            ${media}
                            <div class="walk-card-body">
                                <h3>${esc(p.name)}</h3>
                                <p class="walk-card-meta">${meta.icon}<span>${esc(secondary)}</span></p>
                                <div class="tag-row">${chips}</div>
                                <div class="saved-actions">
                                    <a class="btn btn-secondary" href="/places/${esc(cat.slug)}/${esc(p.id)}/">View place</a>
                                    ${savedToggleBtn('place', p.id)}
                                </div>
                            </div>
                        </article>`;
}

// { walk: {id: {name, lat, lng, html}}, place: {...} } — everything the Saved
// page needs to draw a card without re-deriving anything client-side.
function savedData(walks, places) {
    const townSlugs = [...new Set(walks.map((w) => slugifyName(w.town || '')).filter(Boolean))]
        .sort((a, b) => b.length - a.length);
    const data = { walk: {}, place: {} };
    walks.filter((w) => w.hasPage).forEach((w) => {
        data.walk[w.id] = { name: w.name, lat: w.lat, lng: w.lng, html: savedWalkCardHTML(w) };
    });
    places.forEach((p) => {
        if (p.dogFriendly === false) return;
        const cat = PLACE_CATEGORIES.find((c) => !c.comingSoon && (c.types || []).includes(p.type));
        if (!cat) return;
        data.place[p.id] = { name: p.name, lat: p.lat, lng: p.lng, html: savedPlaceCardHTML(p, cat, placeTown(p, walks, townSlugs)) };
    });
    return data;
}

function savedPage() {
    const prefix = '../';
    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <h1 class="index-title">Your saved adventures</h1>
                    <p class="index-sub saved-device-note">${icon('bookmark')} <strong>Saved on this device.</strong> Your saved items are stored in this browser and may not appear on another phone or computer.</p>
                </div>
            </section>

            <section class="walk-section saved-section" id="saved-app">
                <div class="container">
                    <div class="saved-toolbar">
                        <div class="saved-tabs" role="tablist" aria-label="Filter saved items">
                            <button type="button" class="saved-tab is-active" data-tab="all" role="tab" aria-selected="true">All</button>
                            <button type="button" class="saved-tab" data-tab="walk" role="tab" aria-selected="false">Walks</button>
                            <button type="button" class="saved-tab" data-tab="place" role="tab" aria-selected="false">Places</button>
                        </div>
                        <label class="saved-sort">Sort
                            <select id="saved-sort">
                                <option value="recent">Recently saved</option>
                                <option value="name">Name</option>
                                <option value="nearest">Nearest</option>
                            </select>
                        </label>
                    </div>
                    <div class="saved-meta">
                        <p class="saved-count" id="saved-count" aria-live="polite"></p>
                        <div class="saved-clear-wrap" id="saved-clear-wrap">
                            <button type="button" class="link-button saved-clear" id="saved-clear">Clear all</button>
                        </div>
                    </div>
                    <p class="saved-note" id="saved-note" role="status" aria-live="polite" hidden></p>
                    <div class="walk-grid saved-grid" id="saved-list"></div>
                    <div class="saved-empty" id="saved-empty" hidden>
                        <span class="saved-empty-icon" aria-hidden="true">${icon('heart')}</span>
                        <h2>Nothing saved yet</h2>
                        <p>Save your favourite walks and dog-friendly places to find them quickly later.</p>
                        <div class="saved-empty-actions">
                            <a class="btn btn-primary" href="/walks/">Explore walks</a>
                            <a class="btn btn-secondary" href="${prefix}places/index.html">Explore places</a>
                        </div>
                    </div>
                    <noscript><p class="section-lead">Saved adventures need JavaScript, since they're stored in your browser.</p></noscript>
                </div>
            </section>`;
    return `${headHTML(prefix, 'Your saved adventures | Dogs of Essex', 'The dog walks and dog-friendly places you have saved on this device, kept handy for your next adventure.', { canonical: 'saved/', extra: '<meta name="robots" content="noindex">' })}
</head>
<body>${navHTML(prefix)}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML(prefix)}

    <script src="${prefix}script.js?v=${V_JS}"></script>
</body>
</html>`;
}

// --- run ---

function readJSON(file) {
    return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
}

// Private stats dashboard, served from an unguessable secret path (the real
// "key"), with a password box on top that hides the content from a casual
// shoulder-surfer. Neither is true server-side auth — this is a static site, so
// the page still exists in source — but the data is only aggregate stats of
// already-public content. The slug is deliberately NOT referenced in robots.txt
// or the sitemap so it can't leak. Only the password's SHA-256 is stored here,
// never the password itself.
const ADMIN_SLUG = '38kdcnep17sygh';
const ADMIN_PW_SHA256 = '1a331057104dfba50380251b58304c17ca2152fba66ecd181ed39b53bc288d8f';
function adminPage(walks, places) {
    const pages = walks.filter((w) => w.hasPage && w.lat != null && w.lng != null);
    const dfPlaces = places.filter((p) => p.dogFriendly !== false && p.lat != null);
    const onWalks = dfPlaces.filter((p) => p.showOnWalkPages !== false);

    // Freshness: places not checked in the last ~6 months.
    const now = new Date();
    const STALE_DAYS = 183;
    const ageDays = (iso) => {
        const t = Date.parse(iso || '');
        return isNaN(t) ? Infinity : Math.floor((now - t) / 86400000);
    };
    const stale = dfPlaces.filter((p) => ageDays(p.lastChecked) > STALE_DAYS)
        .sort((a, b) => ageDays(b.lastChecked) - ageDays(a.lastChecked));

    // Tallies.
    const tally = (arr, keyFn) => {
        const m = {};
        arr.forEach((x) => { const k = keyFn(x); m[k] = (m[k] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const byType = tally(places, (p) => p.type);
    const byTier = tally(places, (p) => effectiveTier(p));
    const byCat = tally(places, (p) => { const c = placeCategoryOf(p); return c ? c.title : 'Uncategorised'; });
    const verified = places.filter((p) => p.verified).length;
    const sponsors = places.filter(isPaid);
    const picks = places.filter((p) => p.doePick === true);

    // Per-walk coverage: nearby dog-friendly places within the day radius, with a
    // café/pub split and the single closest place (any distance).
    const rows = pages.map((w) => {
        const ds = onWalks.map((p) => ({ p, mi: miles(w, { lat: p.lat, lng: p.lng }) })).sort((a, b) => a.mi - b.mi);
        const near = ds.filter((d) => d.mi <= DAY_RADIUS_MI);
        return {
            walk: w.name,
            count: near.length,
            cafes: near.filter((d) => d.p.type === 'cafe').length,
            pubs: near.filter((d) => d.p.type === 'pub').length,
            restaurants: near.filter((d) => d.p.type === 'restaurant').length,
            closest: ds[0] || null
        };
    }).sort((a, b) => (a.closest ? a.closest.mi : 1e9) - (b.closest ? b.closest.mi : 1e9));

    const tile = (value, label, sub) => `
                <div class="tile">
                    <span class="tile-num">${value}</span>
                    <span class="tile-label">${esc(label)}</span>${sub ? `<span class="tile-sub">${esc(sub)}</span>` : ''}
                </div>`;
    const breakdown = (title, entries, fmt) => `
            <div class="panel">
                <h2>${esc(title)}</h2>
                <table class="mini">${entries.map(([k, v]) => `
                    <tr><td>${esc(fmt ? fmt(k) : k)}</td><td class="num">${v}</td></tr>`).join('')}
                </table>
            </div>`;

    const coverageRows = rows.map((r) => `
                    <tr class="${r.count <= 3 ? 'thin' : ''}">
                        <td>${esc(r.walk)}</td>
                        <td class="num" data-sort="${r.count}">${r.count}</td>
                        <td class="num">${r.cafes}</td>
                        <td class="num">${r.pubs}</td>
                        <td class="num">${r.restaurants}</td>
                        <td>${r.closest ? esc(r.closest.p.name) : '—'}</td>
                        <td class="num" data-sort="${r.closest ? r.closest.mi.toFixed(3) : 9999}">${r.closest ? r.closest.mi.toFixed(2) + ' mi' : '—'}</td>
                    </tr>`).join('');

    const listPanel = (title, items, render) => `
            <div class="panel">
                <h2>${esc(title)} <span class="count-badge">${items.length}</span></h2>
                ${items.length ? `<ul class="plain">${items.map(render).join('')}</ul>` : '<p class="muted">None.</p>'}
            </div>`;

    const typeLabel = (t) => (TYPE_META[t] ? TYPE_META[t].label : t);
    const generated = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex,nofollow">
    <title>Admin · Dogs of Essex</title>
    <link rel="icon" href="../favicon.ico" sizes="any">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css?v=${V_CSS}">
    <style>
        .admin { max-width: 1080px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
        .admin-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.75rem 1.25rem; margin-bottom: 1.5rem; }
        .admin-head h1 { font-family: var(--font-serif); font-size: 1.9rem; margin: 0; }
        .admin-head .muted { color: var(--color-muted); font-size: 0.9rem; }
        .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.9rem; margin-bottom: 2rem; }
        .tile { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.15rem; }
        .tile-num { font-family: var(--font-serif); font-size: 2rem; line-height: 1; color: var(--color-forest); }
        .tile-label { font-weight: 500; font-size: 0.9rem; }
        .tile-sub { color: var(--color-muted); font-size: 0.78rem; }
        .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 2rem; align-items: start; }
        .panel { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1.1rem 1.25rem; }
        .panel h2 { font-family: var(--font-serif); font-size: 1.15rem; margin: 0 0 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
        table.mini, table.cov { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        table.mini td { padding: 0.28rem 0; border-bottom: 1px solid var(--color-border); }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .cov-wrap { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1.1rem 1.25rem; overflow-x: auto; }
        table.cov th, table.cov td { padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--color-border); text-align: left; white-space: nowrap; }
        table.cov th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-muted); cursor: pointer; user-select: none; }
        table.cov th.num, table.cov td.num { text-align: right; }
        table.cov tr.thin td { background: rgba(200, 90, 60, 0.07); }
        .count-badge { background: var(--color-forest); color: #fff; font: 500 0.75rem/1 var(--font-sans); padding: 0.2rem 0.5rem; border-radius: 999px; }
        ul.plain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.9rem; }
        ul.plain li { display: flex; justify-content: space-between; gap: 0.75rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.35rem; }
        ul.plain .meta { color: var(--color-muted); font-size: 0.82rem; white-space: nowrap; }
        .muted { color: var(--color-muted); }
        .legend { font-size: 0.8rem; color: var(--color-muted); margin: 0.5rem 0 0; }
        h2.section { font-family: var(--font-serif); font-size: 1.3rem; margin: 2rem 0 0.9rem; }
        #gate { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--color-bg); z-index: 100; }
        #gate form { background: var(--color-card); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 2rem; width: min(360px, 90vw); text-align: center; }
        #gate h1 { font-family: var(--font-serif); font-size: 1.4rem; margin: 0 0 1rem; }
        #gate input { width: 100%; padding: 0.7rem 0.9rem; border: 1px solid var(--color-border); border-radius: 999px; font-size: 1rem; margin-bottom: 0.75rem; }
        #gate button { width: 100%; padding: 0.7rem; border: none; border-radius: 999px; background: var(--color-forest); color: #fff; font-weight: 500; font-size: 0.95rem; cursor: pointer; }
        #gate .err { color: var(--color-terracotta); font-size: 0.85rem; min-height: 1.1em; margin: 0.4rem 0 0; }
    </style>
</head>
<body>
    <div id="gate">
        <form id="gate-form" autocomplete="off">
            <h1>🐾 Private</h1>
            <input type="password" id="gate-pw" placeholder="Password" aria-label="Password" autofocus>
            <button type="submit">Enter</button>
            <p class="err" id="gate-err" role="alert"></p>
        </form>
    </div>
    <div id="dash" hidden>
    <div class="admin">
        <div class="admin-head">
            <h1>🐾 Dogs of Essex — Admin</h1>
            <span class="muted">Private dashboard · generated ${generated} · reflects the last build/push</span>
        </div>

        <div class="tiles">
            ${tile(pages.length, 'Walk pages', `${walks.length} in data`)}
            ${tile(places.length, 'Places', `${onWalks.length} shown on walks`)}
            ${tile(verified, 'Verified', `${places.length - verified} unverified`)}
            ${tile(sponsors.length, 'Sponsors', 'paid tiers')}
            ${tile(picks.length, 'Dogs of Essex Picks', 'editorial')}
            ${tile(stale.length, 'Need a re-check', 'not checked in 6+ months')}
        </div>

        <div class="panels">
            ${breakdown('Places by type', byType, typeLabel)}
            ${breakdown('Places by category', byCat)}
            ${breakdown('Places by tier', byTier, (t) => t.charAt(0).toUpperCase() + t.slice(1))}
        </div>

        <h2 class="section">Coverage — places near each walk</h2>
        <div class="cov-wrap">
            <table class="cov" id="cov">
                <thead>
                    <tr>
                        <th>Walk</th>
                        <th class="num">Nearby ≤${DAY_RADIUS_MI}mi</th>
                        <th class="num">Cafés</th>
                        <th class="num">Pubs</th>
                        <th class="num">Restaurants</th>
                        <th>Closest place</th>
                        <th class="num">Distance</th>
                    </tr>
                </thead>
                <tbody>${coverageRows}
                </tbody>
            </table>
            <p class="legend">Highlighted rows have 3 or fewer nearby places — the walks most worth adding a café or pub to. Click a column heading to sort.</p>
        </div>

        <div class="panels" style="margin-top:2rem;">
            ${listPanel('Sponsors', sponsors, (p) => `<li><span>${esc(p.name)}</span><span class="meta">${esc(effectiveTier(p))}</span></li>`)}
            ${listPanel('Dogs of Essex Picks', picks, (p) => `<li><span>${esc(p.name)}</span><span class="meta">${esc(typeLabel(p.type))}</span></li>`)}
            ${listPanel('Need a re-check', stale, (p) => `<li><span>${esc(p.name)}</span><span class="meta">${p.lastChecked ? formatDate(p.lastChecked) : 'never'}</span></li>`)}
        </div>
    </div>
    </div>

    <script>
        // Password gate. NOT real security (the page exists in source) — it just
        // hides the dashboard from a casual onlooker who has the secret URL. Only
        // the SHA-256 of the password lives here; the real protection is the
        // unguessable path.
        (function () {
            const HASH = '${ADMIN_PW_SHA256}';
            const gate = document.getElementById('gate');
            const dash = document.getElementById('dash');
            const form = document.getElementById('gate-form');
            const pw = document.getElementById('gate-pw');
            const err = document.getElementById('gate-err');
            const KEY = 'doe-admin-ok';
            async function sha(s) {
                const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
                return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
            }
            function unlock() { gate.remove(); dash.hidden = false; initSort(); }
            if (sessionStorage.getItem(KEY) === '1') { unlock(); return; }
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (await sha(pw.value) === HASH) { sessionStorage.setItem(KEY, '1'); unlock(); }
                else { err.textContent = 'Nope, try again.'; pw.value = ''; pw.focus(); }
            });
        })();

        // Click-to-sort for the coverage table (called once unlocked).
        function initSort() {
            const table = document.getElementById('cov');
            if (!table) return;
            const tbody = table.tBodies[0];
            Array.from(table.tHead.rows[0].cells).forEach((th, i) => {
                let asc = true;
                th.addEventListener('click', () => {
                    const rows = Array.from(tbody.rows);
                    const val = (r) => {
                        const cell = r.cells[i];
                        const s = cell.dataset.sort != null ? cell.dataset.sort : cell.textContent;
                        const n = parseFloat(s);
                        return isNaN(n) ? s.toLowerCase() : n;
                    };
                    rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); });
                    asc = !asc;
                    rows.forEach((r) => tbody.appendChild(r));
                });
            });
        }
    </script>
</body>
</html>
`;
}

function build() {
    // House style: no "big" dashes. Every generated .html page has its em (—)
    // and en (–) dashes normalised to a plain hyphen (-) on write, so this holds
    // forever for all pages - current and future - whatever the data contains.
    // (Non-HTML output like sitemap.xml / robots.txt is left untouched.)
    const _writeFileSync = fs.writeFileSync.bind(fs);
    fs.writeFileSync = (file, data, ...rest) => {
        if (typeof file === 'string' && file.endsWith('.html') && typeof data === 'string') {
            data = data.replace(/[–—]/g, '-');
        }
        return _writeFileSync(file, data, ...rest);
    };

    const walks = readJSON('walks.json');
    const places = readJSON('places.json');
    let tips = [];
    try { tips = readJSON('tips.json'); } catch (e) { /* optional */ }

    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

    const pages = walks.filter((w) => w.hasPage);
    pages.forEach((walk) => {
        const html = page(walk, walks, places, tips);
        const file = path.join(OUT, `${walk.id}.html`);
        fs.writeFileSync(file, html);
        console.log(`  ✓ walks/${walk.id}.html`);
    });

    fs.writeFileSync(path.join(OUT, 'index.html'), walksIndexPage(walks));
    console.log('  ✓ walks/index.html');

    fs.writeFileSync(path.join(ROOT, 'privacy.html'), privacyPage());
    console.log('  ✓ privacy.html');

    fs.writeFileSync(path.join(ROOT, 'terms.html'), termsPage());
    console.log('  ✓ terms.html');

    fs.writeFileSync(path.join(ROOT, 'contact.html'), contactPage());
    console.log('  ✓ contact.html');

    fs.writeFileSync(path.join(ROOT, 'about.html'), aboutPage());
    console.log('  ✓ about.html');

    // Custom 404 (GitHub Pages serves this with a 404 status). Deliberately NOT
    // added to the sitemap/urls below.
    fs.writeFileSync(path.join(ROOT, '404.html'), notFoundPage());
    console.log('  ✓ 404.html');

    // Newsletter thank-you page (systeme.io redirects here after signup). Lives
    // at /thank-you/ for a clean URL; noindex since it's a post-action page.
    const TY_OUT = path.join(ROOT, 'thank-you');
    if (!fs.existsSync(TY_OUT)) fs.mkdirSync(TY_OUT, { recursive: true });
    fs.writeFileSync(path.join(TY_OUT, 'index.html'), thankYouPage());
    console.log('  ✓ thank-you/index.html');

    // Best For hub + one curated page per category.
    const BF_OUT = path.join(ROOT, 'best-for');
    if (!fs.existsSync(BF_OUT)) fs.mkdirSync(BF_OUT, { recursive: true });
    fs.writeFileSync(path.join(BF_OUT, 'index.html'), bestForIndexPage());
    console.log('  ✓ best-for/index.html');
    BEST_FOR.forEach((cat) => {
        const dir = path.join(BF_OUT, cat.slug);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), bestForCategoryPage(cat, walks));
        console.log(`  ✓ best-for/${cat.slug}/index.html`);
    });

    // Places hub + category pages + venue pages (partner/featured venues only).
    const PL_OUT = path.join(ROOT, 'places');
    if (!fs.existsSync(PL_OUT)) fs.mkdirSync(PL_OUT, { recursive: true });
    fs.writeFileSync(path.join(PL_OUT, 'index.html'), placesIndexPage(places, walks));
    console.log('  ✓ places/index.html');
    let venueCount = 0;
    PLACE_CATEGORIES.forEach((cat) => {
        if (cat.comingSoon) return;
        const dir = path.join(PL_OUT, cat.slug);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), placesCategoryPage(cat, places, walks));
        console.log(`  ✓ places/${cat.slug}/index.html`);
        // Tier 1 promise: every dog-friendly place gets its own detail page.
        placesInCategory(cat, places)
            .forEach((p) => {
                const vdir = path.join(dir, p.id);
                if (!fs.existsSync(vdir)) fs.mkdirSync(vdir, { recursive: true });
                fs.writeFileSync(path.join(vdir, 'index.html'), venuePage(p, cat, walks));
                console.log(`  ✓ places/${cat.slug}/${p.id}/index.html`);
                venueCount++;
            });
    });

    // --- search-index.json (site-wide search) ---
    // A tiny flat index the client fetches on first search: one entry per walk
    // and per dog-friendly venue. `n` name, `u` url, `g` kind badge, `s`
    // subtitle, `k` a lowercase keyword blob used for matching. Town search
    // works through `k` — walks carry their own town/area; places borrow the
    // town of their nearest walk (they have no town field of their own).
    const searchEntries = [];
    walks.filter((w) => w.hasPage).forEach((w) => {
        const town = w.town || '';
        searchEntries.push({
            t: 'walk', g: 'Walk', n: w.name, u: `/walks/${w.id}.html`,
            s: [town, w.area].filter(Boolean).join(' · '),
            k: [w.name, town, w.area, w.scenery, w.terrain, (w.tags || []).join(' ')]
                .filter(Boolean).join(' ').toLowerCase()
        });
    });
    places.forEach((p) => {
        if (p.dogFriendly === false) return;
        const cat = PLACE_CATEGORIES.find((c) => !c.comingSoon && (c.types || []).includes(p.type));
        if (!cat) return;
        const kind = (TYPE_META[p.type] && TYPE_META[p.type].label) || 'Place';
        const near = nearestWalk(p, walks);
        const nearTown = near && near.walk ? (near.walk.town || '') : '';
        searchEntries.push({
            t: 'place', g: kind, n: p.name, u: `/places/${cat.slug}/${p.id}/`,
            s: nearTown ? `Near ${nearTown}` : '',
            k: [p.name, kind, String(p.id).replace(/-/g, ' '), nearTown, (p.notes || '').slice(0, 120)]
                .filter(Boolean).join(' ').toLowerCase()
        });
    });
    fs.writeFileSync(path.join(ROOT, 'search-index.json'), JSON.stringify(searchEntries));
    console.log(`  ✓ search-index.json (${searchEntries.length} entries)`);

    // --- Saved page + its data (saved-data.json) ---
    const SAVED_OUT = path.join(ROOT, 'saved');
    if (!fs.existsSync(SAVED_OUT)) fs.mkdirSync(SAVED_OUT, { recursive: true });
    const savedIndex = savedData(walks, places);
    fs.writeFileSync(path.join(ROOT, 'saved-data.json'), JSON.stringify(savedIndex));
    fs.writeFileSync(path.join(SAVED_OUT, 'index.html'), savedPage());
    console.log(`  ✓ saved/index.html + saved-data.json (${Object.keys(savedIndex.walk).length} walks, ${Object.keys(savedIndex.place).length} places)`);

    // --- sitemap.xml + robots.txt (regenerated every build, so new pages are
    // picked up automatically) ---
    const urls = [];
    urls.push({ loc: '' });                 // homepage
    urls.push({ loc: 'walks/' });
    pages.forEach((w) => urls.push({ loc: `walks/${w.id}.html`, lastmod: w.added }));
    urls.push({ loc: 'best-for/' });
    BEST_FOR.forEach((cat) => urls.push({ loc: `best-for/${cat.slug}/` }));
    urls.push({ loc: 'places/' });
    PLACE_CATEGORIES.forEach((cat) => {
        if (cat.comingSoon) return;
        urls.push({ loc: `places/${cat.slug}/` });
        placesInCategory(cat, places)
            .forEach((p) => urls.push({ loc: `places/${cat.slug}/${p.id}/` }));
    });
    urls.push({ loc: 'about.html' });
    urls.push({ loc: 'privacy.html' });
    urls.push({ loc: 'terms.html' });
    urls.push({ loc: 'contact.html' });

    const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + urls.map((u) => '  <url>\n    <loc>' + BASE_URL + '/' + u.loc + '</loc>'
            + (u.lastmod ? '\n    <lastmod>' + u.lastmod + '</lastmod>' : '')
            + '\n  </url>').join('\n')
        + '\n</urlset>\n';
    fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
    console.log(`  ✓ sitemap.xml (${urls.length} urls)`);

    const robots = `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`;
    fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots);
    console.log('  ✓ robots.txt');

    // Private stats dashboard — served from a secret, unguessable path. Never
    // linked, never in robots.txt or the sitemap, noindex, plus a password box.
    const adminDir = path.join(ROOT, ADMIN_SLUG);
    if (!fs.existsSync(adminDir)) fs.mkdirSync(adminDir, { recursive: true });
    fs.writeFileSync(path.join(adminDir, 'index.html'), adminPage(walks, places));
    console.log(`  ✓ ${ADMIN_SLUG}/index.html (private, secret path + password)`);

    console.log(`\nBuilt ${pages.length} walk page(s) + walks index + ${BEST_FOR.length} Best For pages + Places hub/${PLACE_CATEGORIES.length} categories/${venueCount} venues from ${walks.length} walks, ${places.length} places, ${tips.length} tips.`);
}

build();
