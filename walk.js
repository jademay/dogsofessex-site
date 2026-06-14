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
    });

    function wireDayToggles() {
        document.querySelectorAll('.day-more-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cat = btn.closest('.day-category');
                if (!cat) return;
                const open = cat.classList.toggle('expanded');
                const noun = btn.dataset.noun || 'places';
                btn.textContent = open ? `Show fewer ${noun}` : `View all nearby ${noun} →`;
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
