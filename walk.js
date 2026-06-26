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
    });

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
            lbCount.textContent = many ? (idx + 1) + ' / ' + slides.length : '';
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
    }
})();
