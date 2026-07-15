// Dogs of Essex — small enhancements

// Blended place ranking, mirrored from build.js so the server order and any
// client re-rank agree. score = distance (10 pts/mile within a 10-mile cap,
// dominant) + editor recommendation + small sponsor boost (both baked into
// data-editor / data-boost). The "Dogs of Essex Pick" badge deliberately has
// no weight here — it is recognition, not a lever.
function placeScore(el, mi) {
    const CAP = 10;
    const d = (mi == null || isNaN(mi)) ? CAP : mi;
    const distScore = Math.max(0, 100 - (Math.min(d, CAP) / CAP) * 100);
    return distScore
        + (parseFloat(el.dataset.editor) || 0)
        + (parseFloat(el.dataset.boost) || 0);
}

// Keep a marker's hover tooltip fully inside the map. Leaflet centres a
// 'top' tooltip over the pin, so one near the left/right edge overflows the
// map container (which clips) and its text gets cut off. On open, measure the
// tooltip against the map box and nudge it horizontally so it stays visible.
// Shared by every map (walks index, places hub, walk-page car parks).
function clampMapTooltip(map, tooltip) {
    if (!map || !tooltip || !tooltip.getElement) return;
    const el = tooltip.getElement();
    if (!el) return;
    el.style.marginLeft = '';               // clear any previous nudge before measuring
    el.style.marginTop = '';
    const box = map.getContainer().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pad = 6;
    let dx = 0, dy = 0;
    if (r.left < box.left + pad) dx = (box.left + pad) - r.left;
    else if (r.right > box.right - pad) dx = (box.right - pad) - r.right;
    // The tooltip sits above the pin, so the top edge is the usual offender;
    // cover the bottom too for completeness.
    if (r.top < box.top + pad) dy = (box.top + pad) - r.top;
    else if (r.bottom > box.bottom - pad) dy = (box.bottom - pad) - r.bottom;
    if (dx) el.style.marginLeft = Math.round(dx) + 'px';
    if (dy) el.style.marginTop = Math.round(dy) + 'px';
}

// Current year in footer
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if (toggle && links) {
    const setMenu = (open) => {
        links.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        // Lock page scroll behind the full-screen menu on mobile.
        document.body.style.overflow = open ? 'hidden' : '';
    };
    toggle.addEventListener('click', () => setMenu(!links.classList.contains('open')));
    // Close menu when a link is tapped
    links.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    // Reset if the viewport grows back to desktop
    window.addEventListener('resize', () => { if (window.innerWidth > 900) setMenu(false); });
}

// Newsletter form — placeholder handler until a provider is connected
const form = document.querySelector('.signup-form');
if (form) {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input[type="email"]');
        const value = (input.value || '').trim();
        if (!value || !value.includes('@')) {
            input.focus();
            return;
        }
        form.innerHTML = '<p style="color:#fff;font-size:1.05rem;">Thanks for joining the pack — we\'ll be in touch with the best Essex walks soon. 🐾</p>';
    });
}

// --- Shared explorer helpers (walks hub + places hub) ------------------------
// Both index pages use the same Airbnb-style layout — a card list beside a
// sticky map on desktop, and a pinned map above a horizontal swipe carousel on
// mobile. These hold the logic that would otherwise be copy-pasted per page.

// The mobile breakpoint for both explorers, read from one cached MediaQueryList
// so it stays in step with the `@media (max-width: 900px)` block in styles.css.
const explorerMobileMQ = window.matchMedia('(max-width: 900px)');
const isMobile = () => explorerMobileMQ.matches;

// Mobile carousel → map sync. Finds the visible card nearest the horizontal
// centre of `container` and reports it via onCentred, throttled to one call per
// frame while the carousel scrolls. Returns a `sync(pan)` for manual calls after
// a filter/sort re-order (which fires no scroll event). Each page owns its own
// "active" state, so onCentred receives the centred item and decides whether the
// change is worth acting on.
//   getItems:  () => items — re-evaluated per call so DOM re-ordering and
//              show/hide are always reflected
//   getCard:   (item) => the item's card element (measured for centring)
//   isVisible: (item) => boolean
//   onCentred: (item, pan) => void
function wireCarouselSync(container, getItems, getCard, isVisible, onCentred) {
    const centred = () => {
        const rect = container.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        let best = null, bestDist = Infinity;
        getItems().forEach((item) => {
            if (!isVisible(item)) return;
            const r = getCard(item).getBoundingClientRect();
            const d = Math.abs((r.left + r.width / 2) - mid);
            if (d < bestDist) { bestDist = d; best = item; }
        });
        return best;
    };
    const sync = (pan = true) => {
        if (!isMobile() || !container) return;
        const item = centred();
        if (item != null) onCentred(item, pan);
    };
    let raf = 0;
    if (container) container.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; sync(true); });
    }, { passive: true });
    return sync;
}

// Wire the mobile "Filter & sort" toggle that collapses the toolbar controls.
// onToggle(open) runs after the class flips — used to recompute sticky offsets
// and re-measure the map.
function wireFilterToggle(toggleEl, toolbarEl, onToggle) {
    if (!toggleEl || !toolbarEl) return;
    toggleEl.addEventListener('click', () => {
        const open = toolbarEl.classList.toggle('is-open');
        toggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (onToggle) onToggle(open);
    });
}

// Walks index — filter by "at a glance" categories (multi-select, 3+ stars) + sort
(function () {
    const bar = document.querySelector('.walk-filters');
    const grid = document.querySelector('.walks-index-grid');
    if (!bar || !grid) return;

    const noResults = document.querySelector('.no-results');
    const sortSelect = document.querySelector('.walk-sort');
    const cards = Array.from(grid.querySelectorAll('.walk-card'));
    const pills = Array.from(bar.querySelectorAll('.filter-pill'));
    const LABELS = {};
    pills.forEach((p) => { LABELS[p.dataset.key] = p.textContent.trim(); });
    const selected = new Set();
    let userPos = null;
    const CAR_SVG = '<svg class="lucide" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>';

    const score = (card, key) => {
        const v = card.dataset[key];
        return v == null ? null : parseInt(v, 10);
    };
    const num = (card, attr) => parseFloat(card.dataset[attr]) || 0;
    const starHTML = (n) => `<span class="wc-on">${'★'.repeat(n)}</span><span class="wc-off">${'☆'.repeat(5 - n)}</span>`;
    const sumScores = (card, keys) => keys.reduce((s, k) => s + score(card, k), 0);

    function haversine(a, b) {
        const R = 3958.8, toRad = (d) => d * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
        const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    }
    const distTo = (c) => userPos ? haversine(userPos, { lat: num(c, 'lat'), lng: num(c, 'lng') }) : 0;

    function sortCards(list, keys) {
        const sort = sortSelect ? sortSelect.value : 'featured';
        // Walks with no distance data (0) sort to the bottom of both, rather
        // than masquerading as the "shortest".
        if (sort === 'shortest') return list.sort((a, b) => (num(a, 'milesMin') || Infinity) - (num(b, 'milesMin') || Infinity));
        if (sort === 'longest') return list.sort((a, b) => num(b, 'milesMax') - num(a, 'milesMax'));
        if (sort === 'popular') return list.sort((a, b) => num(b, 'pop') - num(a, 'pop'));
        if (sort === 'newest') {
            const t = (c) => c.dataset.added ? Date.parse(c.dataset.added) : 0;
            return list.sort((a, b) => t(b) - t(a));
        }
        if (sort === 'nearest' && userPos) return list.sort((a, b) => distTo(a) - distTo(b));
        if (keys.length) return list.sort((a, b) => sumScores(b, keys) - sumScores(a, keys));
        return list.sort((a, b) => num(a, 'order') - num(b, 'order'));
    }

    // --- Map of all walks (Airbnb-style): sticky map + scrolling cards, with
    // two-way hover/click sync and a list that filters to the map's view. ---
    const mapEl = document.getElementById('walks-map');
    const countEl = document.getElementById('walks-count');
    let walksMap = null;
    const walkMarkers = [];
    const catEligible = new Set();   // cards passing the category filters
    let boundsSync = false;          // only filter the list to the map after the user moves the map
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const highlightMarker = (i, on) => { const m = walkMarkers[i]; if (m && m._icon) m._icon.classList.toggle('walk-map-pin--active', on); if (m && on) m.setZIndexOffset(1000); else if (m) m.setZIndexOffset(0); };
    const highlightCard = (i, on) => { const c = cards[i]; if (c) c.classList.toggle('is-map-active', on); };

    // --- Mobile (<=900px): sticky map on top, horizontal swipe carousel below.
    // Pan only enough to bring the active walk's marker into view, keeping the
    // current zoom. If the marker is already on-screen this is a no-op, so the
    // map stays put and only the highlight changes.
    const panToWalk = (i) => { const m = walkMarkers[i]; if (m && walksMap) walksMap.panInside(m.getLatLng(), { padding: [40, 40], animate: true }); };
    const centreCardInCarousel = (i) => { const c = cards[i]; if (c && c.style.display !== 'none') c.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); };
    // The card nearest the carousel's centre is the "active" one: highlight its
    // marker and pan the map to it. wireCarouselSync handles the geometry +
    // per-frame throttle; this page owns the active index.
    let activeCarouselCard = -1;
    const carItems = cards.map((card, i) => ({ card, i }));
    const syncActiveFromCarousel = wireCarouselSync(
        grid,
        () => carItems,
        (it) => it.card,
        (it) => it.card.style.display !== 'none' && !!walkMarkers[it.i],
        (it, pan) => {
            if (it.i === activeCarouselCard) return;
            if (activeCarouselCard >= 0) { highlightMarker(activeCarouselCard, false); highlightCard(activeCarouselCard, false); }
            activeCarouselCard = it.i;
            highlightMarker(it.i, true);
            highlightCard(it.i, true);
            if (pan) panToWalk(it.i);
        }
    );
    // Keep the sticky offsets in sync with the header + toolbar heights (which
    // vary as the filters wrap), and expose them as CSS variables the layout
    // uses for the sticky toolbar and map column.
    const headerEl = document.querySelector('.site-header');
    const toolbarEl = document.querySelector('.walks-toolbar');
    const stickyOffset = () => (headerEl ? headerEl.offsetHeight : 64) + (toolbarEl ? toolbarEl.offsetHeight : 0);
    const updateStickyVars = () => {
        document.documentElement.style.setProperty('--toolbar-top', (headerEl ? headerEl.offsetHeight : 64) + 'px');
        document.documentElement.style.setProperty('--content-top', stickyOffset() + 'px');
    };
    updateStickyVars();
    window.addEventListener('resize', updateStickyVars);

    // Scroll a card so its centre lines up with the vertical centre of the
    // sticky map. Because the map is sticky, target the position it occupies
    // once stuck (CSS top) rather than its current on-screen spot. force=true
    // always recentres (click); otherwise only scrolls when the card is
    // outside the map's vertical band (hover).
    const scrollToCard = (i, force) => {
        const c = cards[i];
        if (!c || c.style.display === 'none') return;
        if (!mapEl || window.innerWidth <= 900) {
            if (force) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        const map = mapEl.getBoundingClientRect();
        const card = c.getBoundingClientRect();
        if (!force) {
            const offBand = card.bottom < map.top + 20 || card.top > map.bottom - 20;
            if (!offBand) return;
        }
        // The map sits below its heading inside the sticky column, so its stuck
        // top is the column's CSS top (header + toolbar) plus the map's offset
        // within the column.
        const stickTop = stickyOffset();
        const stuckMapTop = stickTop + (mapEl.offsetTop || 0);
        const cardDocCentre = card.top + window.scrollY + card.height / 2;
        let targetY = cardDocCentre - (stuckMapTop + map.height / 2);
        // Keep the scroll within the range where the map stays stuck, so the
        // map remains centred for both top and bottom cards (rather than being
        // pushed down by the filters or scrolling up off the bottom). Measure
        // the explorer (not the sticky column, which reports its stuck spot).
        const ref = mapEl.closest('.walks-explorer');
        const colEl = mapEl.closest('.walks-map-col');
        if (ref && colEl) {
            const refRect = ref.getBoundingClientRect();
            const refTop = refRect.top + window.scrollY;
            const colH = colEl.getBoundingClientRect().height;
            const minStick = refTop - stickTop;
            const maxStick = refTop + refRect.height - colH - stickTop;
            targetY = (maxStick > minStick)
                ? Math.min(maxStick, Math.max(minStick, targetY))
                : Math.max(minStick, targetY);
        }
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    };

    if (mapEl && typeof L !== 'undefined') {
        walksMap = L.map(mapEl, { zoomSnap: 0, scrollWheelZoom: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(walksMap);
        cards.forEach((card, i) => {
            const lat = parseFloat(card.dataset.lat), lng = parseFloat(card.dataset.lng);
            if (!isFinite(lat) || !isFinite(lng)) { walkMarkers.push(null); return; }
            const name = (card.querySelector('h3') ? card.querySelector('h3').textContent : '').trim();
            const href = card.getAttribute('href'); // null for "coming soon" cards
            const m = L.marker([lat, lng], {
                icon: L.divIcon({ className: 'walk-map-pin', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
                title: name,
                keyboard: false // don't focus on click (avoids the browser scrolling it into view)
            });
            m.bindTooltip(name, { direction: 'top', offset: [0, -10], opacity: 1 });
            // On phones the card sits right below the map, so the name tag is
            // redundant (and lingers after a tap) — suppress it there. Closing
            // it inside tooltipopen happens before paint, so no flash. Desktop
            // hover tooltips are unaffected.
            m.on('tooltipopen', (e) => { if (isMobile()) { m.closeTooltip(); return; } clampMapTooltip(walksMap, e.tooltip); });
            m.on('mouseover', () => highlightCard(i, true));
            m.on('mouseout', () => highlightCard(i, false));
            // Tapping a marker jumps to its card: swipe the carousel on mobile,
            // recentre the vertical list on desktop. (Not on hover.)
            m.on('click', () => { if (isMobile()) centreCardInCarousel(i); else scrollToCard(i, true); });
            walkMarkers.push(m);
        });
        cards.forEach((card, i) => {
            if (!walkMarkers[i]) return;
            // Desktop: hovering a card grows/colours its marker.
            card.addEventListener('mouseenter', () => highlightMarker(i, true));
            card.addEventListener('mouseleave', () => highlightMarker(i, false));
            // Mobile: tapping the card pans the map to its marker; only the
            // "Explore Walk" arrow follows through to the walk page.
            card.addEventListener('click', (e) => {
                if (!isMobile()) return;
                if (e.target.closest('.link-arrow')) return;
                e.preventDefault();
                centreCardInCarousel(i);
                panToWalk(i);
            });
        });
        // (Carousel swipe → highlight/pan sync is wired by wireCarouselSync.)
        window.addEventListener('resize', () => { if (walksMap) walksMap.invalidateSize(); });
        const fit = () => {
            const pts = walkMarkers.filter(Boolean).map((m) => m.getLatLng());
            if (pts.length) walksMap.fitBounds(pts, { padding: [22, 22] });
        };
        fit();
        // Attach the bounds-filter only after the initial programmatic fitting
        // has settled, so it doesn't prematurely hide walks on load.
        setTimeout(() => {
            walksMap.invalidateSize();
            fit();
            // First load: keep the fitted view of all (filtered) walks — just
            // highlight the leading card, don't pan.
            syncActiveFromCarousel(false);
            // iOS Safari can report the sticky map's size late, leaving the
            // first fit wrong; re-measure and re-fit before wiring bounds-sync.
            setTimeout(() => {
                walksMap.invalidateSize();
                fit();
                walksMap.on('moveend', () => { boundsSync = true; applyBounds(); });
            }, 350);
        }, 90);
    }

    function updateCount(count) {
        if (!countEl) return;
        const keys = [...selected];
        const noun = count === 1 ? 'walk' : 'walks';
        const area = (boundsSync && count < catEligible.size) ? ' in this area' : '';
        if (keys.length) {
            countEl.textContent = keys.map((k) => LABELS[k]).join(' + ') + ' • ' + count + ' ' + noun + area;
        } else {
            countEl.textContent = 'Showing ' + count + ' ' + noun + area;
        }
    }

    // Show/hide list cards by whether their marker is within the map's view
    // (among the category-eligible ones); keeps map markers and list in sync.
    function applyBounds() {
        const b = (boundsSync && walksMap) ? walksMap.getBounds() : null;
        const showDist = sortSelect && sortSelect.value === 'nearest' && userPos;
        let count = 0;
        cards.forEach((c, i) => {
            if (!catEligible.has(c)) { c.style.display = 'none'; return; }
            const m = walkMarkers[i];
            const inView = !b || !m || b.contains(m.getLatLng());
            c.style.display = inView ? '' : 'none';
            if (inView) count++;
            const distEl = c.querySelector('.walk-card-distance');
            if (distEl) {
                if (showDist && inView) { distEl.innerHTML = CAR_SVG + '<span>' + distTo(c).toFixed(1) + ' miles away</span>'; distEl.hidden = false; }
                else { distEl.hidden = true; distEl.innerHTML = ''; }
            }
        });
        if (noResults) noResults.hidden = count > 0;
        updateCount(count);
    }

    // Apply the category filters + sort: sets which walks are eligible, orders
    // the list, shows/hides markers, then re-applies the map-bounds filter.
    function applyFilters() {
        const keys = [...selected];
        catEligible.clear();
        const eligible = [];
        cards.forEach((c, i) => {
            const ok = !keys.length || keys.every((k) => { const s = score(c, k); return s != null && s >= 3; });
            const starsEl = c.querySelector('.walk-card-stars');
            if (ok) {
                catEligible.add(c);
                eligible.push(c);
                if (keys.length && starsEl) {
                    starsEl.hidden = false;
                    starsEl.innerHTML = keys.map((k) =>
                        `<span class="wc-row"><span class="wc-label">${LABELS[k]}</span><span class="wc-stars">${starHTML(score(c, k))}</span></span>`
                    ).join('');
                } else if (starsEl) { starsEl.hidden = true; starsEl.innerHTML = ''; }
            } else if (starsEl) { starsEl.hidden = true; starsEl.innerHTML = ''; }
            const m = walkMarkers[i];
            if (m && walksMap) {
                if (ok && !walksMap.hasLayer(m)) m.addTo(walksMap);
                else if (!ok && walksMap.hasLayer(m)) walksMap.removeLayer(m);
            }
        });
        sortCards(eligible, keys).forEach((c) => grid.appendChild(c));
        applyBounds();
    }

    pills.forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const on = !selected.has(key);
            if (on) selected.add(key); else selected.delete(key);
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            applyFilters();
        });
    });

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            if (sortSelect.value === 'nearest' && !userPos && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => { userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }; applyFilters(); },
                    () => { /* denied — keeps current order */ }
                );
            }
            applyFilters();
        });
    }

    // Mobile: collapse/expand the filters + sort behind the toggle arrow.
    wireFilterToggle(document.querySelector('.walks-filter-toggle'), toolbarEl, () => {
        updateStickyVars();
        if (walksMap) requestAnimationFrame(() => walksMap.invalidateSize());
    });

    applyFilters();
})();

// Places category — filter venues by type (All / Cafés / Pubs / Restaurants)
(function () {
    const bar = document.querySelector('.places-filter');
    if (!bar) return;
    const btns = Array.from(bar.querySelectorAll('.filter-pill'));
    const items = Array.from(document.querySelectorAll('[data-place-type]'));
    const sections = Array.from(document.querySelectorAll('.places-section'));
    const visible = (el) => el.style.display !== 'none';

    function apply(type) {
        items.forEach((el) => {
            el.style.display = (type === 'all' || el.dataset.placeType === type) ? '' : 'none';
        });
        sections.forEach((sec) => {
            const any = Array.from(sec.querySelectorAll('[data-place-type]')).some(visible);
            sec.style.display = any ? '' : 'none';
        });
    }

    bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-pill');
        if (!btn) return;
        btns.forEach((b) => {
            const on = b === btn;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        apply(btn.dataset.type);
    });
})();

// Places category — order venues by distance from a postcode/town or the user's location
(function () {
    const root = document.querySelector('.place-locator');
    if (!root) return;
    const form = root.querySelector('.locator-form');
    const input = root.querySelector('.locator-input');
    const geoBtn = root.querySelector('.locator-geo');
    const status = root.querySelector('.locator-status');
    const items = Array.from(document.querySelectorAll('[data-place-type][data-lat]'));
    if (!items.length) return;

    function haversine(a, b) {
        const R = 3958.8, toRad = (d) => d * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
        const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    }
    function say(msg) { status.hidden = !msg; status.textContent = msg || ''; }

    // Geocode UK postcode → outcode → free-text town, using public services.
    async function geocode(q) {
        try {
            const r = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(q));
            if (r.ok) { const j = await r.json(); if (j.result) return { lat: j.result.latitude, lng: j.result.longitude, label: j.result.postcode }; }
        } catch (e) { /* try next */ }
        try {
            const r = await fetch('https://api.postcodes.io/outcodes/' + encodeURIComponent(q));
            if (r.ok) { const j = await r.json(); if (j.result) return { lat: j.result.latitude, lng: j.result.longitude, label: j.result.outcode }; }
        } catch (e) { /* try next */ }
        try {
            const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
            if (r.ok) { const j = await r.json(); if (j[0]) return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), label: q }; }
        } catch (e) { /* give up */ }
        return null;
    }

    function order(point, label) {
        items.forEach((el) => {
            const mi = haversine(point, { lat: parseFloat(el.dataset.lat), lng: parseFloat(el.dataset.lng) });
            el.dataset.dist = mi;
            el.dataset.score = placeScore(el, mi);
            const d = el.querySelector('.place-dist');
            if (d) d.textContent = mi.toFixed(1) + ' mi away';
        });
        const parents = new Set(items.map((el) => el.parentNode));
        parents.forEach((parent) => {
            Array.from(parent.children)
                .filter((c) => c.dataset && c.dataset.dist != null)
                // Recommended order: distance dominates, editor score and the
                // small sponsor boost fine-tune. Ties break by distance.
                .sort((a, b) => parseFloat(b.dataset.score) - parseFloat(a.dataset.score)
                    || parseFloat(a.dataset.dist) - parseFloat(b.dataset.dist))
                .forEach((c) => parent.appendChild(c));
        });
        say('Showing places near ' + label + ', in recommended order.');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        say('Searching…');
        const loc = await geocode(q);
        if (!loc) { say("Sorry, we couldn't find that location — try a postcode."); return; }
        order({ lat: loc.lat, lng: loc.lng }, loc.label);
    });

    if (geoBtn) {
        geoBtn.addEventListener('click', () => {
            if (!navigator.geolocation) { say('Location services are not available in this browser.'); return; }
            say('Finding your location…');
            navigator.geolocation.getCurrentPosition(
                (pos) => order({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'your location'),
                () => say("We couldn't access your location — try entering a postcode.")
            );
        });
    }
})();

// Places hub — filtered card list + map (like the walks page). Category filter
// is deep-linkable via #<category-slug> (e.g. .../places/#eat-drink); "All"
// clears the hash. The map re-fits to whichever venues are showing.
(function () {
    const bar = document.querySelector('.places-cat-filter');
    if (!bar) return;
    const pills = Array.from(bar.querySelectorAll('.filter-pill'));
    const cards = Array.from(document.querySelectorAll('.places-hub-list > [data-cat]'));
    const empties = Array.from(document.querySelectorAll('.places-empty'));
    const countEls = Array.from(document.querySelectorAll('.places-count'));
    const valid = new Set(pills.map((p) => p.dataset.cat));

    // Eat & Drink sub-filters: venue type (single-select) + dog-access
    // (multi-select, AND). Only shown - and only applied - while the category
    // named in the bar's data-for is active.
    const subBar = document.querySelector('.places-subfilter');
    const subCat = subBar ? subBar.dataset.for : null;
    const subTypePills = subBar ? Array.from(subBar.querySelectorAll('[data-subtype]')) : [];
    const subAccessPills = subBar ? Array.from(subBar.querySelectorAll('[data-subaccess]')) : [];
    const bubblesEl = document.querySelector('.places-active-filters');
    let cat = 'all';
    let subType = 'all';
    const subAccess = new Set();
    let subOpen = false; // is the sub-filter panel expanded (vs collapsed to bubbles)

    // Human labels for the active-filter bubbles, read from the pills themselves.
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const subLabels = {};
    subTypePills.forEach((b) => { subLabels['type:' + b.dataset.subtype] = b.textContent.trim(); });
    subAccessPills.forEach((b) => { subLabels['access:' + b.dataset.subaccess] = b.textContent.trim(); });

    // Freeze the filter bar below the sticky header, and park the sticky map
    // below both.
    const header = document.querySelector('.site-header');
    const toolbar = document.querySelector('.places-toolbar');
    const setTop = () => {
        const hh = header ? header.offsetHeight : 72;
        document.documentElement.style.setProperty('--toolbar-top', hh + 'px');
        document.documentElement.style.setProperty('--places-content-top', (hh + (toolbar ? toolbar.offsetHeight : 80)) + 'px');
    };
    setTop();
    window.addEventListener('resize', setTop);

    // Sort the list in place (re-orders the DOM; hidden cards keep their filter).
    const listEl = document.querySelector('.places-hub-list');
    const sortSel = document.querySelector('.places-sort');
    const numAttr = (c, a) => parseFloat(c.dataset[a]) || 0;
    const sortCards = () => {
        const s = sortSel ? sortSel.value : 'recommended';
        const arr = cards.slice();
        if (s === 'distance') arr.sort((a, b) => numAttr(a, 'dist') - numAttr(b, 'dist'));
        else if (s === 'added') { const t = (c) => c.dataset.added ? Date.parse(c.dataset.added) : 0; arr.sort((a, b) => t(b) - t(a)); }
        else if (s === 'az') arr.sort((a, b) => (a.dataset.name || '').localeCompare(b.dataset.name || ''));
        // Recommended: the blended score (kept in sync as distance updates).
        else arr.sort((a, b) => numAttr(b, 'score') - numAttr(a, 'score') || numAttr(a, 'order') - numAttr(b, 'order'));
        if (listEl) arr.forEach((c) => listEl.appendChild(c));
    };
    if (sortSel) sortSel.addEventListener('change', () => {
        sortCards();
        // Mobile: re-ordering the slides changes which card sits at the
        // carousel centre without firing a scroll event — resync the highlight.
        if (isMobile()) requestAnimationFrame(() => syncActiveFromCarousel(false));
    });

    // Map is optional — only build it if Leaflet loaded and the element exists.
    const mapEl = document.getElementById('places-map');
    let map = null;
    const entries = []; // { card, marker }
    let active = null;

    // Shared "near a location/walk" state + control refs, declared up here so the
    // filter/count/map helpers below can all see them.
    let originPoint = null;   // {lat,lng} once a location/walk/area is chosen
    let originLabel = '';
    let distanceLimit = 10;   // miles (defaults to 10 once an origin is set), null = everywhere
    let searchRef = null;     // reference centre for the "moved far enough?" check
    const locForm = document.querySelector('.places-locator');
    const locInput = locForm && locForm.querySelector('.locator-input');
    const locStatus = document.querySelector('.locator-status');
    const geoBtn = document.querySelector('.places-finder .locator-geo');
    const walkSel = document.querySelector('.places-near-walk');
    const distSel = document.querySelector('.places-distance');
    const distWrap = document.querySelector('.places-distance-wrap');
    const searchAreaBtn = document.querySelector('.map-search-area');

    const highlightMarker = (marker, on) => {
        if (marker && marker._icon) marker._icon.classList.toggle('walk-map-pin--active', on);
        if (marker) marker.setZIndexOffset(on ? 1000 : 0);
    };
    // Temporary hover highlight linking a card and its map pin, both ways.
    const setHover = (entry, on) => {
        if (!entry || entry === active) return;
        highlightMarker(entry.marker, on);
        entry.card.classList.toggle('is-map-hover', on);
    };
    // Select a venue: colour its pin, highlight its card and pan the map to it
    // (instead of following its link). On mobile pan only enough to bring the
    // pin on-screen (like walks) so swiping doesn't recentre the map each card;
    // scrolling a card into view means swiping the carousel there.
    const select = (entry, scrollCard, pan = true) => {
        if (active) { highlightMarker(active.marker, false); active.card.classList.remove('is-map-active'); }
        active = entry;
        if (!entry) return;
        highlightMarker(entry.marker, true);
        entry.card.classList.add('is-map-active');
        if (pan && map && entry.marker) {
            if (isMobile()) map.panInside(entry.marker.getLatLng(), { padding: [40, 40], animate: true });
            else map.panTo(entry.marker.getLatLng(), { animate: true });
        }
        if (scrollCard) entry.card.scrollIntoView(isMobile()
            ? { behavior: 'smooth', inline: 'center', block: 'nearest' }
            : { behavior: 'smooth', block: 'center' });
    };

    // Mobile: the card nearest the carousel's centre is the "active" one —
    // highlight its pin as the user swipes. wireCarouselSync handles the
    // geometry + per-frame throttle; onCentred defers to select(), which owns
    // `active` (shared with desktop card clicks). pan=false keeps the current
    // view (used after a fitBounds, which a pan would cancel mid-animation).
    const syncActiveFromCarousel = wireCarouselSync(
        listEl,
        () => entries,
        (en) => en.card,
        (en) => !en.card.hidden,
        (en, pan) => { if (en !== active) select(en, false, pan); }
    );

    if (mapEl && typeof L !== 'undefined') {
        map = L.map(mapEl, { scrollWheelZoom: false, zoomSnap: 0 });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        cards.forEach((card) => {
            const lat = parseFloat(card.dataset.lat), lng = parseFloat(card.dataset.lng);
            if (!isFinite(lat) || !isFinite(lng)) return;
            const nameEl = card.querySelector('.pc-name, .fp-name');
            const name = nameEl ? nameEl.textContent.trim() : '';
            const m = L.marker([lat, lng], {
                icon: L.divIcon({ className: 'walk-map-pin', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] })
            });
            if (name) m.bindTooltip(name, { direction: 'top', offset: [0, -10], opacity: 1 });
            // On phones the active card sits right below the map, so the name
            // tag is redundant (and lingers after a tap) — suppress it there.
            m.on('tooltipopen', (e) => { if (isMobile()) { m.closeTooltip(); return; } clampMapTooltip(map, e.tooltip); });
            const entry = { card, marker: m };
            m.on('click', () => select(entry, true));
            m.on('mouseover', () => setHover(entry, true));
            m.on('mouseout', () => setHover(entry, false));
            entries.push(entry);
        });
    }

    // Clicking a card selects it (pan + highlight) rather than navigating —
    // unless the click was on a link/button inside it (e.g. "Visit website").
    cards.forEach((card) => {
        const entry = entries.find((e) => e.card === card);
        if (!entry) return;
        card.addEventListener('click', (e) => { if (!e.target.closest('a, button')) select(entry, isMobile()); });
        card.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a, button')) { e.preventDefault(); select(entry, isMobile()); }
        });
        card.addEventListener('mouseenter', () => setHover(entry, true));
        card.addEventListener('mouseleave', () => setHover(entry, false));
    });

    const haversine = (a, b) => {
        const R = 3958.8, tr = (d) => d * Math.PI / 180;
        const dLat = tr(b.lat - a.lat), dLng = tr(b.lng - a.lng);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(tr(a.lat)) * Math.cos(tr(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    };
    const fitVisible = () => {
        if (!map) return;
        const pts = [];
        entries.forEach(({ card, marker }) => {
            if (card.hidden) { map.removeLayer(marker); }
            else { marker.addTo(map); pts.push(marker.getLatLng()); }
        });
        if (originPoint) {
            // Centre on the origin plus the nearest handful of visible places.
            const near = pts.slice()
                .sort((p, q) => haversine(originPoint, { lat: p.lat, lng: p.lng }) - haversine(originPoint, { lat: q.lat, lng: q.lng }))
                .slice(0, 8).map((ll) => [ll.lat, ll.lng]);
            map.fitBounds([[originPoint.lat, originPoint.lng]].concat(near), { padding: [26, 26], maxZoom: 14 });
        } else if (pts.length) {
            map.fitBounds(pts, { padding: [12, 12], maxZoom: 15 });
        }
    };

    // Whether a card passes the category filter plus, within the sub-filtered
    // category, the venue-type and every selected dog-access option.
    const cardShown = (c) => {
        if (!(cat === 'all' || c.dataset.cat === cat)) return false;
        if (originPoint && distanceLimit != null && (parseFloat(c.dataset.dist) || Infinity) > distanceLimit) return false;
        if (subBar && cat === subCat) {
            if (subType !== 'all' && c.dataset.placeType !== subType) return false;
            if (subAccess.size) {
                const access = (c.dataset.access || '').split(/\s+/);
                for (const k of subAccess) if (!access.includes(k)) return false;
            }
        }
        return true;
    };

    // Count places currently within the map's view (vs the total matching the
    // filters), so the tally reflects what's actually visible on the map - with a
    // nudge to zoom out when more sit beyond the edges. Re-runs on every map move.
    const updateCount = () => {
        const total = cards.filter((c) => !c.hidden).length;
        if (listEl) listEl.classList.toggle('is-empty', total === 0);
        if (!total) {
            const subActive = subBar && cat === subCat && (subType !== 'all' || subAccess.size > 0);
            const near = originPoint ? ' near ' + originLabel : '';
            countEls.forEach((el) => { el.textContent = subActive || originPoint ? ('No places' + near + ' match those filters') : ''; });
            return;
        }
        let inView = total;
        if (map) {
            const b = map.getBounds();
            inView = 0;
            entries.forEach(({ card, marker }) => { if (!card.hidden && b.contains(marker.getLatLng())) inView++; });
        }
        const plc = (n) => n + ' place' + (n === 1 ? '' : 's');
        let text;
        if (originPoint && distanceLimit != null) {
            text = 'Showing ' + plc(total) + ' within ' + distanceLimit + ' miles of ' + originLabel;
        } else if (originPoint) {
            text = inView < total
                ? ('Showing ' + inView + ' of ' + plc(total) + ' near ' + originLabel + ' (zoom out to see more)')
                : ('Showing ' + plc(total) + ' near ' + originLabel);
        } else {
            text = inView < total
                ? ('Showing ' + inView + ' of ' + plc(total) + ' (zoom out to see more)')
                : ('Showing ' + plc(total));
        }
        countEls.forEach((el) => { el.textContent = text; });
    };
    if (map) { map.on('moveend', updateCount); map.on('zoomend', updateCount); }

    const applyFilters = () => {
        cards.forEach((c) => { c.hidden = !cardShown(c); });
        // Show a "coming soon" state only when the chosen category has none.
        empties.forEach((e) => { e.hidden = !(cat !== 'all' && e.dataset.cat === cat); });
        if (active && active.card.hidden) select(null);
        fitVisible();
        updateCount();
        // Mobile: highlight whichever card now leads the carousel — without
        // panning, so the fitBounds animation isn't cancelled mid-flight.
        if (isMobile()) requestAnimationFrame(() => syncActiveFromCarousel(false));
    };

    const pressPill = (b, on) => {
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    };

    const resetSubFilters = () => {
        subType = 'all';
        subAccess.clear();
        subTypePills.forEach((b) => pressPill(b, b.dataset.subtype === 'all'));
        subAccessPills.forEach((b) => pressPill(b, false));
    };

    const hasActiveSub = () => subType !== 'all' || subAccess.size > 0;

    // Bubbles that show what's on while the sub-filter panel is collapsed; each
    // removes its own filter when tapped.
    const renderBubbles = () => {
        if (!bubblesEl) return;
        const chips = [];
        if (subType !== 'all') chips.push({ kind: 'type', key: subType, label: subLabels['type:' + subType] || subType });
        subAccess.forEach((k) => chips.push({ kind: 'access', key: k, label: subLabels['access:' + k] || k }));
        bubblesEl.innerHTML = chips.map((c) =>
            `<button type="button" class="active-filter-chip" data-kind="${c.kind}" data-key="${esc(c.key)}" aria-label="Remove filter: ${esc(c.label)}">${esc(c.label)}<span class="x" aria-hidden="true">×</span></button>`
        ).join('');
    };

    // The panel shows only when Eat & Drink is the active category AND expanded;
    // the bubbles show when it's active, collapsed, and something is selected.
    // Sub-filters keep applying whenever Eat & Drink is the category, either way.
    const updateSubUI = () => {
        if (!subBar) return;
        const key = () => subBar.hidden + '|' + (bubblesEl ? bubblesEl.hidden : '');
        const before = key();
        subBar.hidden = !(cat === subCat && subOpen);
        if (bubblesEl) {
            const showBubbles = cat === subCat && !subOpen && hasActiveSub();
            if (showBubbles) renderBubbles(); else bubblesEl.innerHTML = '';
            bubblesEl.hidden = !showBubbles;
        }
        setTop(); // the toolbar grows/shrinks with the sub-filter row / bubbles
        // On mobile the pinned panel (and the map inside it) resizes with the
        // toolbar — let Leaflet re-measure, then refit.
        if (map && before !== key()) {
            requestAnimationFrame(() => { map.invalidateSize(); fitVisible(); });
        }
    };

    const applyCat = (next) => {
        cat = valid.has(next) ? next : 'all';
        pills.forEach((p) => pressPill(p, p.dataset.cat === cat));
        if (cat !== subCat) { resetSubFilters(); subOpen = false; }
        updateSubUI();
        applyFilters();
    };

    pills.forEach((p) => p.addEventListener('click', () => {
        const next = p.dataset.cat;
        if (next === subCat && cat === subCat) {
            // Eat & Drink already active: toggle the panel open/closed. Any
            // selections stay applied when it collapses (shown as bubbles).
            subOpen = !subOpen;
            updateSubUI();
        } else {
            if (next === subCat) subOpen = true; // opening Eat & Drink expands it
            applyCat(next);
        }
        history.replaceState(null, '', next === 'all' ? location.pathname : '#' + next);
    }));

    subTypePills.forEach((b) => b.addEventListener('click', () => {
        subType = b.dataset.subtype;
        subTypePills.forEach((x) => pressPill(x, x === b));
        applyFilters();
    }));
    subAccessPills.forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.subaccess;
        const on = !subAccess.has(k);
        if (on) subAccess.add(k); else subAccess.delete(k);
        pressPill(b, on);
        applyFilters();
    }));

    // Removing a bubble clears that one filter (and un-presses its pill).
    if (bubblesEl) bubblesEl.addEventListener('click', (e) => {
        const chip = e.target.closest('.active-filter-chip');
        if (!chip) return;
        if (chip.dataset.kind === 'type') {
            subType = 'all';
            subTypePills.forEach((x) => pressPill(x, x.dataset.subtype === 'all'));
        } else {
            subAccess.delete(chip.dataset.key);
            subAccessPills.forEach((x) => { if (x.dataset.subaccess === chip.dataset.key) pressPill(x, false); });
        }
        applyFilters();
        updateSubUI(); // re-render bubbles, or hide the row once it's empty
    });

    // Mobile: collapse/expand the filters + sort behind the toggle arrow
    // (same as the walks page).
    wireFilterToggle(document.querySelector('.places-filter-toggle'), toolbar, () => {
        setTop();
        if (map) requestAnimationFrame(() => { map.invalidateSize(); fitVisible(); });
    });

    const initial = (location.hash || '').replace('#', '');
    const startCat = valid.has(initial) ? initial : 'all';
    subOpen = startCat === subCat; // deep-link to Eat & Drink opens the panel
    applyCat(startCat);
    // Nudge the map once it has its real size — Leaflet mis-sizes (loads too few
    // tiles) if its container wasn't fully laid out at init, notably the mobile
    // sticky map. Re-measure the sticky offsets at the same time.
    const refresh = () => { setTop(); if (map) { map.invalidateSize(); fitVisible(); if (!searchRef) searchRef = map.getCenter(); } };
    setTimeout(refresh, 300);
    setTimeout(refresh, 900);
    window.addEventListener('load', refresh);

    // --- Location / "near a walk" ------------------------------------------
    // Set an origin (a typed location, the user's position, or a chosen walk),
    // then recompute each place's distance from it, re-sort by distance, and
    // centre the map. Also honours a ?near=lat,lng[&walk=Name] deep link from a
    // walk page's "Browse all nearby places →".
    const say = (msg) => { if (locStatus) { locStatus.hidden = !msg; locStatus.textContent = msg || ''; } };
    async function geocode(q) {
        try { const r = await fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(q)); if (r.ok) { const j = await r.json(); if (j.result) return { lat: j.result.latitude, lng: j.result.longitude, label: j.result.postcode }; } } catch (e) { /* next */ }
        try { const r = await fetch('https://api.postcodes.io/outcodes/' + encodeURIComponent(q)); if (r.ok) { const j = await r.json(); if (j.result) return { lat: j.result.latitude, lng: j.result.longitude, label: j.result.outcode }; } } catch (e) { /* next */ }
        try { const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } }); if (r.ok) { const j = await r.json(); if (j[0]) return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), label: q }; } } catch (e) { /* give up */ }
        return null;
    }
    let originMarker = null;
    // Setting an origin is exclusive: it replaces whichever origin was active
    // (walk / postcode / location / map). Refinements - category, dog-access,
    // sort and radius - are deliberately left untouched. `keepSort` preserves the
    // user's sort choice (used by "Search this area"); otherwise we switch to
    // Distance, which is what people expect the first time they set a location.
    const setOrigin = (point, label, opts) => {
        opts = opts || {};
        originPoint = point;
        originLabel = label;
        searchRef = point;
        cards.forEach((c) => {
            const lat = parseFloat(c.dataset.lat), lng = parseFloat(c.dataset.lng);
            if (!isFinite(lat) || !isFinite(lng)) return;
            const mi = haversine(point, { lat, lng });
            c.dataset.dist = mi;
            c.dataset.score = placeScore(c, mi);
            const d = c.querySelector('.place-dist');
            if (d) d.textContent = mi.toFixed(1) + ' mi away';
        });
        if (distWrap) distWrap.hidden = false;
        if (searchAreaBtn) searchAreaBtn.hidden = true;
        if (sortSel && !opts.keepSort) sortSel.value = 'distance';
        if (map && typeof L !== 'undefined') {
            if (originMarker) originMarker.setLatLng([point.lat, point.lng]);
            else originMarker = L.marker([point.lat, point.lng], { icon: L.divIcon({ className: 'origin-pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 3000, interactive: false }).addTo(map);
        }
        sortCards();
        applyFilters(); // applies the distance filter, refits the map, updates the map count
        say(''); // clear any transient "Searching…" message; the count sits above the map now
    };
    if (locForm) {
        locForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const q = (locInput && locInput.value.trim()) || '';
            if (!q) return;
            say('Searching…');
            const loc = await geocode(q);
            if (!loc) { say("Sorry, we couldn't find that location - try a postcode."); return; }
            if (walkSel) walkSel.value = '';
            setOrigin({ lat: loc.lat, lng: loc.lng }, loc.label);
        });
    }
    if (geoBtn) {
        geoBtn.addEventListener('click', () => {
            if (!navigator.geolocation) { say('Location services are not available in this browser.'); return; }
            say('Finding your location…');
            navigator.geolocation.getCurrentPosition(
                (pos) => { if (walkSel) walkSel.value = ''; if (locInput) locInput.value = ''; setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'your location'); },
                () => say("We couldn't access your location - try entering a postcode.")
            );
        });
    }
    if (walkSel) {
        walkSel.addEventListener('change', () => {
            if (!walkSel.value) return;
            const parts = walkSel.value.split(',').map(parseFloat);
            if (!isFinite(parts[0]) || !isFinite(parts[1])) return;
            if (locInput) locInput.value = '';
            setOrigin({ lat: parts[0], lng: parts[1] }, walkSel.options[walkSel.selectedIndex].textContent.trim());
        });
    }
    // "Within X miles" distance filter (only meaningful once an origin is set).
    if (distSel) distSel.addEventListener('change', () => {
        distanceLimit = distSel.value ? parseFloat(distSel.value) : null;
        applyFilters();
    });
    // "Search this area": only offered once the user has dragged the map a
    // meaningful distance (~0.5 mi) from the current search centre, so tiny
    // nudges don't trigger it. Clicking it switches the origin to the map centre
    // (a new, exclusive origin) - clearing the walk + postcode inputs and marking
    // the postcode box "Map location" - while keeping every refinement (category,
    // dog-access, sort, radius) in place.
    if (map && searchAreaBtn) {
        const MOVE_MI = 0.5;
        map.on('dragend', () => {
            const c = map.getCenter();
            const moved = !searchRef || haversine({ lat: c.lat, lng: c.lng }, searchRef) > MOVE_MI;
            searchAreaBtn.hidden = !moved;
        });
        searchAreaBtn.addEventListener('click', () => {
            searchAreaBtn.hidden = true;
            const c = map.getCenter();
            if (walkSel) walkSel.value = '';
            if (locInput) locInput.value = 'Map location';
            setOrigin({ lat: c.lat, lng: c.lng }, 'the map area', { keepSort: true });
        });
    }
    // ?near=lat,lng[&walk=Name] deep link (from a walk's "Browse all …").
    (function () {
        const params = new URLSearchParams(location.search);
        const near = params.get('near');
        if (!near) return;
        const parts = near.split(',').map(parseFloat);
        if (!isFinite(parts[0]) || !isFinite(parts[1])) return;
        const label = params.get('walk') || 'this walk';
        if (walkSel) { for (let i = 0; i < walkSel.options.length; i++) { if (walkSel.options[i].value === near || walkSel.options[i].textContent.trim() === label) { walkSel.selectedIndex = i; break; } } }
        setOrigin({ lat: parts[0], lng: parts[1] }, label);
    })();
})();

// Walk pages — "Make a Day of It": filter (category + dog access) and sort one
// flat, blended-ranked list of nearby places. No map.
(function () {
    const root = document.getElementById('make-a-day');
    if (!root) return;
    const bar = root.querySelector('.day-filter');
    if (!bar) return;
    const typePills = Array.from(bar.querySelectorAll('[data-daytype]'));
    const accessPills = Array.from(bar.querySelectorAll('[data-dayaccess]'));
    const sortSel = root.querySelector('.day-sort');
    const groups = Array.from(root.querySelectorAll('.day-group'));
    const countEl = root.querySelector('.day-count');
    let type = 'all';
    const access = new Set();

    const num = (c, a) => parseFloat(c.dataset[a]) || 0;
    const shown = (c) => {
        if (type !== 'all' && !type.split(',').includes(c.dataset.placeType)) return false;
        if (access.size) {
            const a = (c.dataset.access || '').split(/\s+/);
            for (const k of access) if (!a.includes(k)) return false;
        }
        return true;
    };
    const sortCards = (list) => {
        const s = sortSel ? sortSel.value : 'recommended';
        const arr = list.slice();
        if (s === 'distance') arr.sort((a, b) => num(a, 'dist') - num(b, 'dist'));
        else if (s === 'az') arr.sort((a, b) => (a.dataset.name || '').localeCompare(b.dataset.name || ''));
        // Recommended: the blended score baked at build time (distances here are
        // fixed relative to this walk, so no client recompute is needed).
        else arr.sort((a, b) => num(b, 'score') - num(a, 'score') || num(a, 'dist') - num(b, 'dist'));
        return arr;
    };
    const apply = () => {
        let total = 0;
        groups.forEach((g) => {
            const list = Array.from(g.querySelectorAll('[data-place-type]'));
            const container = g.querySelector('.day-list');
            let vis = 0;
            list.forEach((c) => { const ok = shown(c); c.style.display = ok ? '' : 'none'; if (ok) vis++; });
            sortCards(list.filter(shown)).forEach((c) => container.appendChild(c));
            g.hidden = vis === 0;
            total += vis;
        });
        if (countEl) countEl.textContent = total
            ? ('Showing ' + total + ' place' + (total === 1 ? '' : 's'))
            : 'No places match those filters';
    };
    const press = (b, on) => { b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    typePills.forEach((b) => b.addEventListener('click', () => {
        type = b.dataset.daytype;
        typePills.forEach((x) => press(x, x === b));
        apply();
    }));
    accessPills.forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.dayaccess;
        const on = !access.has(k);
        if (on) access.add(k); else access.delete(k);
        press(b, on);
        apply();
    }));
    if (sortSel) sortSel.addEventListener('change', apply);
    apply();
})();
