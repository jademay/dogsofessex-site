// Dogs of Essex — small enhancements

// Current year in footer
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Mobile nav toggle
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if (toggle && links) {
    toggle.addEventListener('click', () => {
        const open = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Close menu when a link is tapped
    links.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', () => {
            links.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
        });
    });
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
    // Scroll a card so its centre lines up with the vertical centre of the
    // sticky map. Because the map is sticky, target the position it occupies
    // once stuck (CSS top) rather than its current on-screen spot. force=true
    // always recentres (click); otherwise only scrolls when the card is
    // outside the map's vertical band (hover).
    const STICKY_TOP = 84; // matches .walks-map-col { top: 84px }
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
        // top is the column's CSS top plus the map's offset within the column.
        const stuckMapTop = STICKY_TOP + (mapEl.offsetTop || 0);
        const cardDocCentre = card.top + window.scrollY + card.height / 2;
        let targetY = cardDocCentre - (stuckMapTop + map.height / 2);
        // Never scroll up past the point where the map sticks, so for top cards
        // the map stays stuck (centred/full-height) on the right rather than
        // being pushed down by the filters. Measure the explorer (not the sticky
        // column, which would report its already-stuck position).
        const ref = mapEl.closest('.walks-explorer');
        if (ref) {
            const minStick = (ref.getBoundingClientRect().top + window.scrollY) - STICKY_TOP;
            targetY = Math.max(minStick, targetY);
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
            m.bindPopup('<div class="walk-pop"><strong>' + esc(name) + '</strong>' +
                (href ? '<br><a href="' + esc(href) + '">View walk →</a>' : '') + '</div>', { autoPan: false });
            m.on('mouseover', () => { highlightCard(i, true); scrollToCard(i, false); });
            m.on('mouseout', () => highlightCard(i, false));
            m.on('click', () => { scrollToCard(i, true); });
            walkMarkers.push(m);
        });
        // Hovering a card grows/colours its marker.
        cards.forEach((card, i) => {
            if (!walkMarkers[i]) return;
            card.addEventListener('mouseenter', () => highlightMarker(i, true));
            card.addEventListener('mouseleave', () => highlightMarker(i, false));
        });
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
            setTimeout(() => {
                walksMap.on('moveend', () => { boundsSync = true; applyBounds(); });
            }, 300);
        }, 90);
    }

    function updateCount(count) {
        if (!countEl) return;
        const total = catEligible.size;
        const noun = count === 1 ? 'walk' : 'walks';
        countEl.textContent = (boundsSync && count < total)
            ? 'Showing ' + count + ' ' + noun + ' in this area'
            : 'Showing all ' + count + ' ' + noun;
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
            const d = el.querySelector('.place-dist');
            if (d) d.textContent = mi.toFixed(1) + ' mi away';
        });
        const parents = new Set(items.map((el) => el.parentNode));
        parents.forEach((parent) => {
            Array.from(parent.children)
                .filter((c) => c.dataset && c.dataset.dist != null)
                .sort((a, b) => parseFloat(a.dataset.dist) - parseFloat(b.dataset.dist))
                .forEach((c) => parent.appendChild(c));
        });
        say('Showing places nearest to ' + label + '.');
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
