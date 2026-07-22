/* ===========================================================
   walk.js — progressive enhancement for walk pages.

   The page content is pre-rendered into static HTML at build time
   (see build.js), so this script no longer fetches or renders data.
   It only wires up interactivity:
     • the Explore Nearby carousel
     • Save / Email / Share buttons
   =========================================================== */

(function () {
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.carousel').forEach(wireCarousel);
        wireDayToggles();
        wireActions();
        wireLightbox();
        wireGlance();
        wireRoutes();
        wireImprove();
        wireCarparksMap();
        wireGettingThereMap();
    });

    // Fallback "Getting there" map for walks without structured car parks: a
    // reliable Leaflet/OSM map centred on the walk with a single pin (replaces
    // the old Google keyless embed, which Google blocks). Click the pin to open
    // the location in Google Maps.
    function wireGettingThereMap() {
        const el = document.getElementById('getting-there-map');
        if (!el || typeof L === 'undefined') return;
        const lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
        if (!isFinite(lat) || !isFinite(lng)) { el.remove(); return; }
        const map = L.map(el, { scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        map.setView([lat, lng], 14);
        const m = L.marker([lat, lng], {
            icon: L.divIcon({ className: 'walk-map-pin', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
            title: 'Open in Google Maps'
        }).addTo(map);
        m.on('click', () => window.open('https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng, '_blank', 'noopener'));
        setTimeout(() => map.invalidateSize(), 60);
    }

    // "Getting there" overview map: plot every car park (with coordinates) so
    // visitors can see all parking options at once.
    function wireCarparksMap() {
        const el = document.getElementById('carparks-map');
        if (!el || typeof L === 'undefined') return;
        const carParks = Array.isArray(window.WALK_CARPARKS) ? window.WALK_CARPARKS : [];
        if (!carParks.length) { el.remove(); return; }
        const map = L.map(el, { scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        // Numbered circular markers matching the car park cards above; the name
        // shows on hover/tap. Compact so close-together car parks stay distinct.
        // "Recommended" (terracotta) only applies when there's a choice - with a
        // single car park it's just "the car park", shown neutral.
        const multi = carParks.length > 1;
        const openInMaps = (cp) => window.open('https://www.google.com/maps/search/?api=1&query=' + cp.lat + ',' + cp.lng, '_blank', 'noopener');
        const latlngs = [];
        const markers = [];
        carParks.forEach((cp, i) => {
            const rec = cp.recommended && multi;
            const m = L.marker([cp.lat, cp.lng], {
                icon: L.divIcon({
                    className: 'cp-pin' + (rec ? ' cp-pin--rec' : ''),
                    html: '<span class="cp-pin-inner">' + (i + 1) + '</span>',
                    iconSize: [30, 30], iconAnchor: [15, 15]
                }),
                title: cp.name,
                riseOnHover: true,
                zIndexOffset: rec ? 1000 : 0
            }).addTo(map);
            m.bindTooltip(cp.name, { direction: 'top', offset: [0, -14], opacity: 1 });
            // Keep the tooltip inside the map when a marker sits near an edge
            // (shared helper from script.js, loaded before walk.js).
            m.on('tooltipopen', (e) => { if (typeof clampMapTooltip === 'function') clampMapTooltip(map, e.tooltip); });
            // Click a marker to open that car park in Google Maps.
            m.on('click', () => openInMaps(cp));
            markers.push(m);
            latlngs.push([cp.lat, cp.lng]);
        });
        // Re-fit after invalidateSize: if the map inits before its container has
        // a real size, the first fit lands zoomed out; re-fitting centres it.
        const fitCarparks = () => {
            if (latlngs.length === 1) map.setView(latlngs[0], 15);
            else map.fitBounds(latlngs, { padding: [45, 45] });
        };
        fitCarparks();
        setTimeout(() => { map.invalidateSize(); fitCarparks(); }, 60);

        // Link cards and markers. Clicking a card SELECTS its car park - enlarges
        // the marker and zooms the map to it (no Google Maps jump). The ↗ link on
        // the card opens Google Maps; clicking a map marker also opens Google Maps
        // (wired above). Hovering either gives a temporary highlight; the
        // selection just stays enlarged until another card is picked.
        const cardByName = {};
        document.querySelectorAll('.cp-card[data-cp-name]').forEach((card) => {
            cardByName[card.getAttribute('data-cp-name')] = card;
        });
        let selected = -1, hovered = -1;
        const render = () => {
            markers.forEach((m, i) => {
                const on = (i === selected || i === hovered);
                const card = cardByName[carParks[i].name];
                if (m && m._icon) m._icon.classList.toggle('cp-pin--active', on);
                if (m) m.setZIndexOffset(on ? 2000 : (carParks[i].recommended && multi ? 1000 : 0));
                if (card) card.classList.toggle('is-active', on);
            });
        };
        const select = (i) => {
            selected = i;
            render();
            const m = markers[i];
            if (m) map.panInside(m.getLatLng(), { padding: [50, 50] });
        };
        carParks.forEach((cp, i) => {
            const card = cardByName[cp.name];
            if (card) {
                card.addEventListener('mouseenter', () => { hovered = i; render(); });
                card.addEventListener('mouseleave', () => { hovered = -1; render(); });
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.cp-card-maps')) return; // let the ↗ open Google Maps
                    select(i);
                });
            }
            const m = markers[i];
            if (m) {
                m.on('mouseover', () => { hovered = i; render(); });
                m.on('mouseout', () => { hovered = -1; render(); });
            }
        });
    }

    // --- Help improve this walk ---
    // Four contribution types, each opening the same form pre-set to that type.
    // Submissions are emailed via FormSubmit (formsubmit.co); approved walking
    // tips are then added manually to data/tips.json and baked in on rebuild.
    // Private FormSubmit token for tips@dogsofessex.co.uk (from its activation
    // email) - keeps the address out of the page source. Not the hello@ token.
    const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/5e89a618d69f9442d8e8fdc17f28d16a';
    const TIP_TYPES = {
        'walkingTip': {
            title: 'Share a tip', label: 'Your tip',
            placeholder: 'e.g. Parking is free after 6pm.\nThe stream has dried up.\nThe north path is very muddy after rain.\nThere are cattle in the fields during the summer.'
        },
        'report': { title: 'Report an issue', label: 'What needs fixing?', placeholder: 'Tell us what looks wrong or out of date.' },
        'newPlaceSuggestion': { title: 'Recommend a place', label: 'Which place, and why?', placeholder: 'Name of the café, pub or restaurant — and what makes it dog-friendly.' },
        'newWalkSuggestion': { title: 'Suggest a new walk', label: 'Tell us about the walk', placeholder: 'Where is it, and what makes it good for dogs?' },
        'question': { title: 'Get in touch', label: 'Your message', placeholder: "Ask us anything, or let us know what's on your mind." }
    };

    function wireImprove() {
        const section = document.getElementById('improve');
        if (!section) return;
        const walkName = section.dataset.walk || '';
        const walkId = section.dataset.walkid || '';
        const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

        // One primary action opens the form straight away; the first field lets
        // people pick what they want to share (no intermediate button step).
        const modal = document.createElement('div');
        modal.className = 'tip-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML =
            '<div class="tip-modal-inner">' +
            '<button class="tip-modal-close" type="button" aria-label="Close">×</button>' +
            '<h3 class="tip-modal-title">Share something about this walk</h3>' +
            '<form class="tip-form">' +
            '<label><span>What would you like to share?</span>' +
            '<select name="tiptype" class="tip-type-select">' +
            '<option value="walkingTip">Share a tip</option>' +
            '<option value="report">Report an issue</option>' +
            '<option value="newPlaceSuggestion">Recommend a place</option>' +
            '<option value="newWalkSuggestion">Suggest a new walk</option>' +
            '<option value="question">Ask a question / Something else</option>' +
            '</select></label>' +
            '<label><span class="tip-field-label">Your tip</span><textarea name="tip" rows="6" required maxlength="1000"></textarea></label>' +
            '<label>Name <span class="opt">(optional)</span><input name="name" type="text" maxlength="80" placeholder="Sarah & Luna"></label>' +
            '<label>Email <span class="opt">(optional, never shown)</span><input name="email" type="email" maxlength="120"></label>' +
            '<button type="submit" class="btn btn-primary tip-submit">Submit</button>' +
            '<p class="tip-form-msg" role="status"></p>' +
            '<p class="form-consent">By submitting this form, you agree to our <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a> and <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms of Use</a>.</p>' +
            '</form></div>';
        document.body.appendChild(modal);

        const form = modal.querySelector('.tip-form');
        const msg = modal.querySelector('.tip-form-msg');
        const titleEl = modal.querySelector('.tip-modal-title');
        const fieldLabel = modal.querySelector('.tip-field-label');
        const typeSelect = form.querySelector('.tip-type-select');
        const textarea = form.querySelector('textarea');

        // Reflect the chosen type in the field label and placeholder (the tip
        // placeholder itself lists a few examples so people don't get stuck).
        const applyType = (type) => {
            const cfg = TIP_TYPES[type] || TIP_TYPES.walkingTip;
            fieldLabel.textContent = cfg.label;
            textarea.placeholder = cfg.placeholder;
        };
        typeSelect.addEventListener('change', () => applyType(typeSelect.value));

        // Scroll-lock the page while the modal is open. On touch, overflow:hidden
        // alone bleeds through, so pin the body at its current scroll offset and
        // restore it on close.
        let savedScrollY = 0;
        const lockScroll = () => {
            savedScrollY = window.scrollY || window.pageYOffset || 0;
            if (isMobile()) {
                document.body.style.top = '-' + savedScrollY + 'px';
                document.body.classList.add('modal-open');
            } else {
                document.body.style.overflow = 'hidden';
            }
        };
        const unlockScroll = () => {
            if (document.body.classList.contains('modal-open')) {
                document.body.classList.remove('modal-open');
                document.body.style.top = '';
                window.scrollTo(0, savedScrollY);
            }
            document.body.style.overflow = '';
        };

        const closeModal = () => { modal.classList.remove('open'); unlockScroll(); };
        const openModal = (type) => {
            const t = TIP_TYPES[type] ? type : 'walkingTip';
            // "about this walk" only makes sense on a walk page; elsewhere
            // (Contact, About) use a neutral title.
            titleEl.textContent = walkName ? 'Share something about this walk' : 'Get in touch';
            form.reset();
            typeSelect.value = t;
            applyType(t);
            // Optional prefill: the 404 page passes "Broken link: {url}" so a
            // report carries the address the visitor actually hit. {url} -> the
            // real URL (GitHub Pages serves 404.html at the requested path).
            const prefill = section.getAttribute('data-report-prefill');
            if (prefill && t === 'report') textarea.value = prefill.replace('{url}', location.href) + '\n\n';
            msg.textContent = '';
            lockScroll();
            modal.classList.add('open');
            modal.scrollTop = 0;
            // Focus the field on desktop; on mobile, skip it so the keyboard
            // doesn't immediately cover the form.
            if (!isMobile()) textarea.focus();
        };

        // Includes the "Share a tip" button up in the Community tips section.
        document.querySelectorAll('.improve-btn').forEach((btn) => {
            btn.addEventListener('click', () => openModal(btn.dataset.tiptype));
        });

        // Deep-link support: a URL hash opens the form straight to one type, e.g.
        //   /contact.html#recommend-a-place
        // Works on any page that has the form (Contact, About, walk pages) and
        // from links elsewhere on the site. hashchange covers same-page links.
        const HASH_TIP = {
            'recommend-a-place': 'newPlaceSuggestion',
            'suggest-a-walk': 'newWalkSuggestion',
            'report': 'report',
            'share-a-tip': 'walkingTip',
            'ask': 'question'
        };
        const openFromHash = () => {
            const type = HASH_TIP[(location.hash || '').replace('#', '').toLowerCase()];
            if (!type) return;
            section.scrollIntoView({ block: 'start' });
            openModal(type);
        };
        window.addEventListener('hashchange', openFromHash);
        openFromHash();

        modal.querySelector('.tip-modal-close').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const tip = form.tip.value.trim();
            if (!tip) return;
            // Every type carries the walk for context (walkingTip/report relate
            // to it directly). Place fields are left blank here
            // (filled in when the same form is used on a place page later).
            const carryWalk = true;
            const currentType = TIP_TYPES[typeSelect.value] ? typeSelect.value : 'walkingTip';
            const btn = form.querySelector('.tip-submit');
            btn.disabled = true; msg.textContent = 'Sending…';
            fetch(FORMSUBMIT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    tipType: currentType,
                    walk: carryWalk ? walkName : '',
                    walkId: carryWalk ? walkId : '',
                    place: '',
                    placeId: '',
                    tip: tip,
                    name: form.name.value.trim() || '(not given)',
                    email: form.email.value.trim() || '',
                    _subject: TIP_TYPES[currentType].title + ' — ' + (walkName || 'Dogs of Essex'),
                    _template: 'table',
                    _captcha: 'false'
                })
            }).then((r) => r.json()).then((d) => {
                if (d && (d.success === 'true' || d.success === true)) {
                    msg.textContent = 'Thanks! Your message has been sent — we really appreciate it.';
                    form.reset();
                    setTimeout(closeModal, 2400);
                } else {
                    msg.textContent = (d && d.message) ? d.message : 'Sorry, something went wrong. Please try again.';
                }
            }).catch(() => {
                msg.textContent = 'Sorry, something went wrong. Please try again.';
            }).finally(() => { btn.disabled = false; });
        });
    }

    // "View route" on a route card opens a popup with the full interactive map,
    // built on demand (one map at a time) from that route's GPX.
    function wireRoutes() {
        const triggers = document.querySelectorAll('.route-card-link[data-gpx]');
        if (!triggers.length) return;

        const pop = document.createElement('div');
        pop.className = 'route-popup';
        pop.setAttribute('aria-hidden', 'true');
        pop.innerHTML =
            '<div class="route-popup-inner">' +
            '<button class="route-popup-close" aria-label="Close map">×</button>' +
            '<h3 class="route-popup-title"></h3>' +
            '<div class="route-popup-map"></div>' +
            '<a class="route-popup-download btn btn-secondary" download>⬇ Download GPX route</a>' +
            '<p class="route-popup-apps">Works with GPX Viewer, Footpath, Komoot (import), OS Maps and other GPX apps.</p>' +
            '<button type="button" class="route-popup-help-toggle" aria-expanded="false">How do I use this?</button>' +
            '<div class="route-popup-help" hidden>' +
            '<ol>' +
            '<li>Tap <strong>Download GPX route</strong>.</li>' +
            '<li>Open the <strong>Files</strong> app.</li>' +
            '<li>Find the downloaded file.</li>' +
            '<li>Import it into your preferred walking app (GPX Viewer is the easiest free option).</li>' +
            '</ol>' +
            '</div>' +
            '<p class="route-popup-note">GPX routes are provided as a guide only. Please follow local signage and use your own judgement. See our <a href="/terms.html">Terms of Use</a>.</p>' +
            '</div>';
        document.body.appendChild(pop);

        // "How do I use this?" toggles the step-by-step import help.
        const helpToggle = pop.querySelector('.route-popup-help-toggle');
        const helpBox = pop.querySelector('.route-popup-help');
        if (helpToggle && helpBox) {
            helpToggle.addEventListener('click', () => {
                const open = helpBox.hidden;
                helpBox.hidden = !open;
                helpToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        }

        const mapEl = pop.querySelector('.route-popup-map');
        const titleEl = pop.querySelector('.route-popup-title');
        const dl = pop.querySelector('.route-popup-download');
        let map = null;

        const close = () => {
            pop.classList.remove('open');
            pop.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            if (map) { map.remove(); map = null; }
        };
        const open = (gpxUrl, name, bestPark) => {
            titleEl.textContent = name || 'Route';
            dl.setAttribute('href', gpxUrl);
            pop.classList.add('open');
            pop.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            if (map) { map.remove(); map = null; }
            mapEl.innerHTML = '';
            if (typeof L === 'undefined') return;
            map = buildRouteMap(mapEl, gpxUrl, bestPark);
            setTimeout(() => { if (map) { map.invalidateSize(); if (map._fitRoute) map._fitRoute(); } }, 60);
        };

        triggers.forEach((t) => t.addEventListener('click', () => open(t.dataset.gpx, t.dataset.name, t.dataset.bestpark)));

        // Live mini-map preview behind each route card, lazy-loaded as it scrolls
        // into view; clicking a preview opens the full map popup too.
        const previews = document.querySelectorAll('.route-card-map[data-gpx]');
        previews.forEach((el) => el.addEventListener('click', () => open(el.dataset.gpx, el.dataset.name, el.dataset.bestpark)));
        if (previews.length && typeof L !== 'undefined') {
            if ('IntersectionObserver' in window) {
                const io = new IntersectionObserver((entries, obs) => {
                    entries.forEach((en) => {
                        if (!en.isIntersecting) return;
                        obs.unobserve(en.target);
                        en.target.innerHTML = '';
                        buildPreviewMap(en.target, en.target.dataset.gpx);
                    });
                }, { rootMargin: '200px' });
                previews.forEach((el) => io.observe(el));
            } else {
                previews.forEach((el) => { el.innerHTML = ''; buildPreviewMap(el, el.dataset.gpx); });
            }
        }

        pop.querySelector('.route-popup-close').addEventListener('click', close);
        pop.addEventListener('click', (e) => { if (e.target === pop) close(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && pop.classList.contains('open')) close();
        });
    }

    // A small, non-interactive map for the card preview (tiles + route line).
    function buildPreviewMap(el, gpxUrl) {
        const map = L.map(el, {
            zoomControl: false, attributionControl: false, dragging: false,
            scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
            keyboard: false, touchZoom: false, tap: false,
            // Allow fractional zoom so fitBounds hugs the route tightly instead
            // of snapping to a whole zoom level and leaving slack around it.
            zoomSnap: 0
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        new L.GPX(gpxUrl, {
            async: true,
            marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null, wptIconUrls: {} },
            polyline_options: { color: '#1F5A44', weight: 4, opacity: 0.95 }
        }).on('loaded', (e) => {
            if (!map.getPane('routeCasing')) {
                map.createPane('routeCasing');
                map.getPane('routeCasing').style.zIndex = 350;
            }
            (function addCasing(layer) {
                if (layer instanceof L.Polyline && typeof layer.getLatLngs === 'function') {
                    L.polyline(layer.getLatLngs(), {
                        pane: 'routeCasing', color: '#fff', weight: 6, opacity: 0.95,
                        lineJoin: 'round', lineCap: 'round'
                    }).addTo(map);
                } else if (typeof layer.eachLayer === 'function') {
                    layer.eachLayer(addCasing);
                }
            })(e.target);
            map.fitBounds(e.target.getBounds(), { padding: [16, 16] });
        }).addTo(map);
        return map;
    }

    // Where a route retraces its own path (out-and-back sections), the line
    // would draw on top of itself and you couldn't tell which way to go. This
    // nudges the retraced points sideways, perpendicular to the direction of
    // travel — since the two passes head opposite ways, they split to opposite
    // sides and read as two parallel lines. Only overlapping points move, eased
    // in and out so the rest of the route stays exactly on the path.
    function separateOverlaps(latlngs, offsetM) {
        const n = latlngs.length;
        if (n < 6) return latlngs;
        let meanLat = 0;
        for (const p of latlngs) meanLat += p.lat;
        meanLat /= n;
        const mLat = 111320, mLng = 111320 * Math.cos(meanLat * Math.PI / 180);
        const xy = latlngs.map((p) => [p.lng * mLng, p.lat * mLat]);
        const TH = 7, GAP = 10; // metres apart, min index separation
        const ov = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (Math.abs(i - j) <= GAP) continue;
                const dx = xy[i][0] - xy[j][0], dy = xy[i][1] - xy[j][1];
                if (dx * dx + dy * dy < TH * TH) { ov[i] = 1; break; }
            }
        }
        // Smooth the on/off mask into a 0–1 ramp and anchor the endpoints at 0.
        const ramp = new Array(n).fill(0);
        const SMOOTH = 4;
        for (let i = 0; i < n; i++) {
            let s = 0, c = 0;
            for (let k = -SMOOTH; k <= SMOOTH; k++) {
                const idx = i + k;
                if (idx >= 0 && idx < n) { s += ov[idx]; c++; }
            }
            ramp[i] = s / c;
        }
        ramp[0] = 0; ramp[n - 1] = 0;
        if (!ramp.some((r) => r > 0.01)) return latlngs;
        return latlngs.map((p, i) => {
            if (ramp[i] <= 0.01) return p;
            const a = xy[Math.max(0, i - 1)], b = xy[Math.min(n - 1, i + 1)];
            let dx = b[0] - a[0], dy = b[1] - a[1];
            const len = Math.hypot(dx, dy) || 1;
            dx /= len; dy /= len;
            const m = offsetM * ramp[i];
            const nx = xy[i][0] + (-dy) * m, ny = xy[i][1] + dx * m;
            return L.latLng(ny / mLat, nx / mLng);
        });
    }

    function offsetRouteLatLngs(lls, offsetM) {
        if (Array.isArray(lls) && lls.length && Array.isArray(lls[0])) {
            return lls.map((sub) => offsetRouteLatLngs(sub, offsetM));
        }
        return separateOverlaps(lls, offsetM);
    }

    function buildRouteMap(el, gpxUrl, bestPark) {
        const map = L.map(el, { scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        const pin = (cls, content) => L.divIcon({
            className: 'gpx-pin',
            html: '<span class="gpx-pin-badge ' + cls + '">' + content + '</span>',
            iconSize: [0, 0], iconAnchor: [0, 0]
        });
        // Car park pins (those with coordinates), the route's best one highlighted.
        const P_SVG = '<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>';
        // Which car park to pin on the route map: the route's named best car park;
        // or, if none is named but the walk has exactly one car park, that single
        // one (it's the only option). Multiple car parks with no best named = none.
        const carParks = Array.isArray(window.WALK_CARPARKS) ? window.WALK_CARPARKS : [];
        const relevant = bestPark ? carParks.filter((cp) => cp.name === bestPark)
            : (carParks.length === 1 ? carParks : []);
        const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const cpMarkers = relevant.map((cp) => {
            const best = true; // the single P shown on a route map is always the highlighted one
            return L.marker([cp.lat, cp.lng], {
                icon: L.divIcon({
                    className: 'gpx-pin',
                    html: '<span class="gpx-pin-badge gpx-pin-carpark' + (best ? ' is-best' : '') + '" title="' + escHtml(cp.name) + '">' + P_SVG + '</span>',
                    iconSize: [0, 0], iconAnchor: [0, 0]
                }),
                zIndexOffset: best ? 1000 : 500
            }).addTo(map);
        });
        new L.GPX(gpxUrl, {
            async: true,
            polyline_options: { color: '#1F5A44', weight: 4, opacity: 0.95 },
            marker_options: {
                startIcon: pin('gpx-pin-start', 'Start'),
                endIcon: pin('gpx-pin-end', 'Finish'),
                wptIcons: { '': pin('gpx-pin-wpt', '📍'), 'Parking Area': pin('gpx-pin-parking', '🅿️') }
            }
        }).on('loaded', (e) => {
            if (!map.getPane('routeCasing')) {
                map.createPane('routeCasing');
                map.getPane('routeCasing').style.zIndex = 350;
            }
            (function addCasing(layer) {
                if (layer instanceof L.Polyline && typeof layer.getLatLngs === 'function') {
                    const lls = offsetRouteLatLngs(layer.getLatLngs(), 9);
                    layer.setLatLngs(lls); // redraw the coloured route on the offset path
                    L.polyline(lls, {
                        pane: 'routeCasing', color: '#fff', weight: 7, opacity: 0.95,
                        lineJoin: 'round', lineCap: 'round'
                    }).addTo(map);
                } else if (typeof layer.eachLayer === 'function') {
                    layer.eachLayer(addCasing);
                }
            })(e.target);
            let bounds = e.target.getBounds();
            // Widen the view to include the route's own car park pin (only ever the
            // best/single one), so it's always visible without zooming out to others.
            cpMarkers.forEach((m) => { bounds = bounds.extend(m.getLatLng()); });
            // Re-usable fit: the popup goes display:none -> flex, so the first fit
            // can run before the container has its real size and land zoomed out /
            // off-centre. invalidateSize() then re-fit centres tightly on the walk.
            map._fitRoute = () => map.fitBounds(bounds, { paddingTopLeft: [12, 56], paddingBottomRight: [12, 12] });
            map.invalidateSize();
            map._fitRoute();
            map.closePopup();
        }).addTo(map);
        return map;
    }

    // Rating explanations: click a row label to reveal its 1–5 scale beneath
    // the row; the "How are these ratings decided?" link toggles them all.
    function wireGlance() {
        const glance = document.getElementById('glance');
        if (!glance) return;
        const setOpen = (item, open) => {
            const exp = item.querySelector('.glance-explain');
            const btn = item.querySelector('.gl-toggle');
            if (!exp) return;
            if (open) exp.removeAttribute('hidden'); else exp.setAttribute('hidden', '');
            if (btn) btn.setAttribute('aria-expanded', String(open));
        };
        glance.querySelectorAll('.gl-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
                const item = btn.closest('.glance-item');
                setOpen(item, item.querySelector('.glance-explain').hasAttribute('hidden'));
            });
        });
        const allBtn = document.querySelector('.glance-explain-all');
        if (allBtn) {
            allBtn.addEventListener('click', () => {
                const show = !!glance.querySelector('.glance-explain[hidden]');
                glance.querySelectorAll('.glance-item').forEach((item) => setOpen(item, show));
                allBtn.setAttribute('aria-expanded', String(show));
                allBtn.textContent = show ? 'Hide rating explanations' : 'How are these ratings decided?';
            });
        }
    }

    // Click a gallery photo to open a full-screen carousel (prev/next, close,
    // backdrop click, Esc and arrow keys, swipe on touch).
    function wireLightbox() {
        const gallery = document.getElementById('gallery');
        if (!gallery) return;
        const imgs = Array.from(gallery.querySelectorAll('.g-item img'));
        if (!imgs.length) return;
        const slides = imgs.map((img) => ({ src: img.currentSrc || img.src, caption: img.alt || '' }));
        const many = slides.length > 1;

        const lb = document.createElement('div');
        lb.className = 'lightbox';
        lb.setAttribute('aria-hidden', 'true');
        lb.innerHTML =
            '<button class="lb-close" aria-label="Close photo">×</button>' +
            '<span class="lb-counter"></span>' +
            (many ? '<button class="lb-nav lb-prev" aria-label="Previous photo">‹</button>' : '') +
            '<figure class="lb-stage"><img class="lb-img" alt=""><figcaption class="lb-caption"></figcaption></figure>' +
            (many ? '<button class="lb-nav lb-next" aria-label="Next photo">›</button>' : '');
        document.body.appendChild(lb);

        const lbImg = lb.querySelector('.lb-img');
        const lbCap = lb.querySelector('.lb-caption');
        const lbCount = lb.querySelector('.lb-counter');
        let idx = 0;

        const show = (i) => {
            idx = (i + slides.length) % slides.length;
            const s = slides[idx];
            lbImg.src = s.src;
            lbImg.alt = s.caption;
            lbCap.textContent = s.caption;
            lbCap.style.display = s.caption ? '' : 'none';
            lbCount.textContent = many ? (idx + 1) + ' of ' + slides.length : '';
        };
        const open = (i) => {
            show(i);
            lb.classList.add('open');
            lb.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        };
        const close = () => {
            lb.classList.remove('open');
            lb.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        };

        imgs.forEach((img, i) => {
            img.style.cursor = 'zoom-in';
            img.addEventListener('click', () => open(i));
        });
        lb.querySelector('.lb-close').addEventListener('click', close);
        lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb-stage')) close(); });
        const prev = lb.querySelector('.lb-prev');
        const next = lb.querySelector('.lb-next');
        if (prev) prev.addEventListener('click', (e) => { e.stopPropagation(); show(idx - 1); });
        if (next) next.addEventListener('click', (e) => { e.stopPropagation(); show(idx + 1); });

        document.addEventListener('keydown', (e) => {
            if (!lb.classList.contains('open')) return;
            if (e.key === 'Escape') close();
            else if (many && e.key === 'ArrowLeft') show(idx - 1);
            else if (many && e.key === 'ArrowRight') show(idx + 1);
        });

        let sx = null;
        lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
        lb.addEventListener('touchend', (e) => {
            if (sx === null || !many) return;
            const dx = e.changedTouches[0].clientX - sx;
            if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
            sx = null;
        }, { passive: true });
    }

    function wireDayToggles() {
        document.querySelectorAll('.day-more-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.closest('.day-category');
                if (!cat) return;
                const open = cat.classList.toggle('expanded');
                btn.textContent = open ? 'Show less ↑' : 'Show more ↓';
            });
        });
    }

    function wireCarousel(root) {
        const track = root.querySelector('.carousel-track');
        const prev = root.querySelector('.prev');
        const next = root.querySelector('.next');
        if (!track || !prev || !next) return;
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

    function wireActions() {
        // The "Save" button (#save-walk) is wired site-wide by script.js via the
        // shared .js-save-btn / DoeSaves handler, so it's not handled here.
        const emailBtn = document.getElementById('email-walk');
        const shareBtn = document.getElementById('share-walk');

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
                    const label = shareBtn.querySelector('.action-label') || shareBtn;
                    const old = label.textContent;
                    label.textContent = 'Link copied';
                    setTimeout(() => { label.textContent = old; }, 1800);
                }
            });
        }
    }
})();
