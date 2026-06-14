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
const DAY_RADIUS_MI = 10;
const DAY_MAX = 4;
const NEARBY_WALK_RADIUS_MI = 25;
const NEARBY_WALK_MAX = 6;
const AVG_MPH = 26;
const ROAD_FACTOR = 1.25;

const TYPE_META = {
    cafe: { icon: '☕', label: 'Café' },
    pub: { icon: '🍺', label: 'Pub' },
    'garden-centre': { icon: '🪴', label: 'Garden Centre' },
    beach: { icon: '🌊', label: 'Beach' },
    seaside: { icon: '🌊', label: 'Seaside' },
    attraction: { icon: '🎡', label: 'Attraction' },
    shop: { icon: '🛍️', label: 'Shop' }
};
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
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// Partner tiers — paid placement. Lower rank = higher up the list.
const TIER_RANK = { premium: 0, featured: 1, none: 2 };
const EXAMPLE_PLACEHOLDER = 'https://example.com';

// Which contact details each tier is allowed to show. Tune freely.
const TIER_CONTACT = {
    premium: { phone: true, email: true, socials: true },
    featured: { phone: false, email: false, socials: true },
    none: { phone: false, email: false, socials: false }
};
const SOCIAL_LABELS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };

// A featured/premium listing falls back to "none" once featuredUntil has passed.
function effectiveTier(p) {
    let tier = p.partnerTier || 'none';
    if (tier !== 'none' && p.featuredUntil) {
        const until = Date.parse(p.featuredUntil);
        if (!isNaN(until) && until < Date.now()) tier = 'none';
    }
    return tier;
}
function placeUrl(p) {
    return (p.website && p.website !== '#' && p.website !== EXAMPLE_PLACEHOLDER) ? p.website : '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return esc(iso || '');
    return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

// Dog-friendly note (e.g. "Dogs welcome indoors and outside.")
function dogNoteHTML(p) {
    return p.dogFriendlyNotes
        ? `\n                                <span class="dog-note">🐕 ${esc(p.dogFriendlyNotes)}</span>` : '';
}

// Verification / freshness line (who checked it and when)
function verifyHTML(p) {
    if (!p.verified) return '';
    const by = p.checkedBy ? ` by ${esc(p.checkedBy)}` : '';
    const when = p.lastChecked ? ` · Checked ${formatDate(p.lastChecked)}` : '';
    return `\n                                <span class="place-verify">✓ Verified${by}${when}</span>`;
}

// Contact block — only the details this place's tier is allowed to show.
function contactHTML(p) {
    const tier = p._tier || effectiveTier(p);
    const show = TIER_CONTACT[tier] || TIER_CONTACT.none;
    const bits = [];
    if (show.phone && p.phone) {
        bits.push(`<a class="contact-link" href="tel:${esc(p.phone.replace(/\s+/g, ''))}">📞 ${esc(p.phone)}</a>`);
    }
    if (show.email && p.email) {
        bits.push(`<a class="contact-link" href="mailto:${esc(p.email)}">✉️ ${esc(p.email)}</a>`);
    }
    if (show.socials && p.socials) {
        for (const key of Object.keys(SOCIAL_LABELS)) {
            const url = p.socials[key];
            if (url) {
                bits.push(`<a class="contact-link social" href="${esc(url)}" target="_blank" rel="noopener">${SOCIAL_LABELS[key]}</a>`);
            }
        }
    }
    return bits.length ? `\n                                <div class="place-contact">${bits.join('')}</div>` : '';
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
                <p class="breadcrumb"><a href="../index.html">Home</a> · <a href="../index.html#walks">Walks</a> · ${esc(walk.name)}</p>
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

function placeCardHTML(p) {
    const tier = p._tier || effectiveTier(p);
    const meta = TYPE_META[p.type] || { icon: '📍', label: p.type };
    const href = placeUrl(p);
    const ext = href ? ' target="_blank" rel="noopener"' : '';
    const dist = distLabel(p._mi);

    if (tier === 'premium') {
        const photo = p.image
            ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove();this.parentNode.classList.add('noimg')">`
            : '';
        return `
                        <a class="day-card premium" href="${esc(href || '#')}"${ext}>
                            <div class="day-photo photo-ph">${photo}<span class="partner-badge">★ Featured Partner</span></div>
                            <div class="day-body">
                                <span class="day-type">${meta.icon} ${esc(meta.label)}</span>
                                <span class="day-name">${esc(p.name)}</span>
                                <span class="day-dist">${dist}</span>
                                ${p.notes ? `<span class="day-note">${esc(p.notes)}</span>` : ''}${dogNoteHTML(p)}
                                ${href ? `<span class="day-cta">Visit website →</span>` : ''}${contactHTML(p)}${verifyHTML(p)}
                            </div>
                        </a>`;
    }

    if (tier === 'featured') {
        return `
                        <a class="day-card featured" href="${esc(href || '#')}"${ext}>
                            <span class="day-icon">${meta.icon}</span>
                            <span class="day-body">
                                <span class="day-type">${esc(meta.label)} <span class="partner-badge inline">Partner</span></span>
                                <span class="day-name">${esc(p.name)}</span>
                                <span class="day-dist">${dist}</span>
                                ${p.notes ? `<span class="day-note">${esc(p.notes)}</span>` : ''}${dogNoteHTML(p)}${contactHTML(p)}${verifyHTML(p)}
                            </span>
                        </a>`;
    }

    // free / basic listing — minimal: type, name, distance only
    return `
                        <div class="day-card basic">
                            <span class="day-icon">${meta.icon}</span>
                            <span class="day-body">
                                <span class="day-type">${esc(meta.label)}</span>
                                <span class="day-name">${esc(p.name)}</span>
                                <span class="day-dist">${dist}</span>
                            </span>
                        </div>`;
}

function dayHTML(walk, places) {
    const origin = { lat: walk.lat, lng: walk.lng };
    const nearby = places
        .filter((p) => p.dogFriendly !== false)
        .filter((p) => p.showOnWalkPages !== false)
        .map((p) => ({ ...p, _mi: miles(origin, { lat: p.lat, lng: p.lng }), _tier: effectiveTier(p) }))
        .filter((p) => p._mi <= DAY_RADIUS_MI)
        .sort((a, b) => (TIER_RANK[a._tier] - TIER_RANK[b._tier]) || (a._mi - b._mi))
        .slice(0, DAY_MAX);
    if (!nearby.length) return '';
    const cards = nearby.map(placeCardHTML).join('');
    const who = esc((walk.town || walk.name).split(' ')[0]);
    return `
                    <h2>🐾 Make a Day of It</h2>
                    <p class="section-lead">Already heading to ${who}? Here's what other local dog owners pair with this walk.</p>
                    <div class="day-grid">${cards}</div>`;
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

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${og}
    <!-- This page is generated by build.js from data/walks.json — do not edit by hand. -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css">
    <script>window.WALK_ID = "${walk.id}";</script>
</head>
<body>
    <header class="site-header">
        <div class="container">
            <nav class="nav">
                <a href="../index.html" class="logo">Dogs of Essex</a>
                <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">☰</button>
                <ul class="nav-links">
                    <li><a href="../index.html#walks">Walks</a></li>
                    <li><a href="../index.html#categories">Explore</a></li>
                    <li><a href="../index.html#bestfor">Best For</a></li>
                    <li><a href="../index.html#meetups">Meetups</a></li>
                    <li><a href="../index.html#newsletter" class="nav-cta">Join the Pack</a></li>
                </ul>
            </nav>
        </div>
    </header>

    <main>
        <section class="walk-hero">
            <div class="container walk-hero-inner" id="walk-hero">${heroHTML(walk)}
            </div>
        </section>

        <div class="walk-body">
            <div class="container narrow">
                <p class="lead-intro" id="walk-intro">${esc(walk.intro || '')}</p>

                <section class="walk-section">
                    <h2>At a glance</h2>
                    <p class="section-lead">Honest ratings, so you can decide in seconds whether it suits your dog.</p>
                    <div id="glance" class="glance">${glanceHTML(walk.glance)}
                    </div>
                </section>
            </div>

            <section class="walk-section">
                <div class="container">
                    <h2>📸 Photo gallery</h2>
                    <p class="section-lead">See what it actually looks like before you go.</p>
                    <div id="gallery" class="gallery-grid">${galleryHTML(walk.gallery)}
                    </div>
                </div>
            </section>

            <div class="container narrow">
                <section class="walk-section">
                    <h2>🗺️ The route</h2>
                    <div id="route">${routeHTML(walk)}
                    </div>
                </section>

                <section class="walk-section">
                    <h2>What to expect</h2>
                    <div id="what-to-expect">${whatToExpectHTML(walk.whatToExpect)}
                    </div>
                </section>
            </div>

            <section class="walk-section section-alt">
                <div class="container">
                    <div id="make-a-day">${dayHTML(walk, places)}
                    </div>
                </div>
            </section>

            <section class="walk-section">
                <div class="container">
                    <div id="explore-nearby">${exploreHTML(walk, walks)}
                    </div>
                </div>
            </section>

            <div class="container narrow">
                <section class="walk-section">
                    <h2>💬 Community tips</h2>
                    <p class="section-lead">From local dog owners who've walked it.</p>
                    <div id="community-tips" class="tips-grid">${tipsHTML(walk.id, tips)}
                    </div>
                    <p class="tip-cta">Visited recently? <a href="mailto:hello@dogsofessex.co.uk?subject=${tipSubject}">Leave a tip →</a></p>
                </section>

                <div class="walk-actions">
                    <a href="#" id="save-walk" class="btn btn-secondary">♡ Save this walk</a>
                    <a href="#" id="email-walk" class="btn btn-secondary">📧 Email this walk</a>
                    <a href="#" id="share-walk" class="btn btn-secondary">🔗 Share</a>
                </div>
            </div>
        </div>
    </main>

    <footer class="site-footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <a href="../index.html" class="logo">Dogs of Essex</a>
                    <p>The local guide for dog owners in Essex — walks, places and adventures worth sharing.</p>
                </div>
                <div class="footer-col">
                    <h4>Explore</h4>
                    <ul>
                        <li><a href="../index.html#walks">Walks</a></li>
                        <li><a href="../index.html#places">Places</a></li>
                        <li><a href="../index.html#meetups">Meetups</a></li>
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
    </footer>

    <script src="../script.js"></script>
    <script src="../walk.js"></script>
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
    console.log(`\nBuilt ${pages.length} walk page(s) from ${walks.length} walks, ${places.length} places, ${tips.length} tips.`);
}

build();
