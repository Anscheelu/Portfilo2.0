// ── Scramble utilities ───────────────────────────────────────────────────────

function permuteWord(word) {
    const chars = [...word];
    const idxs = chars.map((c, i) => /\p{L}/u.test(c) ? i : -1).filter(i => i !== -1);
    const letters = idxs.map(i => chars[i]);
    for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    idxs.forEach((idx, i) => { chars[idx] = letters[i]; });
    return chars.join('');
}

function permuteText(text) {
    return text.split(/(\s+)/).map(part => /^\s+$/.test(part) ? part : permuteWord(part)).join('');
}

function attachScramble(el) {
    const textNodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let seenColon = false;
    let n;
    while (n = walker.nextNode()) {
        const text = n.textContent;
        const colonIdx = !seenColon ? text.indexOf(':') : -1;
        if (colonIdx !== -1) {
            seenColon = true;
            textNodes.push({ node: n, original: text, scrambleFrom: colonIdx + 2 });
        } else {
            textNodes.push({ node: n, original: text, scrambleFrom: seenColon ? 0 : text.length });
        }
    }
    // No colon found → scramble everything (e.g. "<<< Zurück")
    if (!seenColon) textNodes.forEach(t => { t.scrambleFrom = 0; });
    if (!textNodes.length) return null;

    // Sequential reveal: left-to-right across all text nodes together
    const totalSuffixLen = textNodes.reduce((sum, { original, scrambleFrom }) =>
        sum + original.slice(scrambleFrom).length, 0);

    const DURATION = 900; // ms — same for every element regardless of text length
    let raf, startTime = null;

    function scramble() {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / DURATION, 1);
        const globalReveal = Math.floor(progress * totalSuffixLen);

        let charsSoFar = 0;
        textNodes.forEach(({ node, original, scrambleFrom }) => {
            const prefix = original.slice(0, scrambleFrom);
            const suffix = original.slice(scrambleFrom);
            const reveal = Math.max(0, Math.min(suffix.length, globalReveal - charsSoFar));
            node.textContent = prefix + suffix.slice(0, reveal) + permuteText(suffix.slice(reveal));
            charsSoFar += suffix.length;
        });

        if (progress < 1) raf = requestAnimationFrame(scramble);
    }

    function restore() {
        cancelAnimationFrame(raf);
        startTime = null;
        textNodes.forEach(({ node, original }) => { node.textContent = original; });
    }

    return {
        scramble() { cancelAnimationFrame(raf); startTime = performance.now(); scramble(); },
        restore,
    };
}

// ── Index entries ────────────────────────────────────────────────────────────

document.querySelectorAll('.index-entry').forEach(entry => {
    entry.addEventListener('click', e => {
        e.preventDefault();
        const href = entry.href;
        const titleEl = entry.querySelector('.index-entry__title');
        if (!titleEl) { window.location.href = href; return; }

        const titleRect    = titleEl.getBoundingClientRect();
        const headerContent = document.querySelector('.site-header__content');
        if (!headerContent) { window.location.href = href; return; }
        const headerRect   = headerContent.getBoundingClientRect();

        const cs    = getComputedStyle(titleEl);
        const clone = document.createElement('div');
        clone.textContent = titleEl.innerText.trim();
        Object.assign(clone.style, {
            position:        'fixed',
            top:             titleRect.top  + 'px',
            left:            titleRect.left + 'px',
            fontFamily:      cs.fontFamily,
            fontSize:        cs.fontSize,
            fontWeight:      cs.fontWeight,
            lineHeight:      cs.lineHeight,
            color:           '#1a1a1a',
            pointerEvents:   'none',
            zIndex:          '9999',
            transformOrigin: 'left top',
            whiteSpace:      'nowrap',
        });
        document.body.appendChild(clone);

        const cloneRect   = clone.getBoundingClientRect();
        const breadcrumb  = document.querySelector('.header__breadcrumb');
        const targetFs    = breadcrumb ? parseFloat(getComputedStyle(breadcrumb).fontSize) : 9.6;
        const scale       = targetFs / parseFloat(cs.fontSize);
        const tx          = headerRect.left - cloneRect.left;
        const ty          = (headerRect.top + headerRect.height / 2 - cloneRect.height * scale / 2) - cloneRect.top;

        // Fade out surrounding page elements
        document.querySelectorAll('.index-entry, .informationen, #nav .sidebar__inner').forEach(el => {
            el.style.transition = 'opacity 0.2s ease';
            el.style.opacity    = '0';
        });
        if (breadcrumb) breadcrumb.style.opacity = '0';

        void clone.offsetWidth;
        clone.style.transition = 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1), color 0.45s ease';
        clone.style.transform  = `translate(${tx}px, ${ty}px) scale(${scale})`;
        clone.style.color      = 'rgba(26, 26, 26, 0.35)';

        setTimeout(() => { window.location.href = href; }, 580);
    });

    const title = entry.querySelector('.index-entry__title');
    if (!title) return;

    const ctrl = attachScramble(title);
    if (!ctrl) return;

    entry.addEventListener('mouseenter', () => { ctrl.restore(); ctrl.scramble(); });
    entry.addEventListener('mouseleave', ctrl.restore);
});

// ── Header nav scramble ──────────────────────────────────────────────────────

document.querySelectorAll('.header__back, .header__next, .header__breadcrumb').forEach(el => {
    const ctrl = attachScramble(el);
    if (!ctrl) return;
    el.addEventListener('mouseenter', () => { ctrl.restore(); ctrl.scramble(); });
    el.addEventListener('mouseleave', ctrl.restore);
});


const header = document.querySelector('.site-header');

if (header) {
    function updateHeaderHeight() {
        document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
    }
    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
}

const breadcrumbBtn = document.querySelector('.header__breadcrumb');
const dropdown = document.querySelector('.header__dropdown');

if (breadcrumbBtn && dropdown) {
    const breadcrumbWrap = breadcrumbBtn.closest('.site-header__content');
    let closeTimer;
    let hoverScrambles = [];

    function resetDropdown() {
        dropdown.classList.remove('is-open', 'is-open--hover', 'is-open--click');
        dropdown.querySelectorAll('li').forEach(li => { li.style.animation = ''; });
        hoverScrambles.forEach(s => s.restore());
        hoverScrambles = [];
    }

    function openDropdown(mode) {
        clearTimeout(closeTimer);
        dropdown.style.top = breadcrumbBtn.offsetTop + 'px';
        resetDropdown();
        void dropdown.offsetWidth;
        dropdown.classList.add('is-open', `is-open--${mode}`);

        if (mode === 'hover') {
            dropdown.querySelectorAll('a').forEach(link => {
                const ctrl = attachScramble(link);
                if (ctrl) { ctrl.scramble(); hoverScrambles.push(ctrl); }
            });
        } else if (mode === 'click') {
            dropdown.querySelectorAll('li').forEach(li => {
                const isCurrent = !!li.querySelector('a[aria-current="page"]');
                li.style.animation = isCurrent
                    ? 'dropdown-title-in 0.22s ease forwards'
                    : 'dropdown-items-in 0.2s ease 0.22s forwards';
            });
        }
    }

    function closeDropdown() {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(resetDropdown, 500);
    }

    breadcrumbBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdown.classList.contains('is-open') ? closeDropdown() : openDropdown('click');
    });

    if (breadcrumbWrap) {
        breadcrumbWrap.addEventListener('mouseenter', () => openDropdown('hover'));
        breadcrumbWrap.addEventListener('mouseleave', closeDropdown);
    }

    dropdown.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    dropdown.addEventListener('mouseleave', closeDropdown);

    document.addEventListener('click', resetDropdown);

    dropdown.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', e => {
            if (link.getAttribute('aria-current') === 'page') return;
            e.preventDefault();
            const href = link.href;

            const items      = Array.from(dropdown.querySelectorAll('li'));
            const clickedLi  = link.closest('li');
            const otherItems = items.filter(li => li !== clickedLi);

            otherItems.forEach(li => {
                li.style.transition = 'opacity 0.15s ease';
                li.style.opacity    = '0';
            });

            setTimeout(() => {
                const linkRect       = link.getBoundingClientRect();
                const breadcrumbRect = breadcrumbBtn.getBoundingClientRect();
                const dy             = breadcrumbRect.top - linkRect.top;

                clickedLi.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
                clickedLi.style.transform  = `translateY(${dy}px)`;
                clickedLi.style.opacity    = '0';

                setTimeout(() => { window.location.href = href; }, 220);
            }, 150);
        });
    });
}

const footer = document.querySelector('.site-footer');

if (footer) {
    function updateFooterHeight() {
        document.documentElement.style.setProperty('--footer-h', footer.offsetHeight + 'px');
    }
    updateFooterHeight();
    window.addEventListener('resize', updateFooterHeight);
}

// ── Scroll progress bar ───────────────────────────────────────────────────────

const progressBar = document.createElement('div');
progressBar.className = 'scroll-progress';
document.body.appendChild(progressBar);

(function () {
    const scrollContainer = document.querySelector('.page-content') || document.documentElement;
    function updateProgress() {
        const scrolled = scrollContainer.scrollTop;
        const total    = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        progressBar.style.width = (total > 0 ? (scrolled / total) * 100 : 0) + '%';
    }
    scrollContainer.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
}());

document.querySelectorAll('.layout__toggle').forEach(button => {
    button.addEventListener('click', () => {
        const sidebar = document.getElementById(button.dataset.controls);

        sidebar.classList.toggle('is-collapsed');
        const isNowCollapsed = sidebar.classList.contains('is-collapsed');

        button.textContent = isNowCollapsed ? '›' : '‹';

        updateBackdrop();
    });
});


document.querySelectorAll('.sidebar__arrow').forEach(arrow => {
    arrow.addEventListener('click', () => {
        const sidebar = arrow.closest('.sidebar');
        if (!sidebar) return;
        sidebar.classList.toggle('is-collapsed');
        const isCollapsed = sidebar.classList.contains('is-collapsed');
        const label = arrow.dataset.label || '';
        const isRight = arrow.classList.contains('sidebar__arrow--right');
        if (label) {
            arrow.textContent = isRight
                ? (isCollapsed ? `${label} ←` : `${label} →`)
                : (isCollapsed ? `→ ${label}` : `← ${label}`);
        }
        const toggle = document.querySelector(`.layout__toggle[data-controls="${sidebar.id}"]`);
        if (toggle) toggle.textContent = isCollapsed ? '›' : '‹';
        updateBackdrop();
    });
});

const sidebarBackdrop = document.createElement('div');
sidebarBackdrop.className = 'sidebar-backdrop';
document.body.appendChild(sidebarBackdrop);

function isMobileLayout() {
    return window.innerWidth <= 768;
}

function updateBackdrop() {
    if (!isMobileLayout()) {
        sidebarBackdrop.classList.remove('is-visible');
        return;
    }
    const anyOpen = Array.from(document.querySelectorAll('.sidebar'))
        .some(s => !s.classList.contains('is-collapsed'));
    sidebarBackdrop.classList.toggle('is-visible', anyOpen);
}

function closeMobileSidebars() {
    document.querySelectorAll('.sidebar').forEach(s => s.classList.add('is-collapsed'));
    document.querySelectorAll('.layout__toggle').forEach(btn => {
        btn.textContent = '›';
    });
    sidebarBackdrop.classList.remove('is-visible');
}

function initMobileState() {
    if (!isMobileLayout()) return;
    const leftSidebar = document.getElementById('nav');
    const leftToggle = document.querySelector('.layout__toggle[data-controls="nav"]');
    if (leftSidebar && !leftSidebar.classList.contains('is-collapsed')) {
        leftSidebar.classList.add('is-collapsed');
        if (leftToggle) leftToggle.textContent = '›';
    }
}

function buildMobileOverviews() {
    document.querySelectorAll('.abb-image--overview').forEach(el => el.remove());
    if (!isMobileLayout()) return;

    document.querySelectorAll('.abb-image-group--4col, .abb-image-group--2col').forEach(group => {
        const items = Array.from(group.querySelectorAll('.abb-image:not(.abb-image--overview)'));
        if (items.length <= 1) return;

        const overview = document.createElement('div');
        overview.className = 'abb-image abb-image--overview';

        const count = items.length;
        const cols = count <= 2 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
        const rows = count <= 2 ? count : cols;

        const grid = document.createElement('div');
        grid.className = 'abb-overview-grid';
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

        items.forEach(item => {
            const cell = document.createElement('div');
            const isZoom = item.classList.contains('abb-image--zoom');
            const img = item.querySelector('img');
            const video = item.querySelector('video');
            if (img) {
                const clone = document.createElement('img');
                clone.src = img.src;
                clone.alt = img.alt;
                if (isZoom) {
                    clone.style.transform = 'scale(1.12)';
                    clone.style.transformOrigin = 'center';
                }
                cell.appendChild(clone);
            } else if (video) {
                const clone = document.createElement('video');
                clone.src = video.src;
                clone.muted = true;
                clone.autoplay = true;
                clone.loop = true;
                clone.playsInline = true;
                if (isZoom) {
                    clone.style.transform = 'scale(1.12)';
                    clone.style.transformOrigin = 'center';
                }
                cell.appendChild(clone);
            }
            grid.appendChild(cell);
        });

        overview.appendChild(grid);
        group.appendChild(overview);

        function syncOverviewHeight() {
            const maxH = Math.max(...items.map(i => i.offsetHeight));
            if (maxH > 0) overview.style.height = maxH + 'px';
        }

        requestAnimationFrame(syncOverviewHeight);
        items.forEach(item => {
            item.querySelectorAll('img').forEach(img => {
                if (!img.complete) img.addEventListener('load', syncOverviewHeight, { once: true });
            });
        });
    });
}


sidebarBackdrop.addEventListener('click', closeMobileSidebars);
initMobileState();
buildMobileOverviews();
window.addEventListener('resize', () => {
    initMobileState();
    updateBackdrop();
    buildMobileOverviews();
});

document.querySelectorAll('.sidebar__nav--dark a[id^="src-"]').forEach(el => {
    el.innerHTML = el.innerHTML.replace(/\*([^*]+)\*/g, '<em>$1</em>');
});

const contentEl = document.querySelector('.content');
const scrollEl  = document.querySelector('.page-content') || contentEl;

if (contentEl) {

    const firstH1 = document.querySelector('.content h1');
    const tooltip    = document.createElement('div');
    const tooltipImg = document.createElement('img');
    tooltip.className = 'abb-tooltip';
    tooltip.appendChild(tooltipImg);
    document.body.appendChild(tooltip);

    document.addEventListener('mouseover', e => {
        const abbSpan = e.target.closest('.abb');
        if (!abbSpan) return;
        tooltipImg.src = abbSpan.dataset.src;
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top  = (e.clientY + 12) + 'px';
        tooltip.classList.add('is-visible');
    });

    document.addEventListener('mouseout', e => {
        if (e.target.closest('.abb')) {
            tooltip.classList.remove('is-visible');
        }
    });

    document.addEventListener('mousemove', e => {
        if (!tooltip.classList.contains('is-visible')) return;
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top  = (e.clientY + 12) + 'px';
    });

    const assetPath   = contentEl.dataset.assetPath   || 'assets/kulturgeschichtlicheThesis';
    const assetPrefix = contentEl.dataset.assetPrefix || 'Abb';

    const captionsScript = document.getElementById('image-captions');
    const captions = captionsScript ? JSON.parse(captionsScript.textContent) : {};

    function buildCaption(text) {
        const span = document.createElement('span');
        span.className = 'abb-caption';
        span.innerHTML = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        return span;
    }

    document.querySelectorAll('.abb-image[data-caption]').forEach(item => {
        item.appendChild(buildCaption(item.dataset.caption));
    });

    contentEl.innerHTML = contentEl.innerHTML.replace(/\(Abb\. (\d+)\)|Abb\. (\d+)/g, (match, num1, num2) => {
        const num = num1 || num2;
        const imagePath = `${assetPath}/${assetPrefix}-${num.padStart(2, '0')}.avif`;
        return `<span class="abb" data-src="${imagePath}">${match}</span>`;
    });

    // Split <p> elements that use <br><br> as paragraph breaks into proper separate <p> elements,
    // so that image groups inserted on click appear after the correct logical paragraph.
    contentEl.querySelectorAll('p').forEach(p => {
        const nodes = Array.from(p.childNodes);
        const segments = [];
        let seg = [];

        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const isBr = n.nodeName === 'BR';
            const nextIsBr = nodes[i + 1] && nodes[i + 1].nodeName === 'BR';

            if (isBr && nextIsBr) {
                segments.push(seg);
                seg = [];
                while (nodes[i + 1] && nodes[i + 1].nodeName === 'BR') i++;
            } else {
                seg.push(n);
            }
        }
        if (seg.length) segments.push(seg);

        const filled = segments.filter(s =>
            s.some(n => n.nodeName !== 'BR' && (n.nodeType !== 3 || n.textContent.trim()))
        );
        if (filled.length < 2) return;

        const newPs = filled.map(s => {
            const newP = p.cloneNode(false);
            s.forEach(n => newP.appendChild(n));
            return newP;
        });
        p.replaceWith(...newPs);
    });

    function flattenAndSortGroup(group) {
        group.querySelectorAll('.abb-image-col').forEach(col => {
            while (col.firstChild) {
                group.insertBefore(col.firstChild, col);
            }
            col.remove();
        });

        const images = Array.from(group.querySelectorAll('.abb-image'));
        images.sort((a, b) => Number(a.dataset.n) - Number(b.dataset.n));
        images.forEach(img => group.appendChild(img));
    }

    function syncGroupCaptionHeights(group) {
        const captions = Array.from(group.querySelectorAll('.abb-caption'));
        if (captions.length < 2) return;
        captions.forEach(c => c.style.minHeight = '');
        requestAnimationFrame(() => {
            const maxH = Math.max(...captions.map(c => c.offsetHeight));
            if (maxH > 0) captions.forEach(c => c.style.minHeight = maxH + 'px');
        });
    }

    function applyGroupLayout(group) {
        flattenAndSortGroup(group);

        group.classList.remove('abb-image-group--2col');
        group.classList.remove('abb-image-group--full');

        const images = Array.from(group.querySelectorAll('.abb-image'));
        images.forEach(img => img.classList.remove('abb-image--half'));

        if (images.length === 1) {
            const n = Number(images[0].dataset.n);
            if (n === 5 || n === 11) images[0].classList.add('abb-image--half');
            return;
        }

        const hasVeryWide = images.some(item => {
            const img = item.querySelector('img');
            return img && img.naturalWidth && img.naturalHeight &&
                   (img.naturalWidth / img.naturalHeight) > 2.5;
        });
        if (hasVeryWide) {
            group.classList.add('abb-image-group--full');
            return;
        }

        if (images.length !== 3) return;

        const portraits = images.filter(item => {
            const img = item.querySelector('img');
            return img && img.naturalWidth && img.naturalHeight > img.naturalWidth;
        });
        const landscapes = images.filter(item => {
            const img = item.querySelector('img');
            return img && img.naturalWidth && img.naturalHeight <= img.naturalWidth;
        });

        if (portraits.length !== 1 || landscapes.length !== 2) {
            group.classList.add('abb-image-group--2col');
            return;
        }

        const column = document.createElement('div');
        column.className = 'abb-image-col';
        group.insertBefore(column, images[0]);
        column.appendChild(landscapes[0]);
        column.appendChild(landscapes[1]);
        group.appendChild(portraits[0]);
    }

    contentEl.addEventListener('click', e => {
        const abbSpan = e.target.closest('.abb');
        if (!abbSpan) return;

        const imageSrc  = abbSpan.dataset.src;
        const paragraph = abbSpan.closest('p');
        if (!paragraph) return;

        const imageNumber = parseInt((imageSrc.match(/\d+(?=\.avif)/) || [0])[0], 10);

        let group = paragraph.nextElementSibling;
        if (!group || !group.classList.contains('abb-image-group')) {
            group = document.createElement('div');
            group.className = 'abb-image-group';
            paragraph.after(group);
        }
        group._abbSpan = abbSpan;

        const existingImage = group.querySelector(`[data-src="${CSS.escape(imageSrc)}"]`);
        if (existingImage) {
            existingImage.remove();
            const remaining = group.querySelectorAll('.abb-image');
            if (remaining.length === 0) {
                group.remove();
            } else {
                applyGroupLayout(group);
                syncGroupCaptionHeights(group);
            }
            return;
        }

        flattenAndSortGroup(group);

        const imageItem = document.createElement('div');
        imageItem.className   = 'abb-image';
        imageItem.dataset.src = imageSrc;
        imageItem.dataset.n   = imageNumber;
        imageItem.innerHTML   = `<img src="${imageSrc}" alt="">`;

        const captionKey = String(imageNumber).padStart(2, '0');
        if (captions[captionKey]) imageItem.appendChild(buildCaption(captions[captionKey]));
        if (imageNumber === 11) {
            const imgEl11 = imageItem.querySelector('img');
            if (imgEl11) {
                const cropWrap = document.createElement('div');
                cropWrap.style.cssText = 'overflow:hidden;';
                imgEl11.parentNode.insertBefore(cropWrap, imgEl11);
                cropWrap.appendChild(imgEl11);
                imgEl11.style.cssText = 'display:block;width:108%;margin-left:-7.5%;margin-top:-3%;height:auto;';
            }
        }

        const insertBefore = Array.from(group.querySelectorAll('.abb-image'))
            .find(el => Number(el.dataset.n) > imageNumber);

        if (insertBefore) {
            group.insertBefore(imageItem, insertBefore);
        } else {
            group.appendChild(imageItem);
        }

        const imgEl = imageItem.querySelector('img');
        if (imgEl) {
            function tryLayout() {
                if (imgEl.naturalWidth) {
                    applyGroupLayout(group);
                    syncGroupCaptionHeights(group);
                    requestAnimationFrame(() => {
                        const groupRect  = group.getBoundingClientRect();
                        const scrollRect = scrollEl.getBoundingClientRect();
                        const amount = groupRect.top - scrollRect.bottom + 80;
                        if (amount > 0) {
                            scrollEl.scrollBy({ top: amount, behavior: 'smooth' });
                        }
                    });
                }
            }
            if (imgEl.complete) {
                tryLayout();
            } else {
                imgEl.addEventListener('load', tryLayout);
            }
        }
    });

    const navLinks = Array.from(document.querySelectorAll('.sidebar__nav a[href^="#"]'));
    const headings = Array.from(contentEl.querySelectorAll('h1[id], h2[id]'));

    function getH1Height() {
        return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--h1-h')) || 0;
    }

    function getHeadingScrollPosition(heading) {
        const previousPosition   = heading.style.position;
        heading.style.position   = 'static';
        const top = heading.getBoundingClientRect().top
                  - scrollEl.getBoundingClientRect().top
                  + scrollEl.scrollTop;
        heading.style.position   = previousPosition;
        return top;
    }

    navLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const targetId = link.getAttribute('href').slice(1);
            const target   = document.getElementById(targetId);
            if (!target) return;

            const offset = target.tagName === 'H1' ? 0 : getH1Height();
            scrollEl.scrollTo({ top: getHeadingScrollPosition(target) - offset, behavior: 'instant' });
        });
    });

    let headingTops = null;

    function buildHeadingTops() {
        headingTops = headings.map(h => ({
            id:   h.id,
            isH1: h.tagName === 'H1',
            top:  getHeadingScrollPosition(h),
        }));
    }

    function updateActiveNavLink() {
        if (!headingTops) buildHeadingTops();
        const scrollTop      = scrollEl.scrollTop;
        const h1Height       = getH1Height();
        let activeHeadingId  = null;

        for (const pos of headingTops) {
            const offset = pos.isH1 ? 0 : h1Height;
            if (scrollTop >= pos.top - offset - 4) {
                activeHeadingId = pos.id;
            } else {
                break;
            }
        }

        navLinks.forEach(link => {
            const isActive = link.getAttribute('href') === '#' + activeHeadingId;
            link.classList.toggle('is-active', isActive);
        });

        const activeLink = navLinks.find(link => link.getAttribute('href') === '#' + activeHeadingId);
        if (activeLink) {
            const inner = activeLink.closest('.sidebar')?.querySelector('.sidebar__inner');
            if (inner) {
                const linkRect  = activeLink.getBoundingClientRect();
                const innerRect = inner.getBoundingClientRect();
                if (linkRect.top < innerRect.top || linkRect.bottom > innerRect.bottom) {
                    inner.scrollTo({
                        top: inner.scrollTop + linkRect.top - innerRect.top
                             - inner.clientHeight / 2 + activeLink.offsetHeight / 2,
                        behavior: 'smooth',
                    });
                }
            }
        }
    }

    function updateCurrentH1Height() {
        const contentTop = scrollEl.getBoundingClientRect().top;
        let currentH1 = firstH1;
        for (const h of headings) {
            if (h.tagName !== 'H1') continue;
            if (h.getBoundingClientRect().top - contentTop <= 1) currentH1 = h;
            else break;
        }
        if (currentH1) {
            document.documentElement.style.setProperty('--h1-h', currentH1.offsetHeight + 'px');
        }
    }

    scrollEl.addEventListener('scroll', updateCurrentH1Height);
    window.addEventListener('resize', updateCurrentH1Height);
    updateCurrentH1Height();


    scrollEl.addEventListener('scroll', updateActiveNavLink);
    updateActiveNavLink();

    window.addEventListener('resize', () => {
        document.querySelectorAll('.abb-image-group').forEach(g => syncGroupCaptionHeights(g));
    });

    const siteFooter = document.querySelector('.site-footer');

    if (siteFooter) {
        function updateFooterVisibility() {
            const scrollableHeight = scrollEl.scrollHeight - scrollEl.clientHeight;
            const atBottom = scrollableHeight <= 0 || scrollEl.scrollTop >= scrollableHeight - 20;
            siteFooter.classList.toggle('is-visible', atBottom);
        }
        scrollEl.addEventListener('scroll', updateFooterVisibility);
        updateFooterVisibility();
    }

    const notesSidebar = document.getElementById('notes');

    contentEl.addEventListener('click', e => {
        const ref = e.target.closest('.footnote-ref');
        if (!ref) return;
        const source = document.getElementById(ref.dataset.footnote);
        if (!source) return;
        source.classList.toggle('is-visible');
    });

    contentEl.addEventListener('click', e => {
        const vgl = e.target.closest('.vgl-link');
        if (!vgl) return;
        e.preventDefault();
        const targetId = vgl.getAttribute('href').slice(1);
        const target = document.getElementById(targetId);
        if (!target) return;
        const offset = target.tagName === 'H1' ? 0 : getH1Height();
        scrollEl.scrollTo({ top: getHeadingScrollPosition(target) - offset, behavior: 'smooth' });
    });

    if (notesSidebar) {
        const notesToggleBtn = document.querySelector('.layout__toggle[data-controls="notes"]');

        contentEl.addEventListener('click', e => {
            const cite = e.target.closest('.cite');
            if (!cite) return;

            const sourceEl = document.getElementById(cite.dataset.src);
            if (!sourceEl) return;

            if (notesSidebar.classList.contains('is-collapsed')) {
                notesSidebar.classList.remove('is-collapsed');
                if (notesToggleBtn) notesToggleBtn.textContent = '‹';
                const notesArrow = notesSidebar.querySelector('.sidebar__arrow');
                if (notesArrow) {
                    const label = notesArrow.dataset.label || '';
                    if (label) notesArrow.textContent = `${label} →`;
                }
            }

            requestAnimationFrame(() => {
                const notesInner  = notesSidebar.querySelector('.sidebar__inner');
                const sourceRect  = sourceEl.getBoundingClientRect();
                const innerRect   = notesInner.getBoundingClientRect();
                notesInner.scrollBy({
                    top: sourceRect.top - innerRect.top - notesInner.clientHeight / 2 + sourceEl.offsetHeight / 2,
                    behavior: 'smooth'
                });
            });

            sourceEl.classList.remove('src--flash');
            void sourceEl.offsetWidth;
            sourceEl.classList.add('src--flash');
            sourceEl.addEventListener('animationend', () => {
                sourceEl.classList.remove('src--flash');
            }, { once: true });
        });
    }
}


const lightbox      = document.createElement('div');
const lightboxMedia = document.createElement('div');
const lightboxPrev  = document.createElement('button');
const lightboxNext  = document.createElement('button');
lightbox.className       = 'lightbox';
lightboxMedia.className  = 'lightbox__media';
lightboxPrev.className   = 'lightbox__arrow lightbox__arrow--prev';
lightboxNext.className   = 'lightbox__arrow lightbox__arrow--next';
lightboxPrev.textContent = '←';
lightboxNext.textContent = '→';
lightbox.appendChild(lightboxPrev);
lightbox.appendChild(lightboxMedia);
lightbox.appendChild(lightboxNext);
document.body.appendChild(lightbox);

let lightboxItems = [];
let lightboxIndex = 0;

function getLightboxItems() {
    return Array.from(document.querySelectorAll(
        'img:not(.abb-tooltip img):not(.lightbox img):not(.abb-image--overview img):not(.index-entry__thumb), .abb-image:not(.abb-image--overview) video'
    ));
}

function showLightboxItem(index) {
    if (!lightboxItems.length) return;
    lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
    const el = lightboxItems[lightboxIndex];
    lightboxMedia.innerHTML = '';

    if (el.tagName === 'VIDEO') {
        const v        = document.createElement('video');
        v.src          = el.src;
        v.autoplay     = true;
        v.loop         = true;
        v.muted        = true;
        v.controls     = true;
        v.playsInline  = true;
        lightboxMedia.appendChild(v);
    } else {
        const img = document.createElement('img');
        img.src = el.src;
        img.alt = el.alt;
        lightboxMedia.appendChild(img);
    }

    lightboxPrev.style.visibility = lightboxItems.length > 1 ? 'visible' : 'hidden';
    lightboxNext.style.visibility = lightboxItems.length > 1 ? 'visible' : 'hidden';
}

function closeLightbox() {
    lightbox.classList.remove('is-open');
    lightboxMedia.innerHTML = '';
    document.dispatchEvent(new Event('lightbox:close'));
}

lightbox.addEventListener('click', e => {
    if (e.target === lightbox) closeLightbox();
});

lightboxPrev.addEventListener('click', () => showLightboxItem(lightboxIndex - 1));
lightboxNext.addEventListener('click', () => showLightboxItem(lightboxIndex + 1));

function buildJustifiedGallery(group) {
    const items = Array.from(group.querySelectorAll('.abb-image'));
    if (!items.length) return;

    const imgs = items.map(i => i.querySelector('img'));
    items.forEach(i => i.remove());
    Array.from(group.children).forEach(c => c.remove());

    Promise.all(imgs.map(img =>
        !img ? Promise.resolve() :
        img.complete ? Promise.resolve() :
        new Promise(r => img.addEventListener('load', r, { once: true }))
    )).then(() => {
        const gap = 8;
        const targetH = 200;
        const containerW = group.offsetWidth;
        if (!containerW) return;

        let row = [], rowW = 0;

        const flushRow = (isLast) => {
            if (!row.length) return;
            const totalRatio = row.reduce((s, { ratio }) => s + ratio, 0);
            const gaps = (row.length - 1) * gap;
            const H = isLast ? targetH : Math.round((containerW - gaps) / totalRatio);

            const rowEl = document.createElement('div');
            rowEl.style.cssText = `display:flex;gap:${gap}px;align-items:flex-start;margin-bottom:${gap}px;`;

            row.forEach(({ item, ratio }) => {
                item.style.flex = ratio;
                item.style.display = 'flex';
                item.style.flexDirection = 'column';
                const img = item.querySelector('img');
                if (img && !img.parentElement.classList.contains('justified-img-wrap')) {
                    const wrap = document.createElement('div');
                    wrap.className = 'justified-img-wrap';
                    wrap.style.cssText = `overflow:hidden;height:${H}px;`;
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
                    img.parentNode.insertBefore(wrap, img);
                    wrap.appendChild(img);
                }
                rowEl.appendChild(item);
            });

            group.appendChild(rowEl);
            row = []; rowW = 0;
        };

        items.forEach((item, i) => {
            const img = imgs[i];
            const ratio = img?.naturalWidth && img?.naturalHeight
                ? img.naturalWidth / img.naturalHeight : 1.5;
            const needed = ratio * targetH + (row.length ? gap : 0);
            if (rowW + needed > containerW && row.length) flushRow(false);
            row.push({ item, ratio });
            rowW += ratio * targetH + (row.length > 1 ? gap : 0);
        });

        flushRow(true);
    });
}

document.querySelectorAll('.abb-image-group--justified').forEach(group => {
    buildJustifiedGallery(group);
});

window.addEventListener('resize', () => {
    document.querySelectorAll('.abb-image-group--justified').forEach(group => {
        buildJustifiedGallery(group);
    });
});

document.querySelectorAll('.abb-image[data-swap-src]').forEach(item => {
    const img = item.querySelector('img');
    if (!img) return;
    const srcA = img.src;
    const srcB = new URL(item.dataset.swapSrc, location.href).href;
    let showingA = true;
    setInterval(() => {
        showingA = !showingA;
        img.src = showingA ? srcA : srcB;
    }, 3000);
});

document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   showLightboxItem(lightboxIndex - 1);
    if (e.key === 'ArrowRight')  showLightboxItem(lightboxIndex + 1);
});

document.addEventListener('click', e => {
    const clickedImage = e.target.closest('img');
    const clickedVideo = e.target.closest('video');

    if (!clickedImage && !clickedVideo) return;
    if (clickedImage && (clickedImage.closest('.abb-tooltip') || clickedImage.closest('.lightbox'))) return;

    lightboxItems = getLightboxItems();
    const clicked = clickedImage || clickedVideo;

    if (clicked.closest('.abb-image--overview')) {
        const src = clicked.src;
        lightboxIndex = lightboxItems.findIndex(el => el.src === src);
        if (lightboxIndex === -1) lightboxIndex = 0;
    } else {
        lightboxIndex = lightboxItems.indexOf(clicked);
        if (lightboxIndex === -1) lightboxIndex = 0;
    }

    showLightboxItem(lightboxIndex);
    lightbox.classList.add('is-open');
    document.dispatchEvent(new Event('lightbox:open'));
});

(function () {
    const gridTooltip    = document.createElement('div');
    const gridTooltipImg = document.createElement('img');
    gridTooltip.className = 'grid-hover-tooltip';
    gridTooltip.appendChild(gridTooltipImg);
    document.body.appendChild(gridTooltip);

    document.addEventListener('mouseover', e => {
        const img = e.target.closest('.drawing-grid img');
        if (!img) return;
        gridTooltipImg.src = img.src;
        gridTooltip.style.left = (e.clientX + 14) + 'px';
        gridTooltip.style.top  = (e.clientY + 14) + 'px';
        gridTooltip.classList.add('is-visible');
    });

    document.addEventListener('mouseout', e => {
        if (e.target.closest('.drawing-grid img')) {
            gridTooltip.classList.remove('is-visible');
        }
    });

    document.addEventListener('mousemove', e => {
        if (!gridTooltip.classList.contains('is-visible')) return;
        gridTooltip.style.left = (e.clientX + 14) + 'px';
        gridTooltip.style.top  = (e.clientY + 14) + 'px';
    });
}());

// ── Index intro animation ─────────────────────────────────────────────────────

if (document.body.classList.contains('page--index')) {
    const abbTooltip    = document.querySelector('.abb-tooltip');
    const abbTooltipImg = abbTooltip?.querySelector('img');

    function enableEntryTooltips() {
        if (!abbTooltip || !abbTooltipImg) return;
        document.querySelectorAll('.index-entry').forEach(entry => {
            const thumb = entry.querySelector('.index-entry__thumb');
            if (!thumb) return;
            entry.addEventListener('mouseenter', e => {
                abbTooltipImg.src = thumb.src;
                abbTooltip.style.left = (e.clientX + 12) + 'px';
                abbTooltip.style.top  = (e.clientY + 12) + 'px';
                abbTooltip.classList.add('is-visible');
            });
            entry.addEventListener('mousemove', e => {
                abbTooltip.style.left = (e.clientX + 12) + 'px';
                abbTooltip.style.top  = (e.clientY + 12) + 'px';
            });
            entry.addEventListener('mouseleave', () => {
                abbTooltip.classList.remove('is-visible');
            });
        });
    }


    // Scroll-fade: sidebar + text sections
    const pageScrollEl     = document.querySelector('.page-content');
    const sidebarInner     = document.querySelector('#nav .sidebar__inner');
    const informationenEl  = document.querySelector('.informationen');
    const textFadeEls      = Array.from(document.querySelectorAll('.content > h1, .content > p'));

    const onFirstScroll = () => {
        if (sidebarInner)    sidebarInner.style.opacity   = '1';
        if (informationenEl) informationenEl.style.opacity = '1';
    };
    (pageScrollEl || window).addEventListener('scroll', onFirstScroll, { once: true });

    const textFadeObs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.style.opacity = '1';
            textFadeObs.unobserve(entry.target);
        });
    }, { threshold: 0.15, root: pageScrollEl || null });

    textFadeEls.forEach(el => textFadeObs.observe(el));

    const target        = document.querySelector('.header__back');
    const headerContent = document.querySelector('.site-header__content');
    const indexContent  = document.querySelector('.content');
    const waveItems     = indexContent
        ? [headerContent, ...indexContent.querySelectorAll('.index-meta, .index-entry, .index-end-rule')]
        : [headerContent];

    if (target) {
        target.style.opacity = '0';
        if (headerContent) headerContent.style.opacity = '0';
        if (indexContent) indexContent.style.opacity = '0';

        const overlay = document.createElement('span');
        overlay.textContent = 'Ungewissheit';
        Object.assign(overlay.style, {
            position:      'fixed',
            top:           '50%',
            left:          '50%',
            transform:     'translate(-50%, -50%)',
            fontSize:      '96px',
            fontFamily:    "'FreigeistNeue', sans-serif",
            color:         '#1a1a1a',
            lineHeight:    '1',
            whiteSpace:    'nowrap',
            pointerEvents: 'none',
            zIndex:        '9999',
        });
        document.body.appendChild(overlay);

        const ctrl = attachScramble(overlay);
        ctrl.scramble();

        setTimeout(() => {
            const targetRect  = target.getBoundingClientRect();
            const overlayRect = overlay.getBoundingClientRect();

            const dx    = (targetRect.left + targetRect.width  / 2) - (overlayRect.left + overlayRect.width  / 2);
            const dy    = (targetRect.top  + targetRect.height / 2) - (overlayRect.top  + overlayRect.height / 2);
            const scale = targetRect.height / overlayRect.height;

            overlay.style.transition = 'transform 0.65s cubic-bezier(0.4, 0, 0.2, 1)';
            overlay.style.transform  = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`;

            let introDone = false;
            function onIntroDone() {
                if (introDone) return;
                introDone = true;
                overlay.remove();
                target.style.transition = 'opacity 0.3s';
                target.style.opacity    = '1';

                if (indexContent) indexContent.style.opacity = '1';

                waveItems.forEach((el, i) => {
                    if (!el) return;
                    el.style.opacity    = '0';
                    el.style.transition = 'none';
                    setTimeout(() => {
                        el.style.transition = 'opacity 0.35s ease';
                        el.style.opacity    = '1';
                    }, i * 80);
                });

                setTimeout(enableEntryTooltips, waveItems.length * 80 + 350);
            }

            overlay.addEventListener('transitionend', onIntroDone, { once: true });
            setTimeout(onIntroDone, 750);
        }, 1200);
    } else {
        enableEntryTooltips();
    }
}


