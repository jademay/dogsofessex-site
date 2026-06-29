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

    function apply() {
        const keys = [...selected];
        const visible = [];
        cards.forEach((c) => {
            const ok = !keys.length || keys.every((k) => { const s = score(c, k); return s != null && s >= 3; });
            const starsEl = c.querySelector('.walk-card-stars');
            if (ok) {
                visible.push(c);
                c.style.display = '';
                if (keys.length) {
                    starsEl.hidden = false;
                    starsEl.innerHTML = keys.map((k) =>
                        `<span class="wc-row"><span class="wc-label">${LABELS[k]}</span><span class="wc-stars">${starHTML(score(c, k))}</span></span>`
                    ).join('');
                } else {
                    starsEl.hidden = true; starsEl.innerHTML = '';
                }
            } else {
                c.style.display = 'none';
                starsEl.hidden = true; starsEl.innerHTML = '';
            }
        });
        sortCards(visible, keys).forEach((c) => grid.appendChild(c));
        if (noResults) noResults.hidden = visible.length > 0;
    }

    pills.forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const on = !selected.has(key);
            if (on) selected.add(key); else selected.delete(key);
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            apply();
        });
    });

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            if (sortSelect.value === 'nearest' && !userPos && navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => { userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }; apply(); },
                    () => { /* denied — keeps current order */ }
                );
            }
            apply();
        });
    }
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
