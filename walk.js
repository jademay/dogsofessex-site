/* ===========================================================
   walk.js — renders a walk page from the data layer.

   On any walk page, set `window.WALK_ID` before this loads.
   Sources:
     /data/walks.json   this walk (hero, glance, gallery, route,
                        what-to-expect, seo, bestFor) + all walks
                        (for Explore Nearby distance calc)
     /data/places.json  dog-friendly places (Make a Day of It)
     /data/tips.json    community tips, keyed by walkId

   Update a walk once in walks.json and the whole page follows.
   Add a place to places.json and it appears on every walk in range.
   =========================================================== */

(function () {
    const WALK_ID = window.WALK_ID;
    if (!WALK_ID) return;

    const DATA = '../data/';

    // Tuning
    const DAY_RADIUS_MI = 10;
    const DAY_MAX = 4;
    const NEARBY_WALK_RADIUS_MI = 25;
    const NEARBY_WALK_MAX = 6;
    const AVG_MPH = 26;           // assumed local-road speed for time estimates
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

    // --- helpers ---
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
    const driveMins = (mi) => Math.max(3, Math.round((mi * ROAD_FACTOR) / AVG_MPH * 60));
    const distLabel = (mi) => `${mi.toFixed(1)} mi · ~${driveMins(mi)} min`;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
    const $ = (id) => document.getElementById(id);

    function pickVariety(sorted, max) {
        const out = [];
        const counts = {};
        for (const p of sorted) {
            const c = counts[p.type] || 0;
            if (c < 2) { out.push(p); counts[p.type] = c + 1; }
            if (out.length >= max) return out;
        }
        for (const p of sorted) {
            if (out.length >= max) break;
            if (!out.includes(p)) out.push(p);
        }
        return out;
    }

    const getJSON = (file) => fetch(DATA + file).then((r) => r.json()).catch(() => null);

    Promise.all([
        getJSON('walks.json'),
        getJSON('places.json'),
        getJSON('tips.json')
    ]).then(([walks, places, tips]) => {
        walks = walks || [];
        places = places || [];
        tips = tips || [];

        const walk = walks.find((w) => w.id === WALK_ID);
        if (!walk) return;
        const origin = { lat: walk.lat, lng: walk.lng };

        renderSeo(walk);
        renderHero(walk);
        renderIntro(walk);
        renderGlance(walk.glance);
        renderGallery(walk.gallery);
        renderRoute(walk);
        renderWhatToExpect(walk.whatToExpect);

        // Make a Day of It — nearby places
        const nearbyPlaces = places
            .map((p) => ({ ...p, _mi: miles(origin, { lat: p.lat, lng: p.lng }) }))
            .filter((p) => p._mi <= DAY_RADIUS_MI)
            .sort((a, b) => a._mi - b._mi);
        renderDay(pickVariety(nearbyPlaces, DAY_MAX), walk);

        // Explore Nearby — other walks
        const nearbyWalks = walks
            .filter((w) => w.id !== WALK_ID)
            .map((w) => ({ ...w, _mi: miles(origin, { lat: w.lat, lng: w.lng }) }))
            .filter((w) => w._mi <= NEARBY_WALK_RADIUS_MI)
            .sort((a, b) => a._mi - b._mi);
        renderExplore(nearbyWalks.slice(0, NEARBY_WALK_MAX), walk);

        // Community tips for this walk
        renderTips(tips.filter((t) => t.walkId === WALK_ID));
    }).catch(() => { /* fail quietly */ });

    // ---------- renderers ----------

    function renderSeo(walk) {
        const seo = walk.seo || {};
        if (seo.title) document.title = seo.title;
        setMeta('name', 'description', seo.description);
        setMeta('property', 'og:title', seo.title || document.title);
        setMeta('property', 'og:description', seo.description);
        setMeta('property', 'og:type', 'article');
        if (seo.image) setMeta('property', 'og:image', seo.image);
    }
    function setMeta(attr, key, val) {
        if (!val) return;
        let m = document.head.querySelector(`meta[${attr}="${key}"]`);
        if (!m) {
            m = document.createElement('meta');
            m.setAttribute(attr, key);
            document.head.appendChild(m);
        }
        m.setAttribute('content', val);
    }

    function renderHero(walk) {
        const host = $('walk-hero');
        if (!host) return;
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

        host.innerHTML = `
            <p class="breadcrumb"><a href="../index.html">Home</a> · <a href="../index.html#walks">Walks</a> · ${esc(walk.name)}</p>
            <h1>${walk.emoji ? esc(walk.emoji) + ' ' : ''}${esc(walk.name)}</h1>
            ${ratingBlock}
            ${metaLine ? `<p class="meta-line">${esc(metaLine)}</p>` : ''}
            ${badges ? `<div class="walk-chips">${badges}</div>` : ''}`;
    }

    function renderIntro(walk) {
        const host = $('walk-intro');
        if (host && walk.intro) host.textContent = walk.intro;
    }

    function starsHTML(score) {
        const s = Math.max(0, Math.min(5, Math.round(score) || 0));
        return `<span class="on">${'★'.repeat(s)}</span><span class="off">${'☆'.repeat(5 - s)}</span>`;
    }
    function renderGlance(items) {
        const host = $('glance');
        if (!host || !items || !items.length) return;
        host.innerHTML = items.map((row) => `
            <div class="glance-row">
                <span class="glance-feature">${esc(row.label)}</span>
                <span class="glance-stars">${starsHTML(row.score)}</span>
            </div>`).join('');
    }

    function renderGallery(items) {
        const host = $('gallery');
        if (!host || !items || !items.length) return;
        host.innerHTML = items.map((g, i) => {
            const big = i === 0 ? ' g-big' : '';
            const cap = esc(g.caption || '');
            if (g.image) {
                return `<figure class="photo-ph g-item${big}">
                    <img src="${esc(g.image)}" alt="${cap}" loading="lazy"
                         onerror="this.remove();this.parentNode.classList.add('noimg')">
                    <figcaption>${cap}</figcaption>
                </figure>`;
            }
            return `<figure class="photo-ph g-item noimg${big}"><figcaption>${cap}</figcaption></figure>`;
        }).join('');
    }

    function renderRoute(walk) {
        const host = $('route');
        if (!host) return;
        const r = walk.route || {};
        const pill = (label, val) => val
            ? `<span class="route-pill"><strong>${esc(label)}</strong> ${esc(val)}</span>` : '';
        host.innerHTML = `
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

    function renderWhatToExpect(paras) {
        const host = $('what-to-expect');
        if (!host || !paras || !paras.length) return;
        host.innerHTML = paras.map((p) => `<p>${esc(p)}</p>`).join('');
    }

    function renderDay(items, walk) {
        const host = $('make-a-day');
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
            <p class="section-lead">Already heading to ${esc((walk.town || walk.name).split(' ')[0])}? Here's what other local dog owners pair with this walk.</p>
            <div class="day-grid">${cards}</div>`;
    }

    function walkHref(w) {
        return w.hasPage ? `${w.id}.html` : '../index.html#walks';
    }
    function renderExplore(items, walk) {
        const host = $('explore-nearby');
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

    function renderTips(tips) {
        const host = $('community-tips');
        if (!host) return;
        if (!tips.length) {
            host.innerHTML = '<p class="section-lead" style="margin:0;">Be the first to leave a tip for this walk.</p>';
            return;
        }
        host.innerHTML = tips.map((t) => `<blockquote class="tip-card">${esc(t.tip)}</blockquote>`).join('');
    }

    // --- Save / Email / Share ---
    document.addEventListener('DOMContentLoaded', () => {
        const saveBtn = $('save-walk');
        const emailBtn = $('email-walk');
        const shareBtn = $('share-walk');
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
