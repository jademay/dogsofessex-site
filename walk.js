/* ===========================================================
   walk.js — turns a walk page into an area micro-guide.

   On any walk page, set `window.WALK_ID` before this script loads.
   It reads /data/walks.json + /data/places.json, measures the
   distance from this walk to every place and every other walk,
   and renders:
     • Make a Day of It   (#make-a-day)     nearby dog-friendly places
     • Explore Nearby     (#explore-nearby) nearby walks, by distance
     • More Walks in Area (#more-walks)      walks in the same area

   Add a new pub/café to places.json and it automatically appears
   on every walk page within range. No page edits needed.
   =========================================================== */

(function () {
    const WALK_ID = window.WALK_ID;
    if (!WALK_ID) return;

    // Walk pages live in /walks/, data lives in /data/
    const DATA = '../data/';

    // Tuning
    const DAY_RADIUS_MI = 10;      // "Make a Day of It" search radius
    const DAY_MAX = 4;             // how many place cards to show
    const NEARBY_WALK_RADIUS_MI = 25;
    const NEARBY_WALK_MAX = 6;
    const AVG_MPH = 26;            // rough local-road speed for time estimates
    const ROAD_FACTOR = 1.25;     // straight-line → road distance fudge factor

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

    // --- geo helpers ---
    const toRad = (d) => (d * Math.PI) / 180;
    function miles(a, b) {
        const R = 3958.8;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const la1 = toRad(a.lat);
        const la2 = toRad(b.lat);
        const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    }
    function driveMins(mi) {
        return Math.max(3, Math.round((mi * ROAD_FACTOR) / AVG_MPH * 60));
    }
    function distLabel(mi) {
        return `${mi.toFixed(1)} mi · ~${driveMins(mi)} min`;
    }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));

    // Pick a varied set: prefer not to show 3 of the same type before others
    function pickVariety(sorted, max) {
        const out = [];
        const counts = {};
        for (const p of sorted) {
            const c = counts[p.type] || 0;
            if (c < 2) { out.push(p); counts[p.type] = c + 1; }
            if (out.length >= max) return out;
        }
        // top up with anything remaining if variety pass came up short
        for (const p of sorted) {
            if (out.length >= max) break;
            if (!out.includes(p)) out.push(p);
        }
        return out;
    }

    Promise.all([
        fetch(DATA + 'walks.json').then((r) => r.json()),
        fetch(DATA + 'places.json').then((r) => r.json())
    ]).then(([walks, places]) => {
        const walk = walks.find((w) => w.id === WALK_ID);
        if (!walk) return;
        const origin = { lat: walk.lat, lng: walk.lng };

        // ----- At a glance ratings -----
        renderGlance(walk.glance);

        // ----- Make a Day of It -----
        const nearbyPlaces = places
            .map((p) => ({ ...p, _mi: miles(origin, { lat: p.lat, lng: p.lng }) }))
            .filter((p) => p._mi <= DAY_RADIUS_MI)
            .sort((a, b) => a._mi - b._mi);
        renderDay(pickVariety(nearbyPlaces, DAY_MAX), walk);

        // ----- Explore Nearby (other walks) -----
        const nearbyWalks = walks
            .filter((w) => w.id !== WALK_ID)
            .map((w) => ({ ...w, _mi: miles(origin, { lat: w.lat, lng: w.lng }) }))
            .filter((w) => w._mi <= NEARBY_WALK_RADIUS_MI)
            .sort((a, b) => a._mi - b._mi);
        renderExplore(nearbyWalks.slice(0, NEARBY_WALK_MAX), walk);
    }).catch(() => {
        // Fail quietly — the hand-authored content above still stands.
    });

    function walkHref(w) {
        return w.hasPage ? `${w.id}.html` : '../index.html#walks';
    }

    function starsHTML(score) {
        const s = Math.max(0, Math.min(5, Math.round(score) || 0));
        return `<span class="on">${'★'.repeat(s)}</span>` +
            `<span class="off">${'☆'.repeat(5 - s)}</span>`;
    }

    function renderGlance(items) {
        const host = document.getElementById('glance');
        if (!host || !items || !items.length) return;
        host.innerHTML = items.map((row) => `
            <div class="glance-row">
                <span class="glance-feature">${esc(row.label)}</span>
                <span class="glance-stars">${starsHTML(row.score)}</span>
            </div>`).join('');
    }

    function renderDay(items, walk) {
        const host = document.getElementById('make-a-day');
        if (!host || !items.length) return;
        const cards = items.map((p) => {
            const meta = TYPE_META[p.type] || { icon: '📍', label: p.type };
            const href = p.website && p.website !== '#' ? p.website : '#';
            const ext = href !== '#' ? ' target="_blank" rel="noopener"' : '';
            return `
                <a class="day-card" href="${esc(href)}"${ext}>
                    <span class="day-icon">${meta.icon}</span>
                    <span class="day-body">
                        <span class="day-type">${esc(meta.label)}</span>
                        <span class="day-name">${esc(p.name)}</span>
                        <span class="day-dist">${distLabel(p._mi)}</span>
                        ${p.notes ? `<span class="day-note">${esc(p.notes)}</span>` : ''}
                    </span>
                </a>`;
        }).join('');
        host.innerHTML = `
            <h2>🐾 Make a Day of It</h2>
            <p class="section-lead">Already heading to ${esc(walk.name.split(' ')[0])}? Here's what other local dog owners pair with this walk.</p>
            <div class="day-grid">${cards}</div>`;
    }

    function renderExplore(items, walk) {
        const host = document.getElementById('explore-nearby');
        if (!host || !items.length) return;
        const cards = items.map((w) => {
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
        host.innerHTML = `
            <h2>🧭 Explore Nearby</h2>
            <p class="section-lead">Other dog-friendly walks within easy reach of ${esc(walk.name)}.</p>
            <div class="carousel">
                <button class="carousel-btn prev" type="button" aria-label="Scroll left">‹</button>
                <div class="carousel-track">${cards}</div>
                <button class="carousel-btn next" type="button" aria-label="Scroll right">›</button>
            </div>`;
        wireCarousel(host.querySelector('.carousel'));
    }

    function wireCarousel(root) {
        if (!root) return;
        const track = root.querySelector('.carousel-track');
        const prev = root.querySelector('.prev');
        const next = root.querySelector('.next');
        const step = () => Math.min(track.clientWidth * 0.85, 340);
        prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
        next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
        const update = () => {
            const max = track.scrollWidth - track.clientWidth - 2;
            prev.classList.toggle('hidden', track.scrollLeft <= 2);
            next.classList.toggle('hidden', track.scrollLeft >= max);
        };
        track.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        update();
    }

    // --- Save / Email / Share actions ---
    document.addEventListener('DOMContentLoaded', () => {
        const saveBtn = document.getElementById('save-walk');
        const emailBtn = document.getElementById('email-walk');
        const shareBtn = document.getElementById('share-walk');
        const KEY = 'doe_saved_walks';
        const read = () => {
            try { return JSON.parse(localStorage.getItem(KEY)) || []; }
            catch (e) { return []; }
        };

        if (saveBtn) {
            const sync = () => {
                const saved = read().includes(WALK_ID);
                saveBtn.classList.toggle('is-saved', saved);
                saveBtn.innerHTML = saved ? '♥ Saved' : '♡ Save this walk';
            };
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                let list = read();
                list = list.includes(WALK_ID)
                    ? list.filter((id) => id !== WALK_ID)
                    : [...list, WALK_ID];
                localStorage.setItem(KEY, JSON.stringify(list));
                sync();
            });
            sync();
        }

        if (emailBtn) {
            const subject = encodeURIComponent('A dog-friendly walk in Essex');
            const body = encodeURIComponent(
                `Thought you'd like this Essex walk:\n\n${document.title}\n${location.href}`
            );
            emailBtn.setAttribute('href', `mailto:?subject=${subject}&body=${body}`);
        }

        if (shareBtn) {
            shareBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const data = { title: document.title, url: location.href };
                if (navigator.share) {
                    try { await navigator.share(data); } catch (err) { /* cancelled */ }
                } else if (navigator.clipboard) {
                    await navigator.clipboard.writeText(location.href);
                    const old = shareBtn.textContent;
                    shareBtn.textContent = '🔗 Link copied';
                    setTimeout(() => { shareBtn.textContent = old; }, 1800);
                }
            });
        }
    });
})();
