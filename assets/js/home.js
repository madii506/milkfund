// the home page: hero (live 3D computer, orbit of real stock logos, live tape), the pinned story, the stock shelf,
// the split, the calculator, the coins, the ledger, $MILK, FAQ and the end band.
import { $, $$, esc, api, logo, usd, pct, chgClass, sol, num, ago, short, solscan, stocks, config, on, reduced, toast, copy, store } from './core.js';
import { gsap, ScrollTrigger, lenis, rise, revealAll, countTo, magnetic, splitWords } from './motion.js';
import { openStock } from './drawer.js';

const RM = reduced();
const isMobile = () => innerWidth < 861;
let PC = null;

// ---------------------------------------------------------------- picks from the live catalog
const byLiq = l => l.slice().sort((a, b) => (b.liq || 0) - (a.liq || 0));
function uniqTickers(list) { const seen = new Set(), out = []; for (const s of list) { if (seen.has(s.ticker)) continue; seen.add(s.ticker); out.push(s); } return out; }
const featured = l => uniqTickers(byLiq(l).filter(s => s.price != null));

// ---------------------------------------------------------------- hero
async function hero() {
  const cv = $('#pc');
  try {
    if (!window.WebGLRenderingContext) throw new Error('no webgl');
    const mod = await import('./pc3d.js?v=1');
    PC = mod.start({ canvas: cv, stocks: null, lite: /[?&]shot\b/.test(location.search) });
  } catch (e) { cv.replaceWith(Object.assign(document.createElement('img'), { src: '/assets/img/pfp.webp', className: 'pc-fallback', alt: '' })); PC = null; }
  addEventListener('pointermove', e => { if (PC) PC.setMouse(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1); }, { passive: true });
  new IntersectionObserver(([en]) => PC && PC.setVisible(en.isIntersecting)).observe($('#hero'));
  ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true, onUpdate: s => PC && PC.setScroll(s.progress) });
  if (!RM) {
    // stacked sheets: the hero holds still and dims while the story sheet slides over it
    ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom top', pin: true, pinSpacing: false });
    gsap.to('.hero-in', { yPercent: -10, opacity: .15, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('#heroDim', { opacity: .55, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('#pc', { scale: .9, yPercent: 6, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
  }
}

// the intro: we start inside the CRT (blue, the pixel drop) and pull back to the computer
export async function intro() {
  const words = splitWords($('.h-hero'));
  const quick = RM || store.get('introSeen') === '1' && sessionStorage.getItem('milk:intro') === '1';
  try { sessionStorage.setItem('milk:intro', '1'); } catch {}
  store.set('introSeen', '1');
  gsap.set(words, { yPercent: 115, rotate: 4 });
  gsap.set(['#nav', '.hero .rv', '.tape'], { opacity: 0 });
  gsap.set('.hero .rv', { y: 24 }); gsap.set('.tape', { y: 40 });
  if (PC) PC.setIntro(1), PC.renderOnce && PC.renderOnce();
  await new Promise(r => setTimeout(r, quick ? 80 : 650));
  $('#intro').classList.add('gone'); document.body.classList.remove('booting');
  const o = { v: 1 }, D = quick ? .9 : 2.2;
  const tl = gsap.timeline();
  if (PC) tl.to(o, { v: 0, duration: D, ease: 'power3.inOut', onUpdate: () => PC.setIntro(o.v), onComplete: () => PC.startTerminal() }, quick ? 0 : .35);
  else tl.to({}, { duration: .2 });
  const t2 = quick ? .2 : D * .62 + .35;
  tl.to('#nav', { opacity: 1, duration: .8, ease: 'power2.out' }, t2)
    .to(words, { yPercent: 0, rotate: 0, duration: 1.1, ease: 'expo.out', stagger: .06 }, t2)
    .to('.hero .rv', { opacity: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .08 }, t2 + .25)
    .to('.tape', { opacity: 1, y: 0, duration: .9, ease: 'power3.out' }, t2 + .4)
    .add(() => orbitIn(), t2 + .3);
  return tl;
}

// stock logos floating around the computer: real token icons, served from our origin
const ORB = [];
function orbit(list) {
  const box = $('#orbit');
  const pick = featured(list).filter(s => s.icon).slice(0, 7);
  const pre = list.filter(s => s.kind === 'preipo' && s.icon && s.price != null);
  for (const p of uniqTickers(pre).slice(0, 2)) pick.splice(2 + ORB.length, 0, p);
  box.innerHTML = '';
  ORB.length = 0;
  pick.slice(0, 9).forEach((s, i) => {
    const el = document.createElement('button');
    el.className = 'ob'; el.type = 'button'; el.title = s.ticker + ' · ' + s.name;
    el.innerHTML = `<img src="${logo(s.mint)}" alt="${esc(s.ticker)}" loading="lazy">`;
    el.style.pointerEvents = 'auto';
    el.addEventListener('click', () => openStock(s.id));
    box.appendChild(el);
    ORB.push({ el, a: i / 9 * Math.PI * 2 + .4, r: .85 + (i % 3) * .14, z: .5 + (i % 4) * .2, s: 46 + (i % 3) * 12, ph: Math.random() * 6 });
  });
  layoutOrbit();
}
let MX = 0, MY = 0;
addEventListener('pointermove', e => { MX = e.clientX / innerWidth - .5; MY = e.clientY / innerHeight - .5; }, { passive: true });
function layoutOrbit() {
  const W = innerWidth, H = $('#hero').offsetHeight, m = isMobile();
  const cx = m ? W * .5 : W * .735, cy = m ? H * .73 : H * .5, rx = m ? W * .4 : Math.min(W * .2, 330), ry = m ? H * .15 : Math.min(H * .32, 290);
  ORB.forEach((o, i) => { o.cx = cx; o.cy = cy; o.rx = rx; o.ry = ry; o.minX = m ? 8 : W * .565; o.maxX = W - 16; o.minY = m ? H * .6 : 96; o.maxY = H - 150; const sz = m ? o.s * .78 : o.s; o.el.style.width = o.el.style.height = sz + 'px'; o.sz = sz; if (m && i > 5) o.el.style.display = 'none'; else o.el.style.display = ''; });
}
addEventListener('resize', layoutOrbit);
let ORB_ON = false, ORB_WANT = false;
function orbitIn() {
  ORB_WANT = true; if (!ORB.length || ORB_ON) return;
  ORB_ON = true;
  ORB.forEach((o, i) => gsap.fromTo(o.el, { opacity: 0, scale: .2 }, { opacity: 1, scale: 1, duration: .9, ease: 'back.out(2)', delay: i * .07 }));
  if (RM) return;
  gsap.ticker.add(() => {
    if (!ORB_ON || scrollY > innerHeight * 1.2) return;
    const t = performance.now() / 1000;
    for (const o of ORB) {
      const a = o.a + t * .07 * (o.z > .8 ? 1 : .75);
      const x = Math.max(o.minX, Math.min(o.maxX - o.sz, o.cx + Math.cos(a) * o.rx * o.r + MX * 40 * o.z - o.sz / 2));
      const y = Math.max(o.minY, Math.min(o.maxY - o.sz, o.cy + Math.sin(a) * o.ry * o.r + Math.sin(t * 1.3 + o.ph) * 6 + MY * 30 * o.z - o.sz / 2)) - scrollY * (.15 + o.z * .25);
      o.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      o.el.style.zIndex = Math.sin(a) > 0 ? 3 : 1;
    }
  });
}

// the live tape under the hero: moves on its own, faster while you scroll
function tape(list) {
  const tr = $('#tape .tape-track');
  const items = featured(list).slice(0, 26);
  if (!items.length) { tr.innerHTML = '<span class="ti">Prices are taking a moment…</span>'; return; }
  const row = items.map(s => `<span class="ti" data-id="${esc(s.id)}"><img src="${logo(s.mint)}" alt="" loading="lazy" width="24" height="24"><b>${esc(s.ticker)}</b><span class="p" data-p>${usd(s.price)}</span><span class="chg ${chgClass(s.chg24)}" data-c>${pct(s.chg24)}</span></span>`).join('');
  tr.innerHTML = row + row;
  tr.onclick = e => { const t = e.target.closest('.ti'); if (t) openStock(t.dataset.id); };
  let x = 0, half = tr.scrollWidth / 2;
  new ResizeObserver(() => { half = tr.scrollWidth / 2; }).observe(tr);
  let hover = false; tr.addEventListener('pointerenter', () => hover = true); tr.addEventListener('pointerleave', () => hover = false);
  if (RM) return;
  gsap.ticker.add((t, dt) => {
    const v = lenis ? Math.min(40, Math.abs(lenis.velocity || 0)) : 0;
    x -= (hover ? .15 : .9 + v * .6) * dt / 16;
    if (-x > half) x += half;
    tr.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
  });
}
on('stocks', ({ list, prev }) => {
  if (!prev) return;
  const old = new Map(prev.map(s => [s.id, s.price]));
  $$('#tape .ti').forEach(el => {
    const s = list.find(x => x.id === el.dataset.id); if (!s) return;
    const p = el.querySelector('[data-p]'), c = el.querySelector('[data-c]');
    const was = old.get(s.id);
    if (p.textContent !== usd(s.price)) { p.textContent = usd(s.price); el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth; el.classList.add(s.price > was ? 'flash-up' : 'flash-dn'); }
    c.textContent = pct(s.chg24); c.className = 'chg ' + chgClass(s.chg24);
  });
});

// ---------------------------------------------------------------- 01 the pinned story
function story() {
  const steps = $$('.step'), bars = $$('.steps-bar i'), screens = $$('.ps'), chip = $('#phChip');
  const nameEl = $('#phName'), tkEl = $('#phTk'), btn = $('.ph-btn'), ring = $('#phRing');
  const trades = $('#phTrades'), prog = $('#phProg'), dot = $('.sw-line i'), bought = $('#phBought'), stack = $('#phStack'), pay = $('#phPay');
  const DROP_SVG = '<svg viewBox="0 0 16 19"><use href="#dropShape"/></svg>';
  trades.innerHTML = Array.from({ length: 9 }, (_, i) => `<div class="tr"><span class="d ${i % 3 === 1 ? 's' : 'b'}">${i % 3 === 1 ? 'S' : 'B'}</span><span class="l"><i style="width:${30 + (i * 37) % 60}%"></i></span><span class="f">${DROP_SVG}</span></div>`).join('');
  stack.innerHTML = Array.from({ length: 15 }, () => '<i>NVDA</i>').join('');
  const COLORS = ['#ffd23f', '#f2667f', '#8f63f5', '#8fc8ff', '#f7a83a'];
  pay.innerHTML = COLORS.map((c, i) => `<div class="py"><span class="a" style="background:${c}"></span><span class="l"><b><i data-w="${[92, 64, 41, 28, 15][i]}"></i></b><span></span></span><span class="ok">NVDA ✓</span></div>`).join('');
  const trRows = $$('.tr', trades), stackI = $$('i', stack), payRows = $$('.py', pay);
  let cur = -1;
  const NAME = 'Cash Cow', TK = '$COW';
  function render(p) {
    const k = Math.min(3.999, Math.max(0, p * 4)), i = Math.floor(k), sub = k - i;
    bars.forEach((b, j) => gsap.set(b, isMobile() ? { scaleX: Math.max(0, Math.min(1, k - j)), scaleY: 1 } : { scaleY: Math.max(0, Math.min(1, k - j)), scaleX: 1 }));
    if (i !== cur) {
      const prev = cur; cur = i;
      steps.forEach((s, j) => { if (j === i) gsap.fromTo(s, { opacity: 0, y: prev < i ? 40 : -40 }, { opacity: 1, y: 0, duration: .6, ease: 'power3.out', overwrite: true }); else if (j === prev) gsap.to(s, { opacity: 0, y: prev < i ? -40 : 40, duration: .4, ease: 'power2.in', overwrite: true }); s.classList.toggle('on', j === i); });
      screens.forEach((s, j) => { if (j === i) { s.classList.add('on'); gsap.fromTo(s, { opacity: 0, x: prev < i ? 30 : -30 }, { opacity: 1, x: 0, duration: .5, ease: 'power3.out', overwrite: true }); } else s.classList.remove('on'); });
      gsap.fromTo('#phone', { rotate: prev < i ? -1.5 : 1.5 }, { rotate: 0, duration: .8, ease: 'elastic.out(1,.5)' });
    }
    // 1: type the coin, pick the stock, launch
    const s1 = i > 0 ? 1 : sub;
    nameEl.textContent = NAME.slice(0, Math.round(Math.min(1, s1 * 2.2) * NAME.length));
    tkEl.textContent = s1 > .4 ? TK.slice(0, Math.round(Math.min(1, (s1 - .4) * 5) * TK.length)) : '';
    btn.classList.toggle('done', s1 > .78);
    chip.textContent = i === 0 && s1 <= .78 ? 'New coin' : 'Live';
    chip.classList.toggle('live', !(i === 0 && s1 <= .78));
    // 2: fees fill the ring
    const s2 = i > 1 ? 1 : i === 1 ? sub : 0;
    ring.style.strokeDashoffset = String(201 * (1 - Math.min(1, s2 * 1.15)));
    trRows.forEach((r, j) => { const on = s2 * 10 > j; r.style.opacity = on ? 1 : 0; r.style.transform = on ? 'none' : 'translateY(-14px)'; r.style.transition = 'opacity .35s, transform .35s'; });
    // 3: the pot becomes the stock
    const s3 = i > 2 ? 1 : i === 2 ? sub : 0;
    prog.style.width = Math.min(100, s3 * 125) + '%';
    dot.style.left = `calc(${Math.min(100, s3 * 125)}% - 6px)`;
    bought.classList.toggle('on', s3 > .8);
    stackI.forEach((el, j) => { el.style.transform = s3 * 1.25 * 15 > j + 2 ? 'scale(1)' : 'scale(0)'; el.style.transition = 'transform .35s cubic-bezier(.34,1.56,.64,1)'; });
    // 4: holders get it, pro rata
    const s4 = i === 3 ? sub : 0;
    payRows.forEach((r, j) => { const on = s4 * 6.5 > j; const b = r.querySelector('b i'); b.style.width = on ? b.dataset.w + '%' : '0%'; b.style.transition = 'width .6s cubic-bezier(.2,.7,.2,1)'; const ok = r.querySelector('.ok'); ok.style.opacity = on ? 1 : 0; ok.style.transform = on ? 'scale(1)' : 'scale(.6)'; ok.style.transition = 'opacity .3s, transform .4s cubic-bezier(.34,1.56,.64,1)'; });
  }
  render(0);
  ScrollTrigger.create({ trigger: '#story', start: 'top top', end: () => '+=' + Math.round(innerHeight * (isMobile() ? 2.6 : 3.2)), pin: true, scrub: true, anticipatePin: 1, onUpdate: s => render(s.progress) });
}

// ---------------------------------------------------------------- 02 the shelf
let SHELF = 'top', LIST = [];
function shelfList() {
  const L = LIST.filter(s => s.price != null);
  if (SHELF === 'preipo') return uniqTickers(byLiq(L.filter(s => s.kind === 'preipo')));
  if (SHELF === 'tech') return uniqTickers(byLiq(L.filter(s => s.tags.includes('tech')))).slice(0, 24);
  if (SHELF === 'crypto') return uniqTickers(byLiq(L.filter(s => s.tags.includes('crypto')))).slice(0, 24);
  if (SHELF === 'etf') return uniqTickers(byLiq(L.filter(s => s.kind === 'etf' || s.kind === 'commodity'))).slice(0, 24);
  return uniqTickers(byLiq(L)).slice(0, 24);
}
const PCS = new Set(["aapl", "abnb", "amd", "amzn", "anduril", "anthropic", "app", "arm", "avgo", "ba", "baba", "bmnr", "brk", "coin", "cost", "crcl", "crwv", "dell", "dfdv", "djt", "figureai", "gld", "gme", "googl", "hims", "hood", "ibm", "intc", "ionq", "jpm", "kalshi", "ko", "lly", "mcd", "meta", "mrvl", "msft", "mstr", "mu", "neuralink", "nflx", "nke", "nvda", "openai", "orcl", "oura", "pep", "pltr", "polymarket", "qqq", "rblx", "rddt", "rivn", "rklb", "shop", "skhy", "slv", "snap", "sndk", "spacex", "spcx", "spy", "tqqq", "tsla", "tsm", "ttwo", "unh", "uso", "wmt", "xom"]);
const pcOf = s => { const k = s.ticker.toLowerCase().replace(/\..*$/, ''); return PCS.has(k) ? `/assets/img/pc/${k}.webp` : null; };
const card = s => `<article class="sc${s.kind === 'preipo' ? ' pre' : ''}${pcOf(s) ? ' has-pc' : ''}" data-id="${esc(s.id)}" tabindex="0">${pcOf(s) ? `<img class="pcimg" src="${pcOf(s)}" alt="" loading="lazy" width="300" height="300">` : ''}
  <span class="go">Open the chart, or launch a coin that pays ${esc(s.ticker)} →</span>
  <span class="iss">${s.kind === 'preipo' ? 'Pre-IPO · ' : ''}${esc(s.issuer)}</span>
  <span class="lg">${s.icon ? `<img src="${logo(s.mint)}" alt="" loading="lazy">` : `<span>${esc(s.ticker.slice(0, 4))}</span>`}</span>
  <span class="tkr">${esc(s.ticker)}</span><span class="nm">${esc(s.name)}</span>
  <span class="row"><span class="px">${usd(s.price)}</span><span class="chg ${chgClass(s.chg24)}">${pct(s.chg24)}</span></span></article>`;
let shelfST = null, drawShelf = () => {};
function fillShelf(list) { LIST = list; $('#nAll').textContent = list.length; drawShelf(); }
function shelf() {
  const rail = $('#rail');
  const draw = drawShelf = () => { rail.innerHTML = shelfList().map(card).join(''); tilt(rail); if (!RM) gsap.fromTo($$('.sc', rail), { y: 60, opacity: 0, rotate: 3 }, { y: 0, opacity: 1, rotate: 0, duration: .8, ease: 'power3.out', stagger: .035 }); if (shelfST) ScrollTrigger.refresh(); };
  rail.onclick = e => { const c = e.target.closest('.sc'); if (c) openStock(c.dataset.id); };
  rail.onkeydown = e => { if (e.key === 'Enter') { const c = e.target.closest('.sc'); if (c) openStock(c.dataset.id); } };
  $('#shelfChips').onclick = e => {
    const b = e.target.closest('.chip'); if (!b || b.classList.contains('on')) return;
    $$('#shelfChips .chip').forEach(x => x.classList.toggle('on', x === b)); SHELF = b.dataset.k;
    draw(); if (shelfST) { gsap.set(rail, { x: 0 }); ScrollTrigger.refresh(); }
  };
  $('#browseAll').onclick = () => import('./drawer.js').then(m => m.browse());
  ScrollTrigger.matchMedia({
    '(min-width: 861px)': () => {
      const dist = () => Math.max(0, rail.scrollWidth - innerWidth + 40);
      const tw = gsap.to(rail, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '#stocks', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: .7, invalidateOnRefresh: true, anticipatePin: 1 } });
      shelfST = tw.scrollTrigger;
      return () => { shelfST = null; };
    },
  });
}
on('stocks', ({ list, prev }) => { if (!prev) return; LIST = list; $$('#rail .sc').forEach(el => { const s = list.find(x => x.id === el.dataset.id); if (!s) return; el.querySelector('.px').textContent = usd(s.price); const c = el.querySelector('.chg'); c.textContent = pct(s.chg24); c.className = 'chg ' + chgClass(s.chg24); }); });

// cards lean toward the cursor
function tilt(root) {
  if (RM || matchMedia('(pointer: coarse)').matches) return;
  $$('.sc', root).forEach(c => {
    const rx = gsap.quickTo(c, 'rotationX', { duration: .5, ease: 'power3.out' }), ry = gsap.quickTo(c, 'rotationY', { duration: .5, ease: 'power3.out' }), ty = gsap.quickTo(c, 'y', { duration: .5, ease: 'power3.out' });
    gsap.set(c, { transformPerspective: 700 });
    c.addEventListener('pointermove', e => { const r = c.getBoundingClientRect(); ry(((e.clientX - r.left) / r.width - .5) * 16); rx(-((e.clientY - r.top) / r.height - .5) * 16); ty(-8); });
    c.addEventListener('pointerleave', () => { rx(0); ry(0); ty(0); });
  });
}

// ---------------------------------------------------------------- 03 the split
function split() {
  const segs = $('#dSegs'), items = $$('#legend li'), C = 2 * Math.PI * 80;
  let acc = 0;
  const parts = items.map(li => { const n = +li.querySelector('b').dataset.n, c = li.dataset.c; li.querySelector('i').style.background = c; const p = { n, c, off: acc }; acc += n; return p; });
  segs.innerHTML = parts.map((p, i) => `<circle class="d-seg" data-i="${i}" cx="100" cy="100" r="80" stroke="${p.c}" stroke-dasharray="0 ${C}" stroke-dashoffset="${-C * p.off / 100}"/>`).join('');
  const circles = $$('.d-seg', segs);
  const draw = k => circles.forEach((c, i) => { const p = parts[i], len = Math.max(0, Math.min(p.n, k * 100 - p.off)) / 100 * C; c.setAttribute('stroke-dasharray', `${Math.max(0, len - (len > 3 ? 2.5 : 0))} ${C}`); });
  if (RM) draw(1);
  else ScrollTrigger.create({ trigger: '#split', start: 'top 75%', end: 'center 45%', scrub: .8, onUpdate: s => draw(s.progress) });
  ScrollTrigger.create({ trigger: '#legend', start: 'top 85%', once: true, onEnter: () => items.forEach((li, i) => setTimeout(() => countTo(li.querySelector('b'), parts[i].n, { dur: 1.2 }), i * 120)) });
  const mid = $('#dPct'), lbl = $('#dLbl');
  const hot = i => { circles.forEach((c, j) => c.classList.toggle('hot', j === i)); items.forEach((li, j) => li.classList.toggle('hot', j === i)); if (i == null) { mid.textContent = '100%'; lbl.textContent = 'of the creator fee'; } else { mid.textContent = parts[i].n + '%'; lbl.textContent = items[i].querySelector('em').textContent; } };
  items.forEach((li, i) => { li.addEventListener('pointerenter', () => hot(i)); li.addEventListener('pointerleave', () => hot(null)); });
  circles.forEach((c, i) => { c.style.pointerEvents = 'stroke'; c.addEventListener('pointerenter', () => hot(i)); c.addEventListener('pointerleave', () => hot(null)); });
}

// ---------------------------------------------------------------- 04 the calculator (real fee rate, live prices)
async function calc(list) {
  const cfg = await config();
  const feeBps = cfg && cfg.pumpCreatorFeeBps != null ? cfg.pumpCreatorFeeBps : null, holdersPct = cfg ? cfg.split.holders : 70;
  const picks = uniqTickers(byLiq(list.filter(s => s.price != null))).slice(0, 5);
  const pre = list.find(s => s.kind === 'preipo' && s.price != null && s.ticker === 'SPACEX') || list.find(s => s.kind === 'preipo' && s.price != null);
  if (pre && !picks.some(p => p.ticker === pre.ticker)) picks.splice(2, 0, pre);
  let sel = picks[0];
  const box = $('#cStock');
  box.innerHTML = picks.map((s, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-id="${esc(s.id)}"><img src="${logo(s.mint)}" alt="" loading="lazy">${esc(s.ticker)}</button>`).join('');
  box.onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('button', box).forEach(x => x.classList.toggle('on', x === b)); sel = LIST.find(s => s.id === b.dataset.id) || sel; upd(); gsap.fromTo(b, { scale: .9 }, { scale: 1, duration: .4, ease: 'back.out(3)' }); };
  const vol = $('#cVol'), pc = $('#cPct');
  const V = () => Math.pow(10, 3 + 4 * vol.value / 100), P = () => Math.pow(10, Math.log10(.05) + pc.value / 100 * (Math.log10(20) - Math.log10(.05)));
  const big = $('#oDay');
  function upd() {
    [vol, pc].forEach(r => r.style.setProperty('--p', r.value + '%'));
    const v = V(), p = P();
    $('#oVol').textContent = usd(v, 0); $('#oPct').textContent = (p < 1 ? p.toFixed(2) : p.toFixed(1)) + '%';
    if (feeBps == null || !sel || sel.price == null) { big.textContent = '—'; $('#oShares').textContent = 'live data is loading'; return; }
    const all = v * feeBps / 1e4 * holdersPct / 100, me = all * p / 100;
    big.textContent = usd(me) + ' / day';
    const sh = me / sel.price;
    $('#oShares').textContent = `${sh >= 1 ? sh.toFixed(2) : sh.toPrecision(2)} ${sel.ticker} a day`;
    $('#oWeek').textContent = usd(me * 7); $('#oMonth').textContent = usd(me * 30); $('#oAll').textContent = usd(all);
    $('#oNote').textContent = `creator fee ${(feeBps / 100).toFixed(2)}% (on-chain) · ${holdersPct}% of it buys ${sel.ticker} at ${usd(sel.price)} · math on your numbers, not a promise`;
  }
  vol.oninput = pc.oninput = upd; upd();
  on('stocks', ({ list }) => { sel = list.find(s => s.id === sel.id) || sel; upd(); });
}

// ---------------------------------------------------------------- 03 the market map: every stock, sized by liquidity, colored by its day
let MAPK = 'all', MAPL = [], mapShown = false;
function squarify(items, x, y, w, h) {
  const out = [], total = items.reduce((a, b) => a + b.v, 0); if (!total) return out;
  const scale = w * h / total; let rest = items.map(i => ({ ...i, a: i.v * scale })), rx = x, ry = y, rw = w, rh = h;
  while (rest.length) {
    const sh = Math.min(rw, rh); let row = [], best = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const r = [...row, rest[i]], sum = r.reduce((a, b) => a + b.a, 0);
      const worst = Math.max(...r.map(t => Math.max(sh * sh * t.a / (sum * sum), sum * sum / (sh * sh * t.a))));
      if (worst > best && row.length) break; best = worst; row = r;
    }
    const sum = row.reduce((a, b) => a + b.a, 0);
    if (rw >= rh) { const cw = sum / rh; let yy = ry; for (const t of row) { const th = t.a / cw; out.push({ ...t, x: rx, y: yy, w: cw, h: th }); yy += th; } rx += cw; rw -= cw; }
    else { const ch = sum / rw; let xx = rx; for (const t of row) { const tw = t.a / ch; out.push({ ...t, x: xx, y: ry, w: tw, h: ch }); xx += tw; } ry += ch; rh -= ch; }
    rest = rest.slice(row.length);
  }
  return out;
}
const heat = c => { if (c == null || !isFinite(c)) return '#13268a'; const k = Math.min(1, Math.abs(c) / 6); return c >= 0 ? `hsl(152 ${50 + k * 25}% ${20 + k * 16}%)` : `hsl(3 ${58 + k * 22}% ${27 + k * 17}%)`; };
function mapList() {
  const L = MAPL.filter(s => s.price != null && s.liq);
  const f = MAPK === 'all' ? L : MAPK === 'preipo' ? L.filter(s => s.kind === 'preipo') : MAPK === 'etf' ? L.filter(s => s.kind === 'etf' || s.kind === 'commodity') : L.filter(s => s.tags.includes(MAPK));
  return uniqTickers(byLiq(f)).slice(0, isMobile() ? 34 : 64);
}
function drawMap(animate) {
  const box = $('#mapBox'); if (!box || !MAPL.length) return;
  const W = box.clientWidth, H = box.clientHeight, G = 3;
  const items = mapList().map(s => ({ s, v: Math.sqrt(s.liq) }));
  const rects = squarify(items, 0, 0, W, H);
  box.innerHTML = rects.map(r => {
    const s = r.s, fs = Math.max(12, Math.min(30, r.w / 6.2, r.h / 3.2)), fits = r.h > 54 && (s.ticker.length * fs * .64 + 40) < r.w, xs = r.w < 46 || r.h < 40;
    return `<div class="mt${fits ? '' : ' s'}${xs ? ' xs' : ''}${s.kind === 'preipo' ? ' pre' : ''}" data-id="${esc(s.id)}" title="${esc(s.ticker)} · ${esc(s.name)} · ${pct(s.chg24)}" style="--fs:${fs.toFixed(1)}px;left:${(r.x + G / 2).toFixed(1)}px;top:${(r.y + G / 2).toFixed(1)}px;width:${Math.max(0, r.w - G).toFixed(1)}px;height:${Math.max(0, r.h - G).toFixed(1)}px;background:${heat(s.chg24)}">
      <div class="tp">${s.icon ? `<img src="${logo(s.mint)}" alt="" loading="lazy">` : ''}<b>${esc(s.ticker)}</b></div><span class="p">${pct(s.chg24)}</span></div>`;
  }).join('');
  if (animate && !RM) gsap.fromTo($$('.mt', box), { scale: .3, opacity: 0 }, { scale: 1, opacity: 1, duration: .7, ease: 'back.out(1.6)', stagger: { each: .012, from: 'start' } });
}
function movers() {
  const L = uniqTickers(MAPL.filter(s => s.chg24 != null && s.liq > 15000));
  const chip = s => `<span class="mvc" data-id="${esc(s.id)}"><img src="${logo(s.mint)}" alt="" loading="lazy">${esc(s.ticker)} <span class="${s.chg24 >= 0 ? 'u' : 'd'}">${pct(s.chg24, 1)}</span></span>`;
  $('#mvUp').innerHTML = L.slice().sort((a, b) => b.chg24 - a.chg24).slice(0, 7).map(chip).join('');
  $('#mvDn').innerHTML = L.slice().sort((a, b) => a.chg24 - b.chg24).slice(0, 7).map(chip).join('');
}
function mapSec() {
  $('#mapBox').onclick = e => { const t = e.target.closest('.mt'); if (t) openStock(t.dataset.id); };
  $('.movers').onclick = e => { const t = e.target.closest('.mvc'); if (t) openStock(t.dataset.id); };
  $('#mapChips').onclick = e => { const b = e.target.closest('.chip'); if (!b || b.classList.contains('on')) return; $$('#mapChips .chip').forEach(x => x.classList.toggle('on', x === b)); MAPK = b.dataset.k; drawMap(true); };
  ScrollTrigger.create({ trigger: '#mapBox', start: 'top 85%', once: true, onEnter: () => { mapShown = true; drawMap(true); } });
  let rt = null; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => drawMap(false), 200); });
}
function fillMap(list) { MAPL = list; movers(); if (mapShown) drawMap(false); }
on('stocks', ({ list, prev }) => { if (!prev) return; MAPL = list; if (mapShown) drawMap(false); movers(); });

// ---------------------------------------------------------------- 06 live: coins, payouts, engine
const KIND = { claim: 'fees in', buy: 'bought', pay: 'paid', milk: 'for $MILK', burn: 'burned' };
async function live() {
  const tabs = $('#liveTabs'), panes = { coins: $('#lpCoins'), payouts: $('#lpPayouts'), engine: $('#lpEngine') };
  tabs.onclick = e => { const b = e.target.closest('.chip'); if (!b || b.classList.contains('on')) return; $$('.chip', tabs).forEach(x => x.classList.toggle('on', x === b)); Object.entries(panes).forEach(([k, el]) => { el.hidden = k !== b.dataset.t; }); const el = panes[b.dataset.t]; if (!RM) gsap.fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .5, ease: 'power3.out' }); ScrollTrigger.refresh(); };
  const grid = $('#cgrid'), t = $('#ltable'), eng = $('#engBox');
  let counted = false, ST = null;
  const draw = async () => {
    const [r, ev, e, st, cfg, list] = await Promise.all([api.get('coins').catch(() => null), api.get('events', { limit: 14 }).catch(() => null), api.get('engine').catch(() => null), api.get('stats').catch(() => null), config(), stocks().catch(() => [])]);
    if (st) {
      ST = st;
      if (st.coins && (!st.lastTick || Date.now() - st.lastTick > 10 * 60e3)) fetch('/api/tick').catch(() => {});
      if (counted) { $('#sCoins').textContent = num(st.coins); $('#sClaimed').textContent = st.claimed.toFixed(2); $('#sBought').textContent = st.bought.toFixed(2); $('#sHolders').textContent = num(st.holdersPaid); $('#mAside').textContent = st.milk.toFixed(3); $('#mBurn').textContent = num(st.burned / 1e6); }
    }
    if (r) {
      grid.innerHTML = !r.coins.length ? `<div class="empty"><img src="/assets/img/pc/drop.webp" alt="" width="180" height="180"><div><h3>The first cow is yours.</h3><p>No coins yet. Launch one and its holders get paid first.</p><a class="btn btn-white btn-lg mag" href="/launch" data-link>Launch a coin <i class="arr">→</i></a></div></div>`
        : r.coins.map(c => { const s = list.find(x => x.id === c.stock.id) || {}, mc = c.curve && r.usd ? c.curve.mcap * r.usd : null, prog = c.curve ? Math.round(c.curve.progress * 100) : null;
          return `<a class="cc" href="/coin/${c.coin}" data-link><div class="cc-top"><img src="${c.image}" alt="" loading="lazy"><div><b>${esc(c.name)}</b><span>$${esc(c.symbol)}</span></div></div><span class="pays">${s.mint ? `<img src="${logo(s.mint)}" alt="">` : ''}pays ${esc(c.stock.ticker)}</span><div class="cc-nums"><div><span>market cap</span><b>${usd(mc)}</b></div><div><span>fees claimed</span><b>${sol(c.claimed)}</b></div></div><div><div class="prog"><i style="transform:scaleX(${c.curve ? (c.curve.complete ? 1 : c.curve.progress) : 0})"></i></div><span class="muted" style="font-size:12px">${c.curve ? (c.curve.complete ? 'graduated' : prog + '% to graduation') : '—'}</span></div></a>`; }).join('');
      magnetic(grid);
    }
    if (ev) t.innerHTML = !ev.events.length ? `<div class="lempty"><b>No payouts yet.</b>The first one lands here, with its transaction.</div>`
      : `<div class="lr h"><span>what</span><span>coin</span><span>amount</span><span class="hide-s">when</span><span class="hide-m">tx</span></div>` + ev.events.map(x => `<div class="lr"><span class="kind k-${x.kind}">${KIND[x.kind] || x.kind}</span><span class="mono">${x.coin ? `<a href="/coin/${x.coin}" data-link>${short(x.coin)}</a>` : '—'}${x.kind === 'pay' ? ' → ' + short(x.who) : ''}</span><span class="mono">${esc(x.kind === 'pay' || x.kind === 'burn' ? (x.note || 'tokens') : sol(x.lamports / 1e9))}</span><span class="mono hide-s">${ago(x.at)}</span><span class="hide-m">${x.sig ? `<a href="${solscan(x.sig)}" target="_blank" rel="noopener">view</a>` : '—'}</span></div>`).join('');
    if (e) eng.innerHTML = `<div class="wide"><span>Engine wallet</span><a href="${solscan(e.address, 'account')}" target="_blank" rel="noopener">${esc(e.address)}</a></div><div><span>Balance</span><b>${e.balance != null ? e.balance.toFixed(3) : '—'}</b></div><div><span>Last run</span><b>${e.lastTick ? ago(e.lastTick) : '—'}</b></div><div><span>Round size</span><b>${cfg ? cfg.roundMin + ' SOL' : '—'}</b></div><div><span>Holder minimum</span><b>${cfg ? cfg.minHoldPct + '%' : '—'}</b></div><div class="wide"><span>Next run</span><b id="nextRun">${e.lastTick ? '' : 'every 5 min'}</b></div>`;
  };
  setInterval(() => { const el = $('#nextRun'); if (!el || !ST || !ST.lastTick) return; const left = Math.max(0, ST.lastTick + 300e3 - Date.now()); el.textContent = left ? Math.floor(left / 60e3) + ':' + String(Math.floor(left / 1e3) % 60).padStart(2, '0') : 'due now'; }, 1000);
  await draw(); setInterval(() => { if (!document.hidden && !$('#home').hidden) draw(); }, 20000);
  ScrollTrigger.create({ trigger: '#live', start: 'top 80%', once: true, onEnter: () => { counted = true; if (!ST) return; countTo($('#sCoins'), ST.coins); countTo($('#sClaimed'), ST.claimed, { fmt: v => v.toFixed(2) }); countTo($('#sBought'), ST.bought, { fmt: v => v.toFixed(2) }); countTo($('#sHolders'), ST.holdersPaid); } });
  ScrollTrigger.create({ trigger: '#milk', start: 'top 80%', once: true, onEnter: () => { if (!ST) return; countTo($('#mAside'), ST.milk, { fmt: v => v.toFixed(3) }); countTo($('#mBurn'), ST.burned / 1e6, { fmt: v => num(v) }); } });
}

// ---------------------------------------------------------------- 07 your bag: any wallet's MILK coins and the stock MILK paid it
function bag() {
  const f = $('#bagForm'), inp = $('#bagIn'), out = $('#bagOut'), mine = $('#bagMine');
  const check = async addr => {
    addr = (addr || '').trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) { toast('That is not a Solana address.', true); return; }
    out.innerHTML = '<div class="bcard"><p class="bnone">Reading the chain…</p></div>';
    try {
      const r = await api.get('bag', { owner: addr });
      const totalUsd = r.stocks.reduce((a, s) => a + (s.usd || 0), 0);
      out.innerHTML = `<div class="bcard"><h4>MILK coins held</h4>${r.coins.length ? r.coins.map(c => `<a class="brow" href="/coin/${c.coin}" data-link><img src="${c.image}" alt=""><div><b>$${esc(c.symbol)}</b><span>pays ${esc(c.pays)}</span></div><div class="r">${c.pct >= .01 ? c.pct.toFixed(2) : '<0.01'}%<br><span style="font-size:11.5px">${c.paidOut ? 'gets paid' : 'below min'}</span></div></a>`).join('') : '<p class="bnone">None yet.</p>'}</div>
        <div class="bcard"><h4>Stock received from MILK</h4>${r.stocks.length ? `<div class="bbig">${usd(totalUsd)}</div>` + r.stocks.map(s => `<div class="brow"><img src="${logo(s.mint)}" alt=""><div><b>${esc(s.ticker)}</b><span>${s.amount != null ? s.amount.toPrecision(4) : '—'}</span></div><div class="r">${usd(s.usd)}</div></div>`).join('') : '<p class="bnone">Nothing yet.</p>'}</div>`;
      if (!RM) gsap.from($$('.bcard', out), { y: 24, opacity: 0, duration: .6, ease: 'power3.out', stagger: .08 });
    } catch (e) { out.innerHTML = `<div class="bcard"><p class="bnone">${esc(e.message)}</p></div>`; }
  };
  f.addEventListener('submit', e => { e.preventDefault(); check(inp.value); });
  on('wallet', w => { mine.hidden = !w; });
  mine.onclick = () => { const w = window.__milkWallet && window.__milkWallet(); if (w) { inp.value = w.address; check(w.address); } };
}

// the dice: a random stock, straight into a launch
function surprise(listP) {
  $('#surprise').addEventListener('click', async () => {
    const l = featured(await listP).slice(0, 60); if (!l.length) return;
    const s = l[Math.floor(Math.random() * l.length)];
    toast(`${s.ticker} it is.`);
    setTimeout(() => { const a = document.createElement('a'); a.href = '/launch?stock=' + encodeURIComponent(s.id); a.setAttribute('data-link', ''); document.body.appendChild(a); a.click(); a.remove(); }, 650);
  });
}

async function milkBand() {
  const cfg = await config();
  if (cfg && cfg.ca) { $('#ca').hidden = false; $('#caTxt').textContent = cfg.ca; $('#caCopy').onclick = () => copy(cfg.ca); }
  if (cfg && cfg.x) { const x = $('#xLink'); x.hidden = false; x.href = cfg.x.startsWith('http') ? cfg.x : 'https://x.com/' + cfg.x.replace(/^@/, ''); }
  drip($('#dripCv'));
}
// a pixel milk drop that keeps dripping into a puddle
function drip(cv) {
  const g = cv.getContext('2d'), P = 6, W = cv.width / P | 0, H = cv.height / P | 0;
  const DROP = ['.......##.......', '......####......', '......####......', '.....######.....', '.....######.....', '....########....', '...##########...', '...##########...', '..############..', '..##WW########..', '.###WW#########.', '.###W##########.', '.##############.', '.##############.', '.##############.', '..############..', '..############..', '...##########...', '.....######.....'];
  const S = 3, ox = (W - 16 * S) / 2 | 0, oy = 4;
  const drops = [], splash = [];
  let t0 = 0, vis = false, puddle = 0;
  new IntersectionObserver(([e]) => vis = e.isIntersecting).observe(cv);
  const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x * P, y * P, P, P); };
  function frame(now) {
    requestAnimationFrame(frame);
    if (!vis || now - t0 < 40) return; t0 = now;
    g.clearRect(0, 0, cv.width, cv.height);
    const wob = Math.sin(now / 500) * .6;
    const cell = (x, y) => DROP[y] && DROP[y][x] && DROP[y][x] !== '.';
    DROP.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '.') return; const dy = y > 12 ? Math.round(wob) : 0; for (const [ex, ey] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (!cell(x + ex, y + ey)) for (let a = 0; a < S; a++) px(ox + (x + ex) * S + (ex ? (ex < 0 ? S - 1 : 0) : a), oy + (y + ey) * S + (ey ? (ey < 0 ? S - 1 : 0) : a) + dy, '#0d1020'); }));
    DROP.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '.') return; for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const X = ox + x * S + a, Y = oy + y * S + b + (y > 12 ? Math.round(wob) : 0); px(X, Y, ch === 'W' ? '#cfe0ff' : '#ffffff'); } }));
    if (Math.random() < .09 && drops.length < 5) drops.push({ x: W / 2 - 1 + ((Math.random() * 6) | 0) - 3, y: oy + 19 * S, v: .2 });
    const floor = H - 10;
    for (const d of drops) { d.v += .09; d.y += d.v; if (d.y >= floor - 2) { d.dead = true; puddle = Math.min(1, puddle + .08); for (let i = 0; i < 6; i++) splash.push({ x: d.x, y: floor - 1, vx: (Math.random() - .5) * 1.6, vy: -Math.random() * 1.8, life: 18 }); } }
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);
    drops.forEach(d => { for (const [a, b] of [[-1, 0], [2, 0], [-1, -1], [2, -1], [-1, 1], [2, 1], [0, -2], [1, -2], [0, 2], [1, 2]]) px((d.x | 0) + a, (d.y | 0) + b, '#0d1020'); px(d.x | 0, d.y | 0, '#fff'); px((d.x | 0) + 1, d.y | 0, '#fff'); px(d.x | 0, (d.y | 0) - 1, '#fff'); px((d.x | 0) + 1, (d.y | 0) - 1, '#cfe0ff'); px(d.x | 0, (d.y | 0) + 1, '#fff'); px((d.x | 0) + 1, (d.y | 0) + 1, '#fff'); });
    splash.forEach(s => { s.vy += .15; s.x += s.vx; s.y += s.vy; s.life--; if (s.y < floor) px(s.x | 0, s.y | 0, '#fff'); });
    for (let i = splash.length - 1; i >= 0; i--) if (splash[i].life <= 0) splash.splice(i, 1);
    const pw = Math.round(14 + puddle * 26);
    for (let x = -pw - 1; x <= pw + 1; x++) px((W / 2 | 0) + x, floor + 2, '#0d1020');
    for (let x = -pw; x <= pw; x++) { const h = x * x < (pw - 6) * (pw - 6) ? 2 : 1; for (let y = 0; y < h; y++) px((W / 2 | 0) + x, floor + 2 - h + y, '#ffffff'); }
    puddle = Math.max(0, puddle - .002);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- 08 FAQ
const QA = [
  ['What is MILK?', 'A pump.fun launchpad where every coin pays its holders in a real stock, bought with its own trading fees.'],
  ['Where does the money come from?', 'pump.fun\'s creator fee on every trade. MILK coins share it on-chain: 10% to the creator, 90% to the engine.'],
  ['Can the split change?', 'No. It is set in pump.fun\'s fee sharing at launch and the admin is revoked in the same transaction.'],
  ['Who gets paid?', 'Holders with at least 0.05% of the supply, pro rata, each time a coin\'s pot reaches 0.1 SOL. Nothing to claim.'],
  ['Which stocks?', '137 tokenized stocks, funds and pre-IPO names on Solana, from xStocks, Backpack, PreStocks, Tessera and Ondo.'],
  ['What is $MILK?', '15% of every coin\'s fees buys $MILK and burns it.'],
  ['Who holds the keys?', 'You sign your launch with your own wallet. The engine only spends fees by the rules above, and every transaction is on the ledger.'],
  ['Any limits?', 'Issuers set their own rules (xStocks are not offered to US persons) and pre-IPO tokens carry a 1% transfer fee. Not financial advice.'],
];
function faq() {
  const box = $('#qa');
  box.innerHTML = QA.map(([q, a], i) => `<div class="q rv"><button type="button" aria-expanded="false" aria-controls="qa${i}">${esc(q)}<i>+</i></button><div class="a" id="qa${i}" role="region"><p>${esc(a)}</p></div></div>`).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const q = b.parentElement, a = q.querySelector('.a'), open = !q.classList.contains('open');
    q.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
    a.style.height = open ? a.scrollHeight + 'px' : '0px';
    setTimeout(() => ScrollTrigger.refresh(), 480);
  });
}

// ---------------------------------------------------------------- 09 end: the computers marquee and the giant wordmark
function end() {
  const tr = $('#pcsTrack');
  const tiles = ['nvda', 'tsla', 'drop', 'aapl', 'spcx', 'meta', 'msft', 'googl', 'amzn', 'coin', 'hood', 'pltr', 'nflx', 'mstr'];
  const COL = ['#8fc8ff', '#f3ecdc', '#f7a83a', '#8f63f5', '#f2667f', '#ffd23f'];
  const row = tiles.map((t, i) => `<span class="pt" style="background:${COL[i % COL.length]}"><img src="/assets/img/pc/${t}.webp" alt="" loading="lazy" width="177" height="177"></span>`).join('');
  tr.innerHTML = row + row;
  let x = 0, half = 0;
  new ResizeObserver(() => { half = tr.scrollWidth / 2; }).observe(tr);
  if (!RM) gsap.ticker.add((t, dt) => { const v = lenis ? Math.min(40, Math.abs(lenis.velocity || 0)) : 0; x -= (.5 + v * .45) * dt / 16; if (half && -x > half) x += half; tr.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`; });
  if (!RM) gsap.from('.mega span', { yPercent: 70, opacity: 0, ease: 'power3.out', stagger: .08, scrollTrigger: { trigger: '.mega', start: 'top 95%', end: 'top 45%', scrub: .8 } });
}

// ---------------------------------------------------------------- the big bands: words that run faster while you scroll
function band(el, html, dir = -1) {
  el.innerHTML = html + html;
  let x = 0, half = 0; new ResizeObserver(() => { half = el.scrollWidth / 2; }).observe(el);
  if (RM) return;
  let vis = false; new IntersectionObserver(([e]) => vis = e.isIntersecting).observe(el);
  gsap.ticker.add((t, dt) => { if (!vis) return; const v = lenis ? Math.min(60, Math.abs(lenis.velocity || 0)) : 0; x += dir * (.7 + v * .5) * dt / 16; if (half) { if (-x > half) x += half; if (x > 0) x -= half; } el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`; });
}
function bands(list) {
  band($('#band1'), '<span>Every coin is a</span><span class="o">cash cow</span><i>✦</i>', -1);
  const picks = list && list.length ? featured(list).filter(s => s.icon).slice(0, 8) : [];
  band($('#band2'), (picks.length ? picks : [{ ticker: 'NVDA' }, { ticker: 'SPACEX' }, { ticker: 'TSLA' }]).map(s => `<span>paid in</span>${s.mint ? `<img src="${logo(s.mint)}" alt="">` : ''}<span class="o">${esc(s.ticker)}</span><i>✦</i>`).join(''), 1);
}

// ---------------------------------------------------------------- nav: active section, light/dark, hide on scroll down
function navWatch() {
  const nav = $('#nav'), links = $$('.links a'), ink = $('.links .ink');
  const LIGHT = ['#milk'];
  const setInk = a => { if (!a) { ink.style.opacity = 0; links.forEach(l => l.classList.remove('on')); return; } const r = a.getBoundingClientRect(), p = a.parentElement.getBoundingClientRect(); ink.style.opacity = 1; ink.style.width = r.width + 'px'; ink.style.transform = `translateX(${r.left - p.left}px)`; links.forEach(l => l.classList.toggle('on', l === a)); };
  const secs = ['#how', '#stocks', '#map', '#split', '#live', '#bag'];
  secs.forEach(id => ScrollTrigger.create({ trigger: id, start: 'top 55%', end: 'bottom 55%', onToggle: s => { if (s.isActive) setInk(links.find(l => l.getAttribute('href') === '/' + id)); } }));
  ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom 55%', onToggle: s => { if (s.isActive) setInk(null); } });
  ScrollTrigger.create({ trigger: '#end', start: 'top 55%', onToggle: s => { if (s.isActive) setInk(null); } });
  LIGHT.forEach(id => ScrollTrigger.create({ trigger: id, start: 'top 40px', end: 'bottom 40px', onToggle: s => nav.classList.toggle('on-light', s.isActive) }));
  let last = 0;
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => { const y = s.scroll(); nav.classList.toggle('solid', y > 40); if (Math.abs(y - last) > 6) { nav.classList.toggle('hide', y > last && y > innerHeight * .9); last = y; } } });
}

export async function home() {
  const listP = stocks().catch(() => []);
  await hero();
  story(); shelf(); mapSec(); split(); faq(); end();
  revealAll($('#home'));
  magnetic();
  navWatch();
  live(); bag(); milkBand(); surprise(listP);
  listP.then(async list => {
    $('#nStocks').textContent = list.length || '137';
    if (PC && PC.setStocks) PC.setStocks(featured(list).slice(0, 14).map(s => s.ticker));
    orbit(list); tape(list); fillShelf(list); fillMap(list); bands(list); await calc(list).catch(() => {});
    if (ORB_WANT) orbitIn();
    ScrollTrigger.refresh();
  });
  ScrollTrigger.refresh();
}
