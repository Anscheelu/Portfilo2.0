const projects = document.querySelectorAll('.project');
const header = document.querySelector('header');
const detailOverlay = document.getElementById('detail-overlay');
const detailDesc = document.getElementById('detail-desc');
const detailDescText = document.getElementById('detail-desc-text');
const infoBox = document.getElementById('info-box');
const infoBtn = document.getElementById('info-btn');

document.body.style.overflow = 'hidden';
document.body.style.height = '100vh';

const sortedByYear = Array.from(projects).sort((a, b) => parseInt(b.dataset.year) - parseInt(a.dataset.year));
sortedByYear.forEach((p, i) => {
    const num = document.createElement('span');
    num.className = 'project-number';
    num.textContent = String(i + 1).padStart(2, '0');
    p.appendChild(num);
});

const CYCLE = 4000;
let scrollAccum = 0;
let detailActive = false;

let currentImg = 0;
let totalImgs = 0;
let currentProjectIndex = -1;
let detailWheelAccum = 0;
let detailWheelCooldown = false;

let homeDragActive = false;
let homeDragLastX = 0, homeDragLastY = 0;
let homeDragMoved = false;
let detailDragActive = false;
let detailDragStartY = 0, detailDragCurrentY = 0;
let detailDragMoved = false;
let timelineDragging = false;
let touchHomepageLastY = 0;
let homepageVelocity = 0;
let homepageMomentumRaf = null;

let activeDragEl = null;
let dragX = 0, dragY = 0;

function startDragging(e, el, closeBtnId) {
    if (e.target.id === closeBtnId || e.target.closest('#' + closeBtnId)) return;
    activeDragEl = el;
    dragX = e.clientX - el.offsetLeft;
    dragY = e.clientY - el.offsetTop;
    el.style.cursor = 'grabbing';
}

infoBox.addEventListener('mousedown', (e) => startDragging(e, infoBox, 'info-close'));
detailDesc.addEventListener('mousedown', (e) => startDragging(e, detailDesc, 'detail-desc-close'));

window.addEventListener('mousemove', (e) => {
    if (detailDragActive) {
        detailDragCurrentY = e.clientY;
        if (Math.abs(detailDragCurrentY - detailDragStartY) > 5) detailDragMoved = true;
    }
    if (homeDragActive) {
        const dx = e.clientX - homeDragLastX;
        const dy = e.clientY - homeDragLastY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) homeDragMoved = true;
        homeDragLastX = e.clientX;
        homeDragLastY = e.clientY;
        scrollAccum = ((scrollAccum - (dx + dy) * 0.5) % CYCLE + CYCLE) % CYCLE;
        updatePositions();
    }
    if (!activeDragEl) return;
    activeDragEl.style.right = 'auto';
    activeDragEl.style.left = (e.clientX - dragX) + 'px';
    activeDragEl.style.top = (e.clientY - dragY) + 'px';
});

window.addEventListener('mouseup', () => {
    if (detailDragActive) {
        const dy = detailDragStartY - detailDragCurrentY;
        if (detailDragMoved && Math.abs(dy) > 40) {
            const next = Math.max(0, Math.min(totalImgs - 1, currentImg + (dy > 0 ? 1 : -1)));
            scrollToImage(next);
        } else if (detailDragMoved) {
            scrollToImage(currentImg);
        }
        detailDragActive = false;
        detailDragMoved = false;
    }
    if (homeDragActive) {
        homeDragActive = false;
        document.getElementById('projects').style.cursor = '';
    }
    if (activeDragEl) {
        activeDragEl.style.cursor = 'grab';
        activeDragEl = null;
    }
});

const loopConfig = [{x:1,y:-1},{x:-1,y:1},{x:2,y:1},{x:-1,y:-2},{x:1,y:2},{x:-2,y:-1},{x:2,y:-1},{x:-1,y:2}];
const state = Array.from(projects).map((el, i) => {
    const rect = el.getBoundingClientRect();
    return { el, initX: rect.left, initY: rect.top, w: rect.width, h: rect.height, cfg: loopConfig[i % loopConfig.length] };
});

function updatePositions() {
    const vw = window.innerWidth, vh = window.innerHeight;
    state.forEach(p => {
        const wW = vw + p.w, wH = vh + p.h;
        const rX = p.cfg.x * wW / CYCLE, rY = p.cfg.y * wH / CYCLE;
        const vX = ((p.initX + scrollAccum * rX + p.w) % wW + wW) % wW - p.w;
        const vY = ((p.initY + scrollAccum * rY + p.h) % wH + wH) % wH - p.h;
        p.el.style.transform = `translate(${vX - p.initX}px, ${vY - p.initY}px)`;
    });
}

function animateScrollTo(targetScroll) {
    const start = scrollAccum;
    let d = targetScroll - start;
    if (d > CYCLE / 2) d -= CYCLE;
    if (d < -CYCLE / 2) d += CYCLE;
    const startTime = performance.now();
    function animate(now) {
        const t = Math.min((now - startTime) / 800, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        scrollAccum = ((start + d * ease) % CYCLE + CYCLE) % CYCLE;
        updatePositions();
        if (t < 1 && !detailActive) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}

function findBestScroll(activeFilters) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const matching = state.filter(p => activeFilters.includes(p.el.dataset.category));
    if (matching.length === 0) return scrollAccum;

    let bestScroll = scrollAccum;
    let bestScore = -Infinity;

    for (let s = 0; s < CYCLE; s++) {
        let minVis = Infinity;
        for (const p of matching) {
            const wW = vw + p.w, wH = vh + p.h;
            const rX = p.cfg.x * wW / CYCLE, rY = p.cfg.y * wH / CYCLE;
            const vX = ((p.initX + s * rX + p.w) % wW + wW) % wW - p.w;
            const vY = ((p.initY + s * rY + p.h) % wH + wH) % wH - p.h;
            const overlapX = Math.max(0, Math.min(vX + p.w, vw) - Math.max(vX, 0));
            const overlapY = Math.max(0, Math.min(vY + p.h, vh) - Math.max(vY, 0));
            minVis = Math.min(minVis, (overlapX / p.w) * (overlapY / p.h));
        }
        if (minVis > bestScore) { bestScore = minVis; bestScroll = s; }
    }
    return bestScroll;
}

function centerOffsetForItem(item) {
    const imgCont = document.getElementById('detail-images');
    if (!imgCont || !item) return 0;
    return imgCont.offsetHeight / 2 - item.offsetTop - item.offsetHeight / 2;
}

function scrollToImage(idx, instant) {
    currentImg = idx;
    const track = document.querySelector('.detail-img-track');
    if (!track) return;
    const items = track.querySelectorAll('.detail-img-item');
    const item = items[idx];
    if (!item) return;
    const ty = centerOffsetForItem(item);
    track.style.transition = instant ? 'none' : 'transform 0.55s cubic-bezier(0.25, 0.1, 0.25, 1)';
    track.style.transform = `translateY(${ty}px)`;
    items.forEach((it, i) => {
        it.style.filter = i === idx ? 'none' : 'blur(4px)';
    });
    updateSidebarPosition(idx);
}

function updateSidebarPosition(idx) {
    const sidebar = document.getElementById('detail-sidebar');
    if (!sidebar) return;
    const vh = window.innerHeight;
    const track = document.querySelector('.detail-img-track');
    if (!track) return;
    const targetIdx = idx !== undefined ? idx : currentImg;
    const item = track.querySelectorAll('.detail-img-item')[targetIdx];
    if (!item) return;

    const allMedia = [...item.querySelectorAll('img, video')];
    if (!allMedia.length) return;

    const first = allMedia[0];
    if (first.offsetWidth === 0) {
        const evt = first.tagName === 'VIDEO' ? 'loadedmetadata' : 'load';
        first.addEventListener(evt, () => updateSidebarPosition(targetIdx), { once: true });
        return;
    }

    // Use the right edge of the rightmost media element (handles single and multi-media rows)
    const rightEdge = Math.max(...allMedia.map(m => m.getBoundingClientRect().right));
    const maxH = Math.max(...allMedia.map(m => m.offsetHeight));

    sidebar.style.left = (rightEdge + 20) + 'px';
    sidebar.style.bottom = ((vh - maxH) / 2) + 'px';
}

function openDetail(index) {
    if (homepageMomentumRaf) { cancelAnimationFrame(homepageMomentumRaf); homepageMomentumRaf = null; }
    document.body.style.overflow = 'hidden';
    infoBox.classList.add('behind-detail');

    const proj = projects[index];
    currentProjectIndex = index;
    const images = proj.dataset.images.match(/\[[^\]]+\]|[^,]+/g).map(s => s.trim());

    totalImgs = images.length;
    currentImg = 0;

    const vw = window.innerWidth;
    const isMobile = vw < 800;

    const detailContent = document.getElementById('detail-content');
    detailContent.innerHTML = '';

    const imgCont = document.createElement('div');
    imgCont.id = 'detail-images';

    const existingSidebar = document.getElementById('detail-sidebar');
    if (existingSidebar) existingSidebar.remove();

    detailContent.appendChild(imgCont);

    let sideB = null;
    if (!isMobile) {
        sideB = document.createElement('div');
        sideB.id = 'detail-sidebar';
        sideB.innerHTML = `<h1>${proj.dataset.title}</h1><div class="detail-row"><h1>${proj.dataset.cat}</h1><h1>${proj.dataset.year}</h1></div><div class="detail-spacer"></div><h1 class="detail-show-desc">SHOW MORE</h1>`;
        document.body.appendChild(sideB);
        sideB.classList.add('hidden');
    } else {
        const mobileInfo = document.getElementById('detail-mobile-info');
        mobileInfo.innerHTML = `
            <div class="mobile-info-row1">
                <h1 class="mobile-info-title">${proj.dataset.title}</h1>
                <h1 class="detail-close-mobile close-btn">x</h1>
            </div>
            <div class="mobile-info-row2">
                <h1>${proj.dataset.cat}</h1>
                <h1>${proj.dataset.year}</h1>
            </div>
            <div class="detail-spacer"></div>
            <h1 class="detail-show-desc">SHOW MORE</h1>
        `;
        mobileInfo.classList.add('visible');
    }

    const imgMaxWidth = isMobile ? (vw - 40) : Math.floor(vw * 0.6);

    const track = document.createElement('div');
    track.className = 'detail-img-track';

    const buildMediaEl = (rawSrc, maxW) => {
        const raw = rawSrc.trim();
        const hasControls = raw.endsWith(':controls');
        const s = raw.replace(/:controls$/, '');
        const isV = s.match(/\.(mp4|webm|mov)$/i);
        const el = document.createElement(isV ? 'video' : 'img');
        el.src = s;
        el.style.maxWidth = maxW + 'px';

        if (isV) {
            el.loop = true;
            el.playsInline = true;
            el.muted = !hasControls;
            if (!hasControls) el.autoplay = true;
            if (hasControls) {
                const vid = /** @type {HTMLVideoElement} */ (el);
                const wrapper = document.createElement('div');
                wrapper.className = 'video-wrapper';
                const c = document.createElement('div');
                c.className = 'detail-video-controls';
                c.innerHTML = `<h1 class="vid-play-btn">PLAY</h1><h1 class="vid-mute-btn">MUTE</h1>`;
                const tl = document.createElement('div');
                tl.className = 'video-timeline';
                const fill = document.createElement('div');
                fill.className = 'video-timeline-fill';
                tl.appendChild(fill);
                const pB = c.querySelector('.vid-play-btn');
                const mB = c.querySelector('.vid-mute-btn');
                pB.onclick = (e) => { e.stopPropagation(); vid.paused ? vid.play() : vid.pause(); pB.textContent = vid.paused ? 'PLAY' : 'PAUSE'; };
                mB.onclick = (e) => { e.stopPropagation(); vid.muted = !vid.muted; mB.textContent = vid.muted ? 'UNMUTE' : 'MUTE'; };
                vid.addEventListener('timeupdate', () => { if (vid.duration) fill.style.width = (vid.currentTime / vid.duration * 100) + '%'; });

                const seek = (clientX) => {
                    const r = tl.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
                    if (vid.duration) {
                        vid.currentTime = ratio * vid.duration;
                        fill.style.width = (ratio * 100) + '%';
                    }
                };
                let tlDrag = false;
                tl.addEventListener('mousedown', (e) => { e.stopPropagation(); tlDrag = true; tl.classList.add('dragging'); seek(e.clientX); });
                tl.addEventListener('touchstart', (e) => { e.stopPropagation(); tlDrag = true; timelineDragging = true; tl.classList.add('dragging'); seek(e.touches[0].clientX); }, { passive: true });
                window.addEventListener('mousemove', (e) => { if (tlDrag) seek(e.clientX); });
                window.addEventListener('touchmove', (e) => { if (tlDrag) seek(e.touches[0].clientX); }, { passive: true });
                window.addEventListener('mouseup', () => { if (tlDrag) { tlDrag = false; tl.classList.remove('dragging'); } }, { passive: true });
                window.addEventListener('touchend', () => { if (tlDrag) { tlDrag = false; timelineDragging = false; tl.classList.remove('dragging'); } }, { passive: true });
                wrapper.append(vid, tl, c);
                return wrapper;
            }
        }
        return el;
    };

    images.forEach(src => {
        const div = document.createElement('div');
        div.className = 'detail-img-item';

        if (src.startsWith('[') && src.endsWith(']')) {
            const srcs = src.slice(1, -1).split('|');
            const perItemMaxW = Math.floor(imgMaxWidth / srcs.length);
            div.style.gap = '16px';
            srcs.forEach(rawSrc => {
                div.appendChild(buildMediaEl(rawSrc, perItemMaxW));
            });
        } else {
            div.appendChild(buildMediaEl(src, imgMaxWidth));
        }

        track.appendChild(div);
    });

    imgCont.appendChild(track);

    detailOverlay.classList.add('active');
    if (isMobile) {
        document.querySelector('.header-main').classList.add('detail-blurred');
        header.classList.add('detail-mobile-open');
        document.querySelector('footer')?.classList.add('detail-blurred');
    } else {
        header.classList.add('detail-blurred');
    }
    detailActive = true;

    const firstItem = track.querySelector('.detail-img-item');
    const firstMedia = firstItem?.querySelector('img, video');

    function startOpenAnimation() {
        track.querySelectorAll('.detail-img-item').forEach((it, i) => {
            it.style.filter = i === 0 ? 'none' : 'blur(4px)';
        });

        // Center item 0 immediately (no animation yet)
        scrollToImage(0, true);

        track.style.opacity = '0';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            track.style.transition = 'opacity 0.3s ease, transform 0.55s cubic-bezier(0.25, 0.1, 0.25, 1)';
            track.style.opacity = '1';
            if (sideB) {
                track.addEventListener('transitionend', () => {
                    updateSidebarPosition(0);
                    sideB.classList.remove('hidden');
                    setTimeout(() => {
                        sideB.style.transition = 'left 0.5s cubic-bezier(0.25,0.1,0.25,1),bottom 0.5s cubic-bezier(0.25,0.1,0.25,1),opacity 0.3s';
                    }, 50);
                }, { once: true });
            }
        }));
    }

    if (firstMedia) {
        const isLoaded = firstMedia.tagName === 'IMG' ? firstMedia.complete && firstMedia.naturalHeight > 0
                                                       : firstMedia.readyState >= 1;
        if (isLoaded) {
            setTimeout(startOpenAnimation, 20);
        } else {
            const evt = firstMedia.tagName === 'VIDEO' ? 'loadedmetadata' : 'load';
            firstMedia.addEventListener(evt, () => setTimeout(startOpenAnimation, 20), { once: true });
            setTimeout(startOpenAnimation, 300);
        }
    } else {
        setTimeout(startOpenAnimation, 50);
    }
}

let gridMode = false;
const iconBtn = document.getElementById('icon-btn');
const iconImg = document.getElementById('icon-img');

function enterGridMode() {
    gridMode = true;
    const main = document.getElementById('projects');
    const sorted = Array.from(projects).sort((a, b) => parseInt(b.dataset.year) - parseInt(a.dataset.year));
    sorted.forEach((p, i) => { p.style.order = i; });
    Array.from(projects).forEach(p => { p.style.transform = 'none'; });
    main.classList.add('grid-mode');
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
}

function exitGridMode() {
    gridMode = false;
    const main = document.getElementById('projects');
    main.classList.remove('grid-mode');
    Array.from(projects).forEach(p => { p.style.order = ''; });
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    window.scrollTo(0, 0);
    updatePositions();
}

document.getElementById('projects').addEventListener('mousedown', (e) => {
    if (detailActive || gridMode) return;
    if (e.button !== 0) return;
    homeDragActive = true;
    homeDragMoved = false;
    homeDragLastX = e.clientX;
    homeDragLastY = e.clientY;
    document.getElementById('projects').style.cursor = 'grabbing';
});

detailOverlay.addEventListener('mousedown', (e) => {
    if (!detailActive) return;
    if (e.target.closest('#detail-desc') || e.target.closest('#detail-sidebar') || e.target.closest('#detail-mobile-info') || e.target.closest('.detail-video-controls') || e.target.classList.contains('video-timeline')) return;
    detailDragActive = true;
    detailDragMoved = false;
    detailDragStartY = e.clientY;
    detailDragCurrentY = e.clientY;
    e.preventDefault();
});

iconBtn.addEventListener('click', () => {
    if (gridMode) {
        exitGridMode();
        iconImg.src = 'assets/icons/sorted.avif';
    } else {
        enterGridMode();
        iconImg.src = 'assets/icons/messy.avif';
    }
});

infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    infoBox.classList.toggle('visible');
});

document.getElementById('info-close').onclick = () => infoBox.classList.remove('visible');

window.addEventListener('wheel', (e) => {
    if (detailActive) {
        e.preventDefault();
        if (detailWheelCooldown) return;
        detailWheelAccum += e.deltaY;
        if (Math.abs(detailWheelAccum) > 50) {
            const dir = detailWheelAccum > 0 ? 1 : -1;
            const next = Math.max(0, Math.min(totalImgs - 1, currentImg + dir));
            detailWheelAccum = 0;
            detailWheelCooldown = true;
            setTimeout(() => { detailWheelCooldown = false; }, 750);
            if (next !== currentImg) scrollToImage(next);
        }
    } else if (!gridMode) {
        e.preventDefault();
        scrollAccum = ((scrollAccum + e.deltaY) % CYCLE + CYCLE) % CYCLE;
        updatePositions();
    }
}, { passive: false });

window.addEventListener('touchstart', (e) => {
    touchHomepageLastY = e.touches[0].clientY;
    if (!detailActive) {
        homepageVelocity = 0;
        if (homepageMomentumRaf) cancelAnimationFrame(homepageMomentumRaf);
    }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (timelineDragging) return;
    if (detailActive) {
        // allow default (don't preventDefault) so video controls still work
        return;
    }
    if (!gridMode) {
        e.preventDefault();
        const currentY = e.touches[0].clientY;
        const dy = touchHomepageLastY - currentY;
        homepageVelocity = dy;
        touchHomepageLastY = currentY;
        scrollAccum = ((scrollAccum + dy) % CYCLE + CYCLE) % CYCLE;
        updatePositions();
    }
}, { passive: false });

window.addEventListener('touchend', (e) => {
    if (detailActive) {
        const dy = touchHomepageLastY - (e.changedTouches[0]?.clientY ?? touchHomepageLastY);
        if (Math.abs(dy) > 40) {
            const dir = dy > 0 ? 1 : -1;
            const next = Math.max(0, Math.min(totalImgs - 1, currentImg + dir));
            if (next !== currentImg) scrollToImage(next);
        }
        return;
    }
    if (!gridMode) {
        (function runMomentum() {
            if (Math.abs(homepageVelocity) < 0.5) return;
            scrollAccum = ((scrollAccum + homepageVelocity) % CYCLE + CYCLE) % CYCLE;
            updatePositions();
            homepageVelocity *= 0.97;
            homepageMomentumRaf = requestAnimationFrame(runMomentum);
        })();
    }
});

function closeDetail() {
    infoBox.classList.remove('behind-detail');
    detailOverlay.classList.remove('active');
    header.classList.remove('detail-blurred');
    header.classList.remove('detail-mobile-open');
    document.querySelector('.header-main').classList.remove('detail-blurred');
    document.querySelector('footer')?.classList.remove('detail-blurred');
    detailDesc.classList.remove('visible');
    document.getElementById('detail-mobile-info').classList.remove('visible');
    detailActive = false;
    document.body.style.overflow = gridMode ? 'auto' : 'hidden';
    document.querySelectorAll('video').forEach(v => v.pause());
    const sidebar = document.getElementById('detail-sidebar');
    if (sidebar) sidebar.remove();
}

projects.forEach((p, i) => p.onclick = () => !detailActive && !homeDragMoved && openDetail(i));
document.getElementById('detail-close').onclick = closeDetail;
detailOverlay.onclick = (e) => { if (e.target === detailOverlay) closeDetail(); };

document.getElementById('home').onclick = () => {
    if (detailActive) closeDetail();
    else if (gridMode) window.scrollTo({ top: 0, behavior: 'smooth' });
    else animateScrollTo(0);
};

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('detail-close-mobile')) {
        closeDetail();
        return;
    }
    if (e.target.classList.contains('detail-show-desc')) {
        const btn = e.target;
        const proj = projects[currentProjectIndex];
        detailDescText.innerHTML = proj.dataset.description;
        document.getElementById('detail-desc-title').textContent = proj.dataset.title;
        const meta = document.getElementById('detail-desc-meta');
        meta.innerHTML = `<h1>Tutor: ${proj.dataset.mentoring}</h1><h1>Team: ${proj.dataset.team}</h1><h1>Duration: ${proj.dataset.duration}</h1>`;
        if (proj.dataset.link) {
            const a = document.createElement('a');
            a.href = proj.dataset.link;
            a.target = '_blank';
            a.rel = 'noopener';
            const h = document.createElement('h1');
            h.textContent = 'Tool';
            a.appendChild(h);
            meta.appendChild(a);
        }
        const isOpen = detailDesc.classList.contains('visible');
        if (!isOpen) {
            if (window.innerWidth < 800) {
                const btnRect = btn.getBoundingClientRect();
                detailDesc.style.top = (btnRect.bottom + 8) + 'px';
                detailDesc.style.left = '20px';
                detailDesc.style.right = '20px';
                detailDesc.style.width = 'auto';
            } else {
                const imgCont = document.getElementById('detail-images');
                const rect = imgCont.getBoundingClientRect();
                detailDesc.style.top = (rect.top + 100) + 'px';
                detailDesc.style.left = '20px';
                detailDesc.style.right = 'auto';
                detailDesc.style.width = '480px';
            }
            detailDesc.classList.add('visible');
            header.classList.add('desc-open');
            btn.textContent = 'SHOW LESS';
        } else {
            detailDesc.classList.remove('visible');
            header.classList.remove('desc-open');
            btn.textContent = 'SHOW MORE';
        }
    }
});

document.getElementById('detail-desc-close').onclick = () => {
    detailDesc.classList.remove('visible');
    const btn = document.querySelector('.detail-show-desc');
    if (btn) btn.textContent = 'SHOW MORE';
};

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
        const filter = btn.dataset.filter;
        const isNowActive = !btn.classList.contains('active');
        document.querySelectorAll(`.filter-btn[data-filter="${filter}"]`).forEach(b => {
            b.classList.toggle('active', isNowActive);
        });
        const activeF = [...new Set(Array.from(document.querySelectorAll('.filter-btn.active')).map(b => b.dataset.filter))];
        projects.forEach(p => {
            if (activeF.length === 0 || activeF.includes(p.dataset.category)) p.classList.remove('blurred');
            else p.classList.add('blurred');
        });
        if (activeF.length > 0) animateScrollTo(findBestScroll(activeF));
    };
});

let resizeTimer;
window.addEventListener('resize', () => {
    if (!detailActive) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const vw = window.innerWidth;
        const isMobile = vw < 800;
        const imgMaxWidth = isMobile ? (vw - 40) : Math.floor(vw * 0.6);

        const track = document.querySelector('.detail-img-track');
        if (track) {
            track.querySelectorAll('.detail-img-item').forEach(item => {
                const media = item.querySelector('img, video');
                if (media) media.style.maxWidth = imgMaxWidth + 'px';
            });
            scrollToImage(currentImg, true);
        }

        requestAnimationFrame(() => updateSidebarPosition());
    }, 150);
});

updatePositions();
