/* ===========================================================
   build.js — bakes the data layer into static walk pages.

   Reads data/walks.json, data/places.json, data/tips.json and writes
   a fully-rendered walks/<id>.html for every walk with "hasPage": true.
   The content is real HTML (good for SEO); walk.js then adds only
   interactivity (carousel, save/share) on top.

   Run:  node build.js   (or: npm run build)
   Zero dependencies — plain Node.
   =========================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'walks');

// Tuning (keep in sync with the values documented on the site)
const DAY_RADIUS_MI = 10;          // partners/free shown within this radius (no count cap)
const NEARBY_WALK_RADIUS_MI = 25;
const NEARBY_WALK_MAX = 6;
const AVG_MPH = 26;
const ROAD_FACTOR = 1.25;

const TYPE_META = {
    cafe: { icon: '☕', label: 'Café' },
    pub: { icon: '🍺', label: 'Pub' },
    restaurant: { icon: '🍽️', label: 'Restaurant' },
    'garden-centre': { icon: '🪴', label: 'Garden Centre' },
    beach: { icon: '🌊', label: 'Beach' },
    seaside: { icon: '🌊', label: 'Seaside' },
    'swim-spot': { icon: '🌊', label: 'Swim Spot' },
    attraction: { icon: '🎡', label: 'Attraction' },
    shop: { icon: '🛍️', label: 'Shop' },
    'dog-service': { icon: '🐶', label: 'Dog Service' },
    groomer: { icon: '✂️', label: 'Dog Groomer' },
    vet: { icon: '🩺', label: 'Vet' },
    daycare: { icon: '🏡', label: 'Dog Daycare' },
    'dog-walker': { icon: '🦮', label: 'Dog Walker' }
};

// "Make a Day of It" categories, in display order. Each place type maps
// into one of these; anything unmatched falls into "More nearby".
const CATEGORIES = [
    { icon: '☕', label: 'Cafés nearby', types: ['cafe'] },
    { icon: '🍺', label: 'Pubs nearby', types: ['pub'] },
    { icon: '🍽️', label: 'Restaurants nearby', types: ['restaurant'] },
    { icon: '🌊', label: 'Swim spots nearby', types: ['beach', 'seaside', 'swim-spot'] },
    { icon: '🛍️', label: 'Shops nearby', types: ['shop', 'garden-centre'] },
    { icon: '🐶', label: 'Dog services nearby', types: ['dog-service', 'groomer', 'vet', 'daycare', 'dog-walker'] }
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
// /best-for grid + a curated /best-for/<slug>/ page appear automatically —
// no layout changes needed.
const BEST_FOR = [
    { slug: 'reactive-dogs', emoji: '🐕', title: 'Reactive Dogs', key: 'reactive',
        blurb: 'Quiet Essex walks with fewer surprises and more space.',
        intro: 'Looking for calmer walks? These routes tend to be quieter, with good visibility and room to create distance — so reactive dogs can relax and enjoy the sniffs.' },
    { slug: 'puppies', emoji: '🐶', title: 'Puppies', key: 'puppies',
        blurb: 'Shorter routes ideal for little legs and training.',
        intro: 'Short, manageable walks that suit little legs and growing bodies — with plenty of gentle new sights, sounds and smells for early socialisation and training.' },
    { slug: 'senior-dogs', emoji: '🦴', title: 'Senior Dogs', key: 'senior',
        blurb: 'Gentle walks suited to older dogs.',
        intro: 'Looking for gentler walks for older dogs? These routes offer shorter distances, easier terrain and plenty of opportunities for breaks.' },
    { slug: 'pushchairs', emoji: '👶', title: 'Pushchairs', key: 'pushchairs',
        blurb: 'Buggy-friendly routes for families with little ones.',
        intro: 'Firm, even paths and gentle gradients make these walks easy to enjoy with a pushchair alongside the dog.' },
    { slug: 'swimming', emoji: '🌊', title: 'Swimming Dogs', key: 'swimming',
        blurb: 'Walks with opportunities for paddling or swimming.',
        intro: 'For dogs who love the water — these walks offer safe spots to paddle, splash and swim. Always check conditions and seasonal restrictions before letting your dog in.' },
    { slug: 'low-mud', emoji: '🥾', title: 'Low Mud', key: 'mud',
        blurb: 'The driest routes for wet-weather walks.',
        intro: 'Best during wet weather — these are the firmer, better-drained routes that stay walkable when everywhere else turns to mud.' },
    { slug: 'hot-weather', emoji: '☀️', title: 'Hot Weather', key: 'shade',
        blurb: 'Shaded routes and water to keep dogs cool.',
        intro: 'Shaded, sheltered walks — often with water access — to help keep dogs cool and comfortable on warmer days. Always walk early or late and carry water in the heat.' },
    { slug: 'off-lead', emoji: '🐾', title: 'Off Lead', key: 'offlead',
        blurb: 'Safe spaces for dogs with reliable recall.',
        intro: 'Open, enclosed or quiet spaces suited to dogs with reliable recall. Always check local signage for livestock, ground-nesting birds and seasonal lead rules.' },
    { slug: 'high-energy', emoji: '⚡', title: 'High-Energy Dogs', rank: 'distance',
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
    woodland: '🌳', heathland: '🌿', parkland: '🌳',
    coastal: '🌊', seaside: '🌊', park: '🌳'
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

// Place tiers: `partner` (paid, richer tile) or `free` (basic). The big
// editorial card is the walk's `dogsOfEssexPick`, not a place tier.
const EXAMPLE_PLACEHOLDER = 'https://example.com';

// Which contact details each tier is allowed to show. Tune freely.
// `pick` is used for the walk's Dogs of Essex Pick card.
const TIER_CONTACT = {
    pick: { phone: true, email: true, socials: true },
    partner: { phone: false, email: false, socials: true },
    free: { phone: false, email: false, socials: false }
};
const SOCIAL_LABELS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };
const SOCIAL_ICONS = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6c-.8-.1-1.6-.15-2.4-.15-2.4 0-4.05 1.47-4.05 4.16v2.29H7.5V13h2.75v8h3.25z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 5.6a4.3 4.3 0 01-1-2.6h-2.9v11.4a2.1 2.1 0 11-2.1-2.1c.2 0 .4 0 .6.1V9.5a5 5 0 00-.6 0 5 5 0 105 5V8.7a7.1 7.1 0 004 1.2V7a4.3 4.3 0 01-3-1.4z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22 12c0-1.7-.2-3.3-.4-4a2.5 2.5 0 00-1.7-1.7C18.3 6 12 6 12 6s-6.3 0-7.9.3A2.5 2.5 0 002.4 8c-.2.7-.4 2.3-.4 4s.2 3.3.4 4a2.5 2.5 0 001.7 1.7c1.6.3 7.9.3 7.9.3s6.3 0 7.9-.3a2.5 2.5 0 001.7-1.7c.2-.7.4-2.3.4-4zM10 15V9l5 3-5 3z"/></svg>'
};

// Dog-access chips (premium card). Add keys as needed.
const ACCESS_META = {
    inside: { icon: '🐶', label: 'Dogs inside' },
    outside: { icon: '🪑', label: 'Dogs outside' },
    garden: { icon: '🌳', label: 'Garden' },
    'water-bowls': { icon: '💧', label: 'Water bowls' },
    'dog-menu': { icon: '🦴', label: 'Dog menu' },
    treats: { icon: '🍪', label: 'Treats available' },
    'off-lead': { icon: '🐾', label: 'Off-lead area' }
};

// "Places" categories. Each gathers dog-friendly venues whose `type` is in
// `types`; partner/featured venues become "Dogs of Essex Picks" with their own
// venue page, free venues become "More nearby" pills. Add a category here and a
// /places/<slug>/ page (plus venue pages) appear automatically.
const PLACE_CATEGORIES = [
    { slug: 'eat-drink', emoji: '☕', title: 'Eat & Drink', plural: 'places to eat & drink',
        types: ['cafe', 'pub', 'restaurant'],
        blurb: 'Grab lunch, coffee or a pint after your walk.',
        cta: 'Explore eat & drink →',
        intro: 'All the dog-friendly places to eat and drink near your walk — cafés, pubs and restaurants. Use the filters to narrow it down.',
        filters: [
            { type: 'all', label: 'All' },
            { type: 'cafe', label: 'Cafés' },
            { type: 'pub', label: 'Pubs' },
            { type: 'restaurant', label: 'Restaurants' }
        ] },
    { slug: 'things-to-do', emoji: '🌳', title: 'Things to Do', plural: 'things to do',
        types: ['attraction', 'garden-centre', 'shop'],
        blurb: 'Make a full day of it.',
        cta: 'Explore things to do →',
        intro: 'Dog-friendly days out beyond a walk — garden centres, National Trust properties, estates, country parks, markets, farm shops and seasonal attractions.' },
    { slug: 'beaches', emoji: '🏖', title: 'Beaches', plural: 'beaches',
        types: ['beach', 'seaside', 'swim-spot'],
        blurb: 'The best coastal spots for muddy paws.',
        cta: 'Explore beaches →',
        intro: 'Dog-friendly beaches and coastal spots. Check seasonal restrictions, parking and nearby cafés before you set off.',
        note: 'Seasonal restrictions apply on many Essex beaches — dogs are often banned between 1 May and 30 September. Always check local signage before you go.' },
    { slug: 'stay', emoji: '🏨', title: 'Stay', comingSoon: true,
        blurb: 'Coming soon.',
        cta: 'Coming soon' }
];

// Resolve a place's tier to `partner` or `free`. Legacy values are mapped,
// and a partner whose featuredUntil has passed drops back to free.
function effectiveTier(p) {
    let tier = p.partnerTier || 'free';
    if (tier === 'premium' || tier === 'featured') tier = 'partner';
    if (tier === 'none') tier = 'free';
    if (tier === 'partner' && p.featuredUntil) {
        const until = Date.parse(p.featuredUntil);
        if (!isNaN(until) && until < Date.now()) tier = 'free';
    }
    return tier;
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
        ? `\n                                <span class="dog-note">🐕 ${esc(p.dogFriendlyNotes)}</span>` : '';
}

// Dog-access chips from a structured dogAccess array (pick card)
function accessHTML(p) {
    const items = p.dogAccess || [];
    if (!items.length) return '';
    const chips = items.map((k) => {
        const m = ACCESS_META[k] || { icon: '🐾', label: k };
        return `<span class="access-chip">${m.icon} ${esc(m.label)}</span>`;
    }).join('');
    return `\n                                    <div class="premium-access">${chips}</div>`;
}

// A few compact dog tags for partner cards (up to `max`)
function dogTagsHTML(p, max) {
    const items = (p.dogAccess || []).slice(0, max || 4);
    if (!items.length) return '';
    const chips = items.map((k) => {
        const m = ACCESS_META[k] || { icon: '🐾', label: k };
        return `<span class="access-chip">${m.icon} ${esc(m.label)}</span>`;
    }).join('');
    return `\n                                <div class="pc-tags">${chips}</div>`;
}

// Verification / freshness line (who checked it and when)
function verifyHTML(p) {
    if (!p.verified) return '';
    const by = p.checkedBy ? ` by ${esc(p.checkedBy)}` : '';
    const when = p.lastChecked ? ` • ${formatMonthYear(p.lastChecked)}` : '';
    return `\n                                <span class="place-verify">✓ Last checked${by}${when}</span>`;
}

// Distance + drive time as chips (premium card)
function distChipsHTML(p) {
    return `<div class="info-chips">
                                        <span class="access-chip">📍 ${p._mi.toFixed(1)} miles</span>
                                        <span class="access-chip">🚗 ${driveMins(p._mi)} mins</span>
                                    </div>`;
}

// Contact block — only the details this place's tier is allowed to show.
function contactHTML(p, tier) {
    tier = tier || p._tier || effectiveTier(p);
    const show = TIER_CONTACT[tier] || TIER_CONTACT.free;
    const bits = [];
    if (show.phone && p.phone) {
        bits.push(`<a class="contact-link" href="tel:${esc(p.phone.replace(/\s+/g, ''))}">📞 ${esc(p.phone)}</a>`);
    }
    if (show.email && p.email) {
        bits.push(`<a class="contact-link" href="mailto:${esc(p.email)}">✉️ ${esc(p.email)}</a>`);
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
const walkHref = (w) => (w.hasPage ? `${w.id}.html` : '../index.html#walks');

// --- section renderers (return HTML strings) ---

function heroHTML(walk) {
    const rating = walk.rating || {};
    const pct = rating.value ? Math.round((rating.value / 5) * 1000) / 10 : 0;
    const metaLine = [cap(walk.scenery), walk.routeType, walk.timeShort, walk.mud ? 'Mud: ' + walk.mud : '']
        .filter(Boolean).join(' • ');
    const badges = (walk.badges || []).map((b) => `<span class="chip">${esc(b)}</span>`).join('');
    const ratingBlock = rating.value ? `
                <div class="walk-rating">
                    <span class="star-track" aria-hidden="true"><span class="fill" style="width:${pct}%"></span></span>
                    <span class="rating-score">${esc(rating.value)}</span>
                    ${rating.count ? `<span class="rating-count">(${esc(rating.count)} reviews)</span>` : ''}
                </div>` : '';
    return `
                <p class="breadcrumb"><a href="../index.html">Home</a> · <a href="index.html">Walks</a> · ${esc(walk.name)}</p>
                <h1>${walk.emoji ? esc(walk.emoji) + ' ' : ''}${esc(walk.name)}</h1>${ratingBlock}
                ${metaLine ? `<p class="meta-line">${esc(metaLine)}</p>` : ''}
                ${badges ? `<div class="walk-chips">${badges}</div>` : ''}`;
}

function glanceHTML(items) {
    if (!items || !items.length) return '';
    return items.map((row) => `
                        <div class="glance-row">
                            <span class="glance-feature">${esc(row.label)}</span>
                            <span class="glance-stars">${starsHTML(row.score)}</span>
                        </div>`).join('');
}

function galleryHTML(items) {
    if (!items || !items.length) return '';
    return items.map((g, i) => {
        const big = i === 0 ? ' g-big' : '';
        const c = esc(g.caption || '');
        if (g.image) {
            return `
                        <figure class="photo-ph g-item${big}">
                            <img src="${esc(g.image)}" alt="${c}" loading="lazy" onerror="this.remove();this.parentNode.classList.add('noimg')">
                            <figcaption>${c}</figcaption>
                        </figure>`;
        }
        return `
                        <figure class="photo-ph g-item noimg${big}"><figcaption>${c}</figcaption></figure>`;
    }).join('');
}

function routeHTML(walk) {
    const r = walk.route || {};
    const pill = (label, val) => val
        ? `<span class="route-pill"><strong>${esc(label)}</strong> ${esc(val)}</span>` : '';
    return `
                    <div class="route-meta">
                        ${pill('Distance', walk.distance)}
                        ${pill('Time', walk.time)}
                        ${pill('Terrain', walk.terrain)}
                        ${pill('Route', walk.routeType)}
                    </div>
                    ${r.parking ? `<p><strong>Parking &amp; directions.</strong> ${esc(r.parking)}</p>` : ''}
                    ${r.localTip ? `<p class="local-tip">💡 <strong>Local tip:</strong> ${esc(r.localTip)}</p>` : ''}
                    ${r.mapEmbed ? `<div class="map-embed"><iframe src="${esc(r.mapEmbed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map of ${esc(walk.name)}"></iframe></div>` : ''}`;
}

function whatToExpectHTML(paras) {
    if (!paras || !paras.length) return '';
    return paras.map((p) => `
                    <p>${esc(p)}</p>`).join('');
}

// Section inner content (no <section> wrapper — the band wrapper adds it).
// Optional sections return '' when they have no content.
function officialInner(walk) {
    const o = walk.official;
    if (!o || !o.managedBy) return '';
    const site = o.website
        ? `\n                        <li>🌐 <a href="${esc(o.website)}" target="_blank" rel="noopener">${esc(o.managedBy)} website →</a></li>`
        : '';
    return `<h2>Official Information</h2>
                    <p>Managed by ${esc(o.managedBy)}.</p>
                    <ul class="official-list">${site}
                        <li>⚠️ Check for seasonal updates, conservation notices and temporary closures.</li>
                    </ul>`;
}

function galleryInner(walk) {
    if (!walk.gallery || !walk.gallery.length) return '';
    return `<h2>📸 Photo gallery</h2>
                    <p class="section-lead">See what it actually looks like before you go.</p>
                    <div id="gallery" class="gallery-grid">${galleryHTML(walk.gallery)}
                    </div>`;
}

function whatToExpectInner(walk) {
    if (!walk.whatToExpect || !walk.whatToExpect.length) return '';
    return `<h2>What to expect</h2>
                    <div id="what-to-expect">${whatToExpectHTML(walk.whatToExpect)}
                    </div>`;
}

// The walk's single editorial "Dogs of Essex Pick" — the big card.
function pickCardHTML(p) {
    const meta = TYPE_META[p.type] || { icon: '📍', label: p.type };
    const href = placeUrl(p);
    const photo = p.image
        ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove();this.parentNode.classList.add('noimg')">`
        : '';
    return `
                        <article class="day-card premium">
                            <div class="premium-badge-bar">
                                <span class="badge-main">★ Dogs of Essex Pick</span>
                                <span class="badge-sub">Our recommended stop for this walk</span>
                            </div>
                            <div class="premium-main">
                                <div class="premium-photo photo-ph">${photo}</div>
                                <div class="premium-content">
                                    <span class="premium-type">${meta.icon} ${esc(meta.label)}</span>
                                    <h3 class="premium-name">${esc(p.name)}</h3>
                                    ${distChipsHTML(p)}
                                    ${p.notes ? `<p class="premium-desc">${esc(p.notes)}</p>` : ''}${accessHTML(p)}
                                    <div class="pc-actions">
                                        ${href ? `<a class="btn btn-primary premium-cta" href="${esc(href)}" target="_blank" rel="noopener">Visit website →</a>` : ''}
                                        <a class="pc-map" href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">📍 Go to map</a>
                                    </div>${contactHTML(p, 'pick')}${verifyHTML(p)}
                                </div>
                            </div>
                        </article>`;
}

// A paid partner — compact card: name, distance, one-liner, dog tags, CTA.
function partnerCardHTML(p, extraClass) {
    const meta = TYPE_META[p.type] || { icon: '📍', label: p.type };
    const href = placeUrl(p);
    return `
                                <article class="day-card partner-card${extraClass || ''}">
                                    <h4 class="pc-name">${meta.icon} ${esc(p.name)}</h4>
                                    <span class="pc-dist">${distLine(p)}</span>
                                    ${p.notes ? `<p class="pc-desc">${esc(p.notes)}</p>` : ''}${dogTagsHTML(p, 4)}
                                    <div class="pc-actions">
                                        ${href ? `<a class="pc-cta" href="${esc(href)}" target="_blank" rel="noopener">Visit website →</a>` : ''}
                                        <a class="pc-map" href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">📍 Go to map</a>
                                    </div>
                                </article>`;
}

// A free listing — a compact pill (name + distance + arrow) that opens Google Maps.
function freePillHTML(p) {
    const meta = TYPE_META[p.type] || { icon: '📍', label: p.type };
    return `
                            <a class="free-pill" href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">
                                <span class="fp-name">${meta.icon} ${esc(p.name)}</span>
                                <span class="fp-dist">${distLine(p)}</span>
                                <span class="fp-arrow" aria-hidden="true">↗</span>
                            </a>`;
}

function dayHTML(walk, places) {
    const origin = { lat: walk.lat, lng: walk.lng };
    const pickId = walk.dogsOfEssexPick;

    const withDist = places
        .filter((p) => p.dogFriendly !== false && p.showOnWalkPages !== false)
        .map((p) => ({ ...p, _mi: miles(origin, { lat: p.lat, lng: p.lng }), _tier: effectiveTier(p) }));

    // The pick is shown regardless of distance (it's chosen for this walk).
    const pick = pickId ? withDist.find((p) => p.id === pickId) : null;

    const inRange = withDist
        .filter((p) => p.id !== pickId && p._mi <= DAY_RADIUS_MI)
        .sort((a, b) => a._mi - b._mi);

    // Each category: partner cards, then a lighter "More nearby …" panel of free pills.
    const categoryBlock = (icon, label, items) => {
        const partners = items.filter((p) => p._tier === 'partner');
        const frees = items.filter((p) => p._tier === 'free');
        let noun = label.replace(/\s*nearby$/i, '').toLowerCase();
        if (!noun || noun === 'more') noun = 'places';
        let body = '';

        const INITIAL = 2; // partner cards shown before "Show more"
        // Free panel tucks into the expander whenever there are partner cards above it.
        const tuckFree = frees.length > 0 && partners.length > 0;
        const showToggle = partners.length > INITIAL || tuckFree;

        if (partners.length === 1) {
            body += `\n                        <div class="day-grid single">${partnerCardHTML(partners[0])}</div>`;
        } else if (partners.length >= 2) {
            const odd = partners.length % 2 === 1;
            const cards = partners.map((p, i) => {
                let cls = '';
                if (odd && i === partners.length - 1) cls += ' span-center';
                if (i >= INITIAL) cls += ' day-extra';
                return partnerCardHTML(p, cls);
            }).join('');
            body += `\n                        <div class="day-grid">${cards}</div>`;
        }

        if (frees.length) {
            body += `
                        <div class="more-free${tuckFree ? ' day-extra-panel' : ''}">
                            <h4 class="more-free-title">Other nearby ${esc(noun)}</h4>
                            <div class="free-pills">${frees.map(freePillHTML).join('')}</div>
                        </div>`;
        }

        if (showToggle) {
            body += `\n                        <button class="day-more-toggle" type="button">Show more ↓</button>`;
        }

        return `
                    <div class="day-category">
                        <h3 class="day-cat-head">${icon} ${esc(label)} (${items.length})</h3>${body}
                    </div>`;
    };

    const used = new Set();
    let sections = '';
    for (const cat of CATEGORIES) {
        const inCat = inRange.filter((p) => cat.types.includes(p.type));
        if (!inCat.length) continue;
        inCat.forEach((p) => used.add(p.id));
        sections += categoryBlock(cat.icon, cat.label, inCat);
    }
    const leftover = inRange.filter((p) => !used.has(p.id));
    if (leftover.length) sections += categoryBlock('📍', 'More nearby', leftover);

    if (!pick && !sections) return '';

    const who = esc((walk.town || walk.name).split(' ')[0]);
    return `
                    <h2>🐾 Make a Day of It</h2>
                    <p class="section-lead">Already heading to ${who}? Here's what other local dog owners pair with this walk.</p>
                    ${pick ? pickCardHTML(pick) : ''}
                    ${sections}`;
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
        const icon = SCENERY_ICON[w.scenery] || '🐾';
        return `
                            <a href="${walkHref(w)}" class="walk-card nearby-card">
                                <div class="photo-ph"><span>${icon} ${esc(w.name)}</span></div>
                                <div class="walk-card-body">
                                    <h3>${esc(w.name)}</h3>
                                    <div class="nearby-meta">
                                        <span class="meta-badge">📍 ${w._mi.toFixed(1)} mi</span>
                                        <span class="meta-badge">🚗 ~${driveMins(w._mi)} min</span>
                                    </div>
                                    <span class="link-arrow">${w.hasPage ? 'Explore Walk →' : 'Coming soon'}</span>
                                </div>
                            </a>`;
    }).join('');
    return `
                    <h2>🧭 Explore Nearby</h2>
                    <p class="section-lead">Other dog-friendly walks within easy reach of ${esc(walk.name)}.</p>
                    <div class="carousel">
                        <button class="carousel-btn prev" type="button" aria-label="Scroll left">‹</button>
                        <div class="carousel-track">${cards}</div>
                        <button class="carousel-btn next" type="button" aria-label="Scroll right">›</button>
                    </div>`;
}

function tipsHTML(walkId, tips) {
    const mine = tips.filter((t) => t.walkId === walkId);
    if (!mine.length) {
        return '<p class="section-lead" style="margin:0;">Be the first to leave a tip for this walk.</p>';
    }
    return mine.map((t) => `
                        <blockquote class="tip-card">${esc(t.tip)}</blockquote>`).join('');
}

// --- shared chrome (parameterized by `prefix` = relative path to site root) ---

function headHTML(prefix, title, description, extra) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-NHQMLEF7QJ"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-NHQMLEF7QJ');
    </script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">${extra ? '\n    ' + extra : ''}
    <!-- This page is generated by build.js — do not edit by hand. -->
    <link rel="icon" href="${prefix}favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="${prefix}favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="${prefix}favicon-16x16.png">
    <link rel="apple-touch-icon" href="${prefix}apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${prefix}styles.css">`;
}

function navHTML(prefix) {
    return `
    <header class="site-header">
        <div class="container">
            <nav class="nav">
                <a href="${prefix}index.html" class="logo">Dogs of Essex</a>
                <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">☰</button>
                <ul class="nav-links">
                    <li><a href="${prefix}walks/index.html">Walks</a></li>
                    <li><a href="${prefix}best-for/index.html">Best For</a></li>
                    <li><a href="${prefix}places/index.html">Places</a></li>
                    <li><a href="${prefix}index.html#meetups">Meetups</a></li>
                    <li><a href="${prefix}index.html#newsletter" class="nav-cta">Join the Pack</a></li>
                </ul>
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
                    <p>The local guide for dog owners in Essex — walks, places and adventures worth sharing.</p>
                </div>
                <div class="footer-col">
                    <h4>Explore</h4>
                    <ul>
                        <li><a href="${prefix}walks/index.html">Walks</a></li>
                        <li><a href="${prefix}best-for/index.html">Best For</a></li>
                        <li><a href="${prefix}places/index.html">Places</a></li>
                        <li><a href="${prefix}index.html#meetups">Meetups</a></li>
                    </ul>
                </div>
                <div class="footer-col">
                    <h4>Information</h4>
                    <ul>
                        <li><a href="#">About</a></li>
                        <li><a href="mailto:hello@dogsofessex.co.uk?subject=Dogs%20of%20Essex%20Enquiry">Contact</a></li>
                        <li><a href="#">Privacy Policy</a></li>
                    </ul>
                </div>
                <div class="footer-col">
                    <h4>Follow</h4>
                    <ul>
                        <li><a href="https://instagram.com/thedogsofessex" target="_blank" rel="noopener">Instagram</a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <span>&copy; <span id="year"></span> Dogs of Essex</span>
                <span>Made with muddy paws in Essex 🐾</span>
            </div>
        </div>
    </footer>`;
}

// --- page assembly ---

function page(walk, walks, places, tips) {
    const seo = walk.seo || {};
    const title = seo.title || `${walk.name} | Dogs of Essex`;
    const description = seo.description || walk.intro || '';
    const tipSubject = encodeURIComponent(`Walk tip: ${walk.name}`);
    const og = [
        `<meta property="og:type" content="article">`,
        `<meta property="og:title" content="${esc(title)}">`,
        description ? `<meta property="og:description" content="${esc(description)}">` : '',
        seo.image ? `<meta property="og:image" content="${esc(seo.image)}">` : ''
    ].filter(Boolean).join('\n    ');

    // Content bands — rendered in order, alternating background like the homepage.
    // Optional bands (gallery, what-to-expect, official) drop out when empty, and
    // the alternation re-computes so the stripes stay consistent.
    const bands = [
        { narrow: true, html: `<p class="lead-intro" id="walk-intro">${esc(walk.intro || '')}</p>
                    <h2>At a glance</h2>
                    <p class="section-lead">Honest ratings, so you can decide in seconds whether it suits your dog.</p>
                    <div id="glance" class="glance">${glanceHTML(walk.glance)}
                    </div>` },
        (walk.gallery && walk.gallery.length) && { narrow: false, html: galleryInner(walk) },
        { narrow: true, html: `<h2>🗺️ The route</h2>
                    <div id="route">${routeHTML(walk)}
                    </div>` },
        (walk.whatToExpect && walk.whatToExpect.length) && { narrow: true, html: whatToExpectInner(walk) },
        (walk.official && walk.official.managedBy) && { narrow: true, html: officialInner(walk) },
        { narrow: false, html: `<div id="make-a-day">${dayHTML(walk, places)}
                    </div>` },
        { narrow: false, html: `<div id="explore-nearby">${exploreHTML(walk, walks)}
                    </div>` },
        { narrow: true, html: `<h2>💬 Community tips</h2>
                    <p class="section-lead">From local dog owners who've walked it.</p>
                    <div id="community-tips" class="tips-grid">${tipsHTML(walk.id, tips)}
                    </div>
                    <p class="tip-cta">Visited recently? <a href="mailto:hello@dogsofessex.co.uk?subject=${tipSubject}">Leave a tip →</a></p>
                    <div class="walk-actions">
                        <a href="#" id="save-walk" class="btn btn-secondary">♡ Save this walk</a>
                        <a href="#" id="email-walk" class="btn btn-secondary">📧 Email this walk</a>
                        <a href="#" id="share-walk" class="btn btn-secondary">🔗 Share</a>
                    </div>` }
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
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-NHQMLEF7QJ"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-NHQMLEF7QJ');
    </script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${og}
    <!-- This page is generated by build.js from data/walks.json — do not edit by hand. -->
    <link rel="icon" href="../favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="../favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="../favicon-16x16.png">
    <link rel="apple-touch-icon" href="../apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css">
    <script>window.WALK_ID = "${walk.id}";</script>
</head>
<body>${navHTML('../')}

    <main>
        <section class="walk-hero">
            <div class="container walk-hero-inner" id="walk-hero">${heroHTML(walk)}
            </div>
        </section>

        <div class="walk-body">${walkBody}
        </div>
    </main>
${footerHTML('../')}

    <script src="../script.js"></script>
    <script src="../walk.js"></script>
</body>
</html>
`;
}

// --- walks index page (/walks/) ---

function indexWalkCard(w, i) {
    const icon = SCENERY_ICON[w.scenery] || '🐾';
    const meta = [w.distance, w.time, w.mud ? 'Mud: ' + w.mud : ''].filter(Boolean).join(' • ');
    const tags = (w.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    // glance scores (for filtering) + sort metadata as data attributes
    const glance = (w.glance || []).map((g) => {
        const k = GLANCE_KEYS[g.label];
        return k ? ` data-${k}="${g.score}"` : '';
    }).join('');
    const data = `${glance} data-lat="${w.lat}" data-lng="${w.lng}"`
        + ` data-miles="${parseFloat(w.distance) || 0}" data-order="${i}"`
        + ` data-pop="${(w.rating && w.rating.count) || 0}" data-added="${esc(w.added || '')}"`;
    const inner = `
                            <div class="photo-ph"><span>${icon} ${esc(w.name)}</span></div>
                            <div class="walk-card-body">
                                <h3>${esc(w.name)}</h3>
                                ${meta ? `<p class="walk-card-meta">${esc(meta)}</p>` : ''}
                                <div class="tag-row">${tags}</div>
                                <div class="walk-card-stars" hidden></div>
                                <span class="link-arrow">${w.hasPage ? 'Explore Walk →' : 'Basic details available now. Full review coming soon.'}</span>
                            </div>`;
    return w.hasPage
        ? `\n                        <a href="${esc(w.id)}.html" class="walk-card"${data}>${inner}
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
                    <p class="index-sub">Discover ${walks.length} dog-tested walk${walks.length === 1 ? '' : 's'} across Essex — with more added every month.</p>
                    <h2 class="controls-title">Find the perfect walk</h2>
                    <div class="controls-row">
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
            </section>

            <section class="walk-section section-alt walk-index-grid">
                <div class="container">
                    <div class="walk-grid walks-index-grid">${walks.map((w, i) => indexWalkCard(w, i)).join('')}
                    </div>
                    <p class="no-results" hidden>No walks match those filters yet — try fewer.</p>
                </div>
            </section>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-NHQMLEF7QJ"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-NHQMLEF7QJ');
    </script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dog Walks in Essex | Dogs of Essex</title>
    <meta name="description" content="Browse honest, dog-tested walks across Essex — woodland, heathland, parkland and coastal routes for you and your dog.">
    <!-- This page is generated by build.js — do not edit by hand. -->
    <link rel="icon" href="../favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="../favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="../favicon-16x16.png">
    <link rel="apple-touch-icon" href="../apple-touch-icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css">
</head>
<body>${navHTML('../')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('../')}

    <script src="../script.js"></script>
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

function walkPhotoHTML(w) {
    const icon = SCENERY_ICON[w.scenery] || '🐾';
    const img = (w.gallery && w.gallery[0] && w.gallery[0].image) ? w.gallery[0].image : '';
    return img
        ? `<img src="${esc(img)}" alt="${esc(w.name)}" loading="lazy" onerror="this.remove();this.parentNode.classList.add('noimg')">`
        : `<span>${icon} ${esc(w.name)}</span>`;
}

// The category's strongest walk — reuses the "Dogs of Essex Pick" premium styling.
function walkPickCardHTML(w, cat, prefix) {
    const href = `${prefix}walks/${esc(w.id)}.html`;
    const chips = [w.distance ? `📏 ${esc(w.distance)}` : '', w.time ? `⏱️ ${esc(w.time)}` : '']
        .filter(Boolean).map((c) => `<span class="access-chip">${c}</span>`).join('');
    return `
                    <article class="day-card premium walk-pick">
                        <div class="premium-badge-bar">
                            <span class="badge-main">★ Dogs of Essex Pick</span>
                            <span class="badge-sub">Our top walk for ${esc(cat.title.toLowerCase())}</span>
                        </div>
                        <div class="premium-main">
                            <div class="premium-photo photo-ph">${walkPhotoHTML(w)}</div>
                            <div class="premium-content">
                                <span class="premium-type">${SCENERY_ICON[w.scenery] || '🐾'} ${esc(cap(w.scenery))}</span>
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
    const icon = SCENERY_ICON[w.scenery] || '🐾';
    const meta = [w.distance, w.time, w.mud ? 'Mud: ' + w.mud : ''].filter(Boolean).join(' • ');
    const tags = (w.tags || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    return `
                        <a href="${prefix}walks/${esc(w.id)}.html" class="walk-card">
                            <div class="photo-ph"><span>${icon} ${esc(w.name)}</span></div>
                            <div class="walk-card-body">
                                <h3>${esc(w.name)}</h3>
                                ${meta ? `<p class="walk-card-meta">${esc(meta)}</p>` : ''}
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
    return `${headHTML('../', 'Best For — Find the right walk for your dog | Dogs of Essex',
        'Find the perfect Essex walk for your dog — reactive dogs, puppies, senior dogs, swimming, low mud, hot weather, off lead and high-energy dogs.')}
</head>
<body>${navHTML('../')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('../')}

    <script src="../script.js"></script>
</body>
</html>
`;
}

function seniorScaleHTML() {
    const rows = SENIOR_SCALE.map((s) => `
                        <div class="glance-row">
                            <span class="glance-stars">${starsHTML(s.stars)}</span>
                            <span class="glance-feature"><strong>${esc(s.label)}</strong> — ${esc(s.note)}</span>
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
        : `<p class="section-lead">We're still reviewing walks for this category — check back soon.</p>`;

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
    return `${headHTML(prefix, title, cat.intro)}
</head>
<body>${navHTML(prefix)}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML(prefix)}

    <script src="${prefix}script.js"></script>
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
    if (web) rows.push(`<li>🌐 <a href="${esc(web)}" target="_blank" rel="noopener">Visit website ↗</a></li>`);
    if (p.phone) rows.push(`<li>📞 <a href="tel:${esc(p.phone.replace(/\s+/g, ''))}">${esc(p.phone)}</a></li>`);
    if (p.email) rows.push(`<li>✉️ <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></li>`);
    rows.push(`<li>📍 <a href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">Go to map ↗</a></li>`);
    const socials = placeSocialsHTML(p);
    if (socials) rows.push(`<li>${socials}</li>`);
    return `<ul class="venue-info">${rows.join('')}</ul>`;
}

function accessBadgesHTML(p) {
    const items = p.dogAccess || [];
    if (!items.length) return '';
    const chips = items.map((k) => {
        const m = ACCESS_META[k] || { icon: '🐾', label: k };
        return `<span class="access-chip">${m.icon} ${esc(m.label)}</span>`;
    }).join('');
    return `<div class="premium-access">${chips}</div>`;
}

// A partner venue — the same compact partner card used on walk pages, plus a
// "View details" link to its venue page. The badge bar / large photo (the
// "Dogs of Essex Pick" look) is intentionally not used here.
function placePartnerCardHTML(p, walks) {
    const meta = TYPE_META[p.type] || { icon: '📍', label: p.type };
    const near = nearestWalk(p, walks);
    const web = placeUrl(p);
    return `
                        <article class="day-card partner-card venue-card" data-place-type="${esc(p.type)}" data-lat="${p.lat}" data-lng="${p.lng}">
                            <h4 class="pc-name">${meta.icon} ${esc(p.name)}</h4>
                            <span class="pc-dist place-dist">${near ? `${near.mi.toFixed(1)} mi from ${esc(near.walk.name)}` : ''}</span>
                            ${p.notes ? `<p class="pc-desc">${esc(p.notes)}</p>` : ''}${dogTagsHTML(p, 4)}
                            <div class="pc-actions">
                                <a class="pc-cta" href="${esc(p.id)}/index.html">View details →</a>
                                ${web ? `<a class="pc-cta" href="${esc(web)}" target="_blank" rel="noopener">Visit website ↗</a>` : ''}
                                <a class="pc-map" href="${esc(mapsUrl(p))}" target="_blank" rel="noopener">📍 Go to map</a>
                            </div>
                        </article>`;
}

// A free venue — a pill linking straight to its own website (or map).
function placeFreePillHTML(p, walks) {
    const meta = TYPE_META[p.type] || { icon: '📍', label: p.type };
    const near = nearestWalk(p, walks);
    const url = placeUrl(p) || mapsUrl(p);
    const dist = near ? `${near.mi.toFixed(1)} mi • ${driveMins(near.mi)} mins` : '';
    return `
                            <a class="free-pill" href="${esc(url)}" target="_blank" rel="noopener" data-place-type="${esc(p.type)}" data-lat="${p.lat}" data-lng="${p.lng}">
                                <span class="fp-name">${meta.icon} ${esc(p.name)}</span>
                                <span class="fp-dist place-dist">${dist}</span>
                                <span class="fp-arrow" aria-hidden="true">↗</span>
                            </a>`;
}

function placeCatCardHTML(cat) {
    if (cat.comingSoon) {
        return `
                        <div class="bestfor-card is-soon">
                            <span class="bf-emoji" aria-hidden="true">${cat.emoji}</span>
                            <h3 class="bf-title">${esc(cat.title)}</h3>
                            <p class="bf-desc">${esc(cat.blurb)}</p>
                            <span class="bf-soon">Coming soon</span>
                        </div>`;
    }
    return `
                        <a href="${esc(cat.slug)}/index.html" class="bestfor-card">
                            <span class="bf-emoji" aria-hidden="true">${cat.emoji}</span>
                            <h3 class="bf-title">${esc(cat.title)}</h3>
                            <p class="bf-desc">${esc(cat.blurb)}</p>
                            <span class="link-arrow">${esc(cat.cta)}</span>
                        </a>`;
}

function placesIndexPage() {
    const cards = PLACE_CATEGORIES.map(placeCatCardHTML).join('');
    const body = `
            <section class="walk-section walk-index-head">
                <div class="container">
                    <h1 class="index-title">Dog-friendly places in Essex</h1>
                    <p class="index-sub">Cafés, pubs and days out worth visiting with your dog.</p>
                </div>
            </section>

            <section class="walk-section section-alt">
                <div class="container">
                    <div class="places-hub-grid">${cards}
                    </div>
                </div>
            </section>`;
    return `${headHTML('../', 'Dog-friendly places in Essex | Dogs of Essex', 'Cafés, pubs, days out and beaches worth visiting with your dog across Essex.')}
</head>
<body>${navHTML('../')}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML('../')}

    <script src="../script.js"></script>
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
    const byNear = (a, b) => {
        const na = nearestWalk(a, walks), nb = nearestWalk(b, walks);
        return (na ? na.mi : 1e9) - (nb ? nb.mi : 1e9);
    };
    // One list of every venue, sorted by distance. Partner venues get the
    // bigger badged card; free venues the compact row. Re-sorts client-side
    // once the visitor enters a location.
    const inCat = placesInCategory(cat, places).slice().sort(byNear);
    const noteBlock = cat.note ? `\n                    <p class="local-tip">⚠️ ${esc(cat.note)}</p>` : '';

    const filterBar = cat.filters ? `
                    <div class="walk-filters places-filter" aria-label="Filter places to eat and drink by type">
                        ${cat.filters.map((f, i) => `<button type="button" class="filter-pill${i === 0 ? ' is-active' : ''}" data-type="${esc(f.type)}" aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(f.label)}</button>`).join('\n                        ')}
                    </div>` : '';

    const locatorBar = inCat.length ? `
                    <div class="place-locator">
                        <form class="locator-form" autocomplete="off">
                            <input type="text" class="locator-input" name="loc" placeholder="Enter a postcode or town…" aria-label="Your postcode or town">
                            <button type="submit" class="btn btn-primary">Search</button>
                            <button type="button" class="locator-geo btn btn-secondary">📍 Use my location</button>
                        </form>
                        <p class="locator-status" role="status" hidden></p>
                    </div>` : '';

    let content;
    if (!inCat.length) {
        content = `
            <section class="walk-section">
                <div class="container narrow">
                    <p class="section-lead">We're still adding dog-friendly ${esc(cat.plural)} — check back soon.</p>
                    <p class="tip-cta">Know a great one? <a href="mailto:hello@dogsofessex.co.uk?subject=${encodeURIComponent('Place suggestion: ' + cat.title)}">Tell us →</a></p>
                </div>
            </section>`;
    } else {
        const list = inCat.map((p) => effectiveTier(p) === 'partner'
            ? placePartnerCardHTML(p, walks)
            : placeFreePillHTML(p, walks)).join('');
        content = `
            <section class="walk-section section-alt places-section">
                <div class="container">
                    <p class="section-lead">Sorted by distance — enter your postcode above to see what's closest to you.</p>
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
    return `${headHTML(prefix, title, cat.intro)}
</head>
<body>${navHTML(prefix)}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML(prefix)}

    <script src="${prefix}script.js"></script>
</body>
</html>
`;
}

function venuePage(p, cat, walks) {
    const prefix = '../../../';
    const meta = TYPE_META[p.type] || { icon: '📍', label: p.type };
    const near = walks
        .filter((w) => w.hasPage && w.lat != null && w.lng != null)
        .map((w) => ({ ...w, _mi: miles({ lat: p.lat, lng: p.lng }, { lat: w.lat, lng: w.lng }) }))
        .filter((w) => w._mi <= NEARBY_WALK_RADIUS_MI)
        .sort((a, b) => a._mi - b._mi)
        .slice(0, 4);

    const verify = p.verified
        ? `<p class="meta-line">✓ Last checked${p.checkedBy ? ' by ' + esc(p.checkedBy) : ''}${p.lastChecked ? ' • ' + formatMonthYear(p.lastChecked) : ''}</p>`
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
                    <h2>🐾 Nearby walks</h2>
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

    const title = `${p.name} — dog-friendly ${(meta.label || '').toLowerCase()} in Essex | Dogs of Essex`;
    const description = p.notes || p.dogFriendlyNotes || `${p.name}, a dog-friendly ${(meta.label || '').toLowerCase()} in Essex.`;
    return `${headHTML(prefix, title, description)}
</head>
<body>${navHTML(prefix)}

    <main>
        <div class="walk-body">${body}
        </div>
    </main>
${footerHTML(prefix)}

    <script src="${prefix}script.js"></script>
</body>
</html>
`;
}

// --- run ---

function readJSON(file) {
    return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
}

function build() {
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
    fs.writeFileSync(path.join(PL_OUT, 'index.html'), placesIndexPage());
    console.log('  ✓ places/index.html');
    let venueCount = 0;
    PLACE_CATEGORIES.forEach((cat) => {
        if (cat.comingSoon) return;
        const dir = path.join(PL_OUT, cat.slug);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), placesCategoryPage(cat, places, walks));
        console.log(`  ✓ places/${cat.slug}/index.html`);
        placesInCategory(cat, places)
            .filter((p) => effectiveTier(p) === 'partner')
            .forEach((p) => {
                const vdir = path.join(dir, p.id);
                if (!fs.existsSync(vdir)) fs.mkdirSync(vdir, { recursive: true });
                fs.writeFileSync(path.join(vdir, 'index.html'), venuePage(p, cat, walks));
                console.log(`  ✓ places/${cat.slug}/${p.id}/index.html`);
                venueCount++;
            });
    });

    console.log(`\nBuilt ${pages.length} walk page(s) + walks index + ${BEST_FOR.length} Best For pages + Places hub/${PLACE_CATEGORIES.length} categories/${venueCount} venues from ${walks.length} walks, ${places.length} places, ${tips.length} tips.`);
}

build();
