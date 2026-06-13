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

        // ----- More Walks in [Area] -----
        const sameArea = walks
            .filter((w) => w.id !== WALK_ID && w.area === walk.area)
            .map((w) => ({ ...w, _mi: miles(origin, { lat: w.lat, lng: w.lng }) }))
            .sort((a, b) => a._mi - b._mi);
        renderMore(sameArea.slice(0, 4), walk.area);
    }).catch(() => {
        // Fail quietly — the hand-authored content above still stands.
    });

    function walkHref(w) {
        return w.hasPage ? `${w.id}.html` : '../index.html#walks';
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
        const rows = items.map((w) => {
            const icon = SCENERY_ICON[w.scenery] || '🐾';
            return `
                <a class="explore-row" href="${walkHref(w)}">
                    <span class="explore-icon">${icon}</span>
                    <span class="explore-name">${esc(w.name)}</span>
                    <span class="explore-dist">${distLabel(w._mi)}</span>
                </a>`;
        }).join('');
        host.innerHTML = `
            <h2>🧭 Explore Nearby</h2>
            <p class="section-lead">Other dog-friendly walks within easy reach of ${esc(walk.name)}.</p>
            <div class="explore-list">${rows}</div>`;
    }

    function renderMore(items, area) {
        const host = document.getElementById('more-walks');
        if (!host || !items.length) return;
        const cards = items.map((w) => {
            const icon = SCENERY_ICON[w.scenery] || '🐾';
            const tags = (w.tags || []).slice(0, 3)
                .map((t) => `<span class="tag">${esc(t)}</span>`).join('');
            return `
                <a href="${walkHref(w)}" class="walk-card">
                    <div class="photo-ph"><span>${icon} ${esc(w.name)}</span></div>
                    <div class="walk-card-body">
                        <h3>${esc(w.name)}</h3>
                        <div class="tag-row">${tags}</div>
                        <span class="link-arrow">${w.hasPage ? 'Explore Walk →' : 'Coming soon'}</span>
                    </div>
                </a>`;
        }).join('');
        host.innerHTML = `
            <div class="section-head" style="text-align:left;margin-bottom:2rem;">
                <p class="eyebrow">More walks</p>
                <h2>More walks in ${esc(area)}</h2>
            </div>
            <div class="walk-grid">${cards}</div>`;
    }

    // --- At-a-glance star ratings (★ filled / ☆ empty from data-score) ---
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.glance-stars').forEach((el) => {
            const score = Math.max(0, Math.min(5, parseInt(el.dataset.score, 10) || 0));
            el.innerHTML =
                `<span class="on">${'★'.repeat(score)}</span>` +
                `<span class="off">${'☆'.repeat(5 - score)}</span>`;
        });
    });

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
