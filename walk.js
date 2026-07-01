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
    });

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
        const openInMaps = (cp) => window.open('https://www.google.com/maps/search/?api=1&query=' + cp.lat + ',' + cp.lng, '_blank', 'noopener');
        const latlngs = [];
        const markers = [];
        carParks.forEach((cp, i) => {
            const m = L.marker([cp.lat, cp.lng], {
                icon: L.divIcon({
                    className: 'cp-pin' + (cp.recommended ? ' cp-pin--rec' : ''),
                    html: '<span class="cp-pin-inner">' + (i + 1) + '</span>',
                    iconSize: [30, 30], iconAnchor: [15, 15]
                }),
                title: cp.name,
                riseOnHover: true,
                zIndexOffset: cp.recommended ? 1000 : 0
            }).addTo(map);
            m.bindTooltip(cp.name, { direction: 'top', offset: [0, -14], opacity: 1 });
            // Click a marker to open that car park in Google Maps.
            m.on('click', () => openInMaps(cp));
            markers.push(m);
            latlngs.push([cp.lat, cp.lng]);
        });
        if (latlngs.length === 1) map.setView(latlngs[0], 15);
        else map.fitBounds(latlngs, { padding: [45, 45] });
        setTimeout(() => map.invalidateSize(), 60);

        // Link cards and markers: hovering one highlights the other, clicking
        // either opens that car park in Google Maps.
        const cardByName = {};
        document.querySelectorAll('.cp-card[data-cp-name]').forEach((card) => {
            cardByName[card.getAttribute('data-cp-name')] = card;
        });
        const setActive = (i, on) => {
            const m = markers[i];
            const card = cardByName[carParks[i].name];
            if (m && m._icon) m._icon.classList.toggle('cp-pin--active', on);
            if (m) m.setZIndexOffset(on ? 2000 : (carParks[i].recommended ? 1000 : 0));
            if (card) card.classList.toggle('is-active', on);
            if (on && m) map.panInside(m.getLatLng(), { padding: [50, 50] });
        };
        carParks.forEach((cp, i) => {
            const card = cardByName[cp.name];
            if (card) {
                card.addEventListener('mouseenter', () => setActive(i, true));
                card.addEventListener('mouseleave', () => setActive(i, false));
                card.addEventListener('click', () => openInMaps(cp));
            }
            const m = markers[i];
            if (m) {
                m.on('mouseover', () => setActive(i, true));
                m.on('mouseout', () => setActive(i, false));
            }
        });
    }

    // --- Help improve this walk ---
    // Four contribution types, each opening the same form pre-set to that type.
    // Submissions are emailed via FormSubmit (formsubmit.co); approved walking
    // tips are then added manually to data/tips.json and baked in on rebuild.
    const FORMSUBMIT_ENDPOINT = 'https://formsubmit.co/ajax/tips@dogsofessex.co.uk';
    const TIP_TYPES = {
        'walkingTip': { title: 'Submit a tip', label: 'Your tip', placeholder: 'e.g. The back field gets muddy after rain.' },
        'newWalkSuggestion': { title: 'Suggest a new walk', label: 'Tell us about the walk', placeholder: 'Where is it, and what makes it good for dogs?' },
        'newPlaceSuggestion': { title: 'Recommend a nearby place', label: 'Which place, and why?', placeholder: 'Name of the café, pub or restaurant — and what makes it dog-friendly.' },
        'report': { title: 'Report an issue', label: 'What needs fixing?', placeholder: 'Tell us what looks wrong or out of date.' }
    };

    function wireImprove() {
        const section = document.getElementById('improve');
        if (!section) return;
        const walkName = section.dataset.walk || '';
        const walkId = section.dataset.walkid || '';

        const modal = document.createElement('div');
        modal.className = 'tip-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML =
            '<div class="tip-modal-inner">' +
            '<button class="tip-modal-close" type="button" aria-label="Close">×</button>' +
            '<h3 class="tip-modal-title">Share a tip</h3>' +
            '<form class="tip-form">' +
            '<label><span class="tip-field-label">Your tip</span><textarea name="tip" rows="4" required maxlength="1000"></textarea></label>' +
            '<label>Name <span class="opt">(optional)</span><input name="name" type="text" maxlength="80" placeholder="Sarah & Luna"></label>' +
            '<label>Email <span class="opt">(optional, never shown)</span><input name="email" type="email" maxlength="120"></label>' +
            '<button type="submit" class="btn btn-primary tip-submit">Submit</button>' +
            '<p class="tip-form-msg" role="status"></p>' +
            '</form></div>';
        document.body.appendChild(modal);

        const form = modal.querySelector('.tip-form');
        const msg = modal.querySelector('.tip-form-msg');
        const titleEl = modal.querySelector('.tip-modal-title');
        const fieldLabel = modal.querySelector('.tip-field-label');
        const textarea = form.querySelector('textarea');
        let currentType = 'walkingTip';

        const closeModal = () => { modal.classList.remove('open'); document.body.style.overflow = ''; };
        const openModal = (type) => {
            currentType = TIP_TYPES[type] ? type : 'walkingTip';
            const cfg = TIP_TYPES[currentType];
            titleEl.textContent = cfg.title;
            fieldLabel.textContent = cfg.label;
            textarea.placeholder = cfg.placeholder;
            msg.textContent = ''; form.reset();
            modal.classList.add('open'); document.body.style.overflow = 'hidden';
            textarea.focus();
        };

        // Includes the "Share a tip" button up in the Community tips section.
        document.querySelectorAll('.improve-btn').forEach((btn) => {
            btn.addEventListener('click', () => openModal(btn.dataset.tiptype));
        });
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
            '<a class="route-popup-download btn btn-secondary" download>⬇ Download GPX</a>' +
            '</div>';
        document.body.appendChild(pop);

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
            setTimeout(() => { if (map) map.invalidateSize(); }, 60);
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
        // Show the car park relevant to this route (its "best car park"); if the
        // route names none, show all the walk's car parks that have coordinates.
        const carParks = Array.isArray(window.WALK_CARPARKS) ? window.WALK_CARPARKS : [];
        const relevant = bestPark ? carParks.filter((cp) => cp.name === bestPark) : carParks;
        const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const cpMarkers = relevant.map((cp) => {
            const best = bestPark && cp.name === bestPark;
            const words = String(cp.name).split(/\s+/).map((w) => '<span>' + escHtml(w) + '</span>').join('');
            return L.marker([cp.lat, cp.lng], {
                icon: L.divIcon({
                    className: 'gpx-pin',
                    html: '<span class="gpx-pin-badge gpx-pin-carpark' + (best ? ' is-best' : '') + '">' + P_SVG + '<span class="cp-name">' + words + '</span></span>',
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
            // Only widen the view to reach the route's own (best) car park, so an
            // unrelated distant car park can't zoom the whole map out.
            if (bestPark) cpMarkers.forEach((m) => { bounds = bounds.extend(m.getLatLng()); });
            map.fitBounds(bounds, { paddingTopLeft: [12, 56], paddingBottomRight: [12, 12] });
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
        const WALK_ID = window.WALK_ID;
        const saveBtn = document.getElementById('save-walk');
        const emailBtn = document.getElementById('email-walk');
        const shareBtn = document.getElementById('share-walk');
        const KEY = 'doe_saved_walks';
        const read = () => {
            try { return JSON.parse(localStorage.getItem(KEY)) || []; }
            catch (e) { return []; }
        };

        if (saveBtn && WALK_ID) {
            const sync = () => {
                const saved = read().includes(WALK_ID);
                saveBtn.classList.toggle('is-saved', saved);
                const label = saveBtn.querySelector('.action-label');
                if (label) label.textContent = saved ? 'Saved' : 'Save';
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
                    const label = shareBtn.querySelector('.action-label') || shareBtn;
                    const old = label.textContent;
                    label.textContent = 'Link copied';
                    setTimeout(() => { label.textContent = old; }, 1800);
                }
            });
        }
    }
})();
