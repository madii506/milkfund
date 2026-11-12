// the home page: hero (live 3D computer, real company logos, live tape), how it works (the phone plays it),
// stocks (cards or the market map), the split + the math, live (coins, payouts, engine, your bag), $MILK, FAQ, end.
import { $, $$, esc, api, logo, usd, pct, chgClass, sol, num, ago, short, solscan, stocks, config, on, reduced, toast, copy } from './core.js';
import { gsap, ScrollTrigger, lenis, revealAll, countTo, magnetic, splitWords } from './motion.js';
import { openStock } from './drawer.js';

const RM = reduced();
const isMobile = () => innerWidth < 861;
let PC = null, LIST = [];

// ---------------------------------------------------------------- picks from the live catalog
const byLiq = l => l.slice().sort((a, b) => (b.liq || 0) - (a.liq || 0));
function uniqTickers(list) { const seen = new Set(), out = []; for (const s of list) { if (seen.has(s.ticker)) continue; seen.add(s.ticker); out.push(s); } return out; }
const featured = l => uniqTickers(byLiq(l).filter(s => s.price != null));

// ---------------------------------------------------------------- hero
function hero() {
  addEventListener('pointermove', e => { if (PC) PC.setMouse(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1); }, { passive: true });
  new IntersectionObserver(([en]) => PC && PC.setVisible(en.isIntersecting)).observe($('#hero'));
  ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true, onUpdate: s => PC && PC.setScroll(s.progress * .6) });
  if (!RM) gsap.to('.hero-in', { yPercent: -12, opacity: .3, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
}
// the 3D computer loads once the intro is over, so the intro never stutters; it fades in when ready
let PC_STARTED = false;
async function startPC() {
  if (PC_STARTED) return; PC_STARTED = true;
  const cv = $('#pc');
  try {
    if (!window.WebGLRenderingContext) throw new Error('no webgl');
    const mod = await import('./pc3d.js?v=2');
    PC = mod.start({ canvas: cv, stocks: null, lite: /[?&]shot\b/.test(location.search) });
    PC.setIntro(0); PC.startTerminal();
    if (LIST.length && PC.setStocks) PC.setStocks(featured(LIST).slice(0, 14).map(s => s.ticker));
    if (!RM) gsap.fromTo(cv, { opacity: 0, scale: .94, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 1.2, ease: 'expo.out' }); else gsap.set(cv, { opacity: 1 });
  } catch (e) { cv.replaceWith(Object.assign(document.createElement('img'), { src: '/assets/img/pfp.webp', className: 'pc-fallback', alt: '' })); PC = null; }
}

// the hero comes in once the intro has flooded the screen blue
let HERO_ON = false;
export function heroIn() {
  if (HERO_ON) return; HERO_ON = true;
  const words = splitWords($('.h-hero'));
  startPC();
  if (RM) { gsap.set(['#nav', '.hero .rv', '.tape'], { opacity: 1 }); gsap.set(words, { yPercent: 0 }); orbitIn(); return; }
  const tl = gsap.timeline();
  tl.fromTo('#nav', { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: .8, ease: 'power3.out', clearProps: 'transform' }, .1)
    .fromTo(words, { yPercent: 115, rotate: 4 }, { yPercent: 0, rotate: 0, duration: 1.1, ease: 'expo.out', stagger: .06 }, .1)
    .fromTo('.hero .rv', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .08 }, .35)
    .fromTo('.tape', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .9, ease: 'power3.out' }, .5)
    .add(orbitIn, .3);
}
export function heroHide() { gsap.set(['#nav', '.hero .rv', '.tape', '#pc'], { opacity: 0 }); gsap.set(splitWords($('.h-hero')), { yPercent: 115 }); }

// real company logos floating around the computer
const ORB = [];
function orbit(list) {
  const box = $('#orbit');
  const pick = featured(list).filter(s => s.icon).slice(0, 7);
  for (const p of uniqTickers(list.filter(s => s.kind === 'preipo' && s.icon && s.price != null)).slice(0, 2)) pick.splice(2, 0, p);
  box.innerHTML = ''; ORB.length = 0;
  pick.slice(0, 9).forEach((s, i) => {
    const el = document.createElement('button');
    el.className = 'ob'; el.type = 'button'; el.title = s.ticker + ' · ' + s.name; el.style.pointerEvents = 'auto';
    el.innerHTML = `<img src="${logo(s.mint)}" alt="${esc(s.ticker)}" loading="lazy">`;
    el.addEventListener('click', () => openStock(s.id));
    box.appendChild(el);
    ORB.push({ el, a: i / 9 * Math.PI * 2 + .4, r: .85 + (i % 3) * .14, z: .5 + (i % 4) * .2, s: 46 + (i % 3) * 12, ph: Math.random() * 6 });
  });
  layoutOrbit();
  if (ORB_WANT) orbitIn();
}
let MX = 0, MY = 0;
addEventListener('pointermove', e => { MX = e.clientX / innerWidth - .5; MY = e.clientY / innerHeight - .5; }, { passive: true });
function layoutOrbit() {
  const W = innerWidth, H = $('#hero').offsetHeight, m = isMobile();
  const cx = m ? W * .5 : W * .735, cy = m ? H * .73 : H * .5, rx = m ? W * .4 : Math.min(W * .2, 330), ry = m ? H * .15 : Math.min(H * .32, 290);
  ORB.forEach((o, i) => { Object.assign(o, { cx, cy, rx, ry, minX: m ? 8 : W * .565, maxX: W - 16, minY: m ? H * .6 : 96, maxY: H - 150 }); const sz = m ? o.s * .78 : o.s; o.el.style.width = o.el.style.height = sz + 'px'; o.sz = sz; o.el.style.display = m && i > 5 ? 'none' : ''; });
}
addEventListener('resize', layoutOrbit);
let ORB_ON = false, ORB_WANT = false;
function orbitIn() {
  ORB_WANT = true; if (!ORB.length || ORB_ON) return;
  ORB_ON = true;
  ORB.forEach((o, i) => gsap.fromTo(o.el, { opacity: 0, scale: .2 }, { opacity: 1, scale: 1, duration: .9, ease: 'back.out(2)', delay: i * .07 }));
  if (RM) return;
  gsap.ticker.add(() => {
    if (scrollY > innerHeight * 1.2) return;
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

// a strip that moves on its own, faster while you scroll
function marquee(el, speed = .9) {
  let x = 0, half = 0; new ResizeObserver(() => { half = el.scrollWidth / 2; }).observe(el);
  let hover = false; el.addEventListener('pointerenter', () => hover = true); el.addEventListener('pointerleave', () => hover = false);
  let vis = true; new IntersectionObserver(([e]) => vis = e.isIntersecting).observe(el);
  if (RM) return;
  gsap.ticker.add((t, dt) => { if (!vis) return; const v = lenis ? Math.min(40, Math.abs(lenis.velocity || 0)) : 0; x -= (hover ? .15 : speed + v * .6) * dt / 16; if (half && -x > half) x += half; el.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`; });
}
function tape(list) {
  const tr = $('#tape .tape-track');
  const items = featured(list).slice(0, 26);
  if (!items.length) { tr.innerHTML = '<span class="ti">—</span>'; return; }
  const row = items.map(s => `<span class="ti" data-id="${esc(s.id)}"><img src="${logo(s.mint)}" alt="" loading="lazy" width="24" height="24"><b>${esc(s.ticker)}</b><span class="p" data-p>${usd(s.price)}</span><span class="chg ${chgClass(s.chg24)}" data-c>${pct(s.chg24)}</span></span>`).join('');
  tr.innerHTML = row + row;
  tr.onclick = e => { const t = e.target.closest('.ti'); if (t) openStock(t.dataset.id); };
  marquee(tr);
}
on('stocks', ({ list, prev }) => {
  if (!prev) return;
  LIST = list;
  const old = new Map(prev.map(s => [s.id, s.price]));
  $$('#tape .ti').forEach(el => {
    const s = list.find(x => x.id === el.dataset.id); if (!s) return;
    const p = el.querySelector('[data-p]'), c = el.querySelector('[data-c]'), was = old.get(s.id);
    if (p.textContent !== usd(s.price)) { p.textContent = usd(s.price); el.classList.remove('flash-up', 'flash-dn'); void el.offsetWidth; el.classList.add(s.price > was ? 'flash-up' : 'flash-dn'); }
    c.textContent = pct(s.chg24); c.className = 'chg ' + chgClass(s.chg24);
  });
  $$('#sgrid2 .sk2').forEach(el => { const s = list.find(x => x.id === el.dataset.id); if (!s) return; el.querySelector('.px').textContent = usd(s.price); const c = el.querySelector('.chg'); c.textContent = pct(s.chg24); c.className = 'chg ' + chgClass(s.chg24); });
  if (VIEW === 'map') drawMap(false);
});

// ---------------------------------------------------------------- 01 how it works: the phone plays the four steps
function how() {
  const items = $$('#hsteps li'), bars = $$('#hsteps .bar i'), screens = $$('.ps'), chip = $('#phChip');
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
  function render(i, sub) {
    bars.forEach((b, j) => { b.style.width = j === i ? (sub * 100) + '%' : '0%'; });
    if (i !== cur) {
      const prev = cur; cur = i;
      items.forEach((li, j) => li.classList.toggle('on', j === i));
      screens.forEach((s, j) => { if (j === i) { s.classList.add('on'); gsap.fromTo(s, { opacity: 0, x: prev < i ? 30 : -30 }, { opacity: 1, x: 0, duration: .5, ease: 'power3.out', overwrite: true }); } else s.classList.remove('on'); });
      if (!RM) gsap.fromTo('#phone', { rotate: prev < i ? -1.5 : 1.5 }, { rotate: 0, duration: .8, ease: 'elastic.out(1,.5)' });
    }
    const s1 = i > 0 ? 1 : sub;
    nameEl.textContent = NAME.slice(0, Math.round(Math.min(1, s1 * 2.2) * NAME.length));
    tkEl.textContent = s1 > .4 ? TK.slice(0, Math.round(Math.min(1, (s1 - .4) * 5) * TK.length)) : '';
    btn.classList.toggle('done', s1 > .78);
    chip.textContent = i === 0 && s1 <= .78 ? 'New coin' : 'Live'; chip.classList.toggle('is-live', !(i === 0 && s1 <= .78));
    const s2 = i > 1 ? 1 : i === 1 ? sub : 0;
    ring.style.strokeDashoffset = String(201 * (1 - Math.min(1, s2 * 1.15)));
    trRows.forEach((r, j) => { const on = s2 * 10 > j; r.style.opacity = on ? 1 : 0; r.style.transform = on ? 'none' : 'translateY(-14px)'; r.style.transition = 'opacity .35s, transform .35s'; });
    const s3 = i > 2 ? 1 : i === 2 ? sub : 0;
    prog.style.width = Math.min(100, s3 * 125) + '%'; dot.style.left = `calc(${Math.min(100, s3 * 125)}% - 6px)`;
    bought.classList.toggle('on', s3 > .8);
    stackI.forEach((el, j) => { el.style.transform = s3 * 1.25 * 15 > j + 2 ? 'scale(1)' : 'scale(0)'; el.style.transition = 'transform .35s cubic-bezier(.34,1.56,.64,1)'; });
    const s4 = i === 3 ? sub : 0;
    payRows.forEach((r, j) => { const on = s4 * 6.5 > j; const b = r.querySelector('b i'); b.style.width = on ? b.dataset.w + '%' : '0%'; b.style.transition = 'width .6s cubic-bezier(.2,.7,.2,1)'; const ok = r.querySelector('.ok'); ok.style.opacity = on ? 1 : 0; ok.style.transform = on ? 'scale(1)' : 'scale(.6)'; ok.style.transition = 'opacity .3s, transform .4s cubic-bezier(.34,1.56,.64,1)'; });
  }
  // autoplay: each step takes 3.4 s; a click jumps there; it only runs while you can see it
  const STEP = 3.4; let i = 0, t = 0, vis = false, last = 0;
  render(0, 0);
  $('#hsteps').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; i = +b.dataset.i; t = 0; render(i, 0); });
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; }, { threshold: .35 }).observe($('#how'));
  if (RM) { render(3, 1); return; }
  gsap.ticker.add(() => {
    const now = performance.now(), dt = Math.min(.1, (now - (last || now)) / 1000); last = now;
    if (!vis || document.hidden) return;
    t += dt; if (t >= STEP) { t = 0; i = (i + 1) % 4; }
    render(i, Math.min(1, t / (STEP * .82)));
  });
}

// ---------------------------------------------------------------- 02 stocks: cards (real logos) or the market map
let FILTER = 'top', QUERY = '', VIEW = 'cards', SHOWALL = false;
function stockList() {
  const L = LIST.filter(s => s.price != null);
  const q = QUERY.toLowerCase();
  let f = L;
  if (q) f = L.filter(s => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  else if (FILTER === 'preipo') f = L.filter(s => s.kind === 'preipo');
  else if (FILTER === 'tech' || FILTER === 'crypto') f = L.filter(s => s.tags.includes(FILTER));
  else if (FILTER === 'etf') f = L.filter(s => s.kind === 'etf' || s.kind === 'commodity');
  const u = uniqTickers(byLiq(f));
  if (FILTER === 'up') return u.filter(s => s.chg24 != null && s.liq > 15000).sort((a, b) => b.chg24 - a.chg24);
  if (FILTER === 'down') return u.filter(s => s.chg24 != null && s.liq > 15000).sort((a, b) => a.chg24 - b.chg24);
  return u;
}
const card = s => `<button class="sk2${s.kind === 'preipo' ? ' pre' : ''}" data-id="${esc(s.id)}" type="button">
  <span class="top"><span class="lg">${s.icon ? `<img src="${logo(s.mint)}" alt="" loading="lazy">` : `<span>${esc(s.ticker.slice(0, 4))}</span>`}</span><span class="iss">${s.kind === 'preipo' ? 'pre-IPO' : esc(s.issuer)}</span></span>
  <span class="tkr">${esc(s.ticker)}</span><span class="nm">${esc(s.name)}</span>
  <span class="row"><span class="px">${usd(s.price)}</span><span class="chg ${chgClass(s.chg24)}">${pct(s.chg24)}</span></span></button>`;
function drawStocks(animate) {
  const grid = $('#sgrid2'), all = stockList();
  const n = SHOWALL || QUERY ? all.length : (isMobile() ? 8 : 12);
  if (VIEW === 'cards') {
    grid.innerHTML = all.slice(0, n).map(card).join('') || '<p class="muted">Nothing matches that.</p>';
    if (animate && !RM) gsap.fromTo($$('.sk2', grid), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: .55, ease: 'power3.out', stagger: .025 });
    $('.smore').hidden = QUERY || all.length <= n && !SHOWALL;
    $('#moreStocks').innerHTML = SHOWALL ? 'Show fewer' : `Show all <span>${all.length}</span>`;
  } else drawMap(animate);
}
function stocksSec() {
  const grid = $('#sgrid2');
  grid.onclick = e => { const c = e.target.closest('.sk2'); if (c) openStock(c.dataset.id); };
  $('#mapBox').onclick = e => { const t = e.target.closest('.mt'); if (t) openStock(t.dataset.id); };
  $('#stockChips').onclick = e => { const b = e.target.closest('.chip'); if (!b || b.classList.contains('on')) return; $$('#stockChips .chip').forEach(x => x.classList.toggle('on', x === b)); FILTER = b.dataset.k; SHOWALL = false; QUERY = ''; $('#stockQ').value = ''; drawStocks(true); };
  let qt = null; $('#stockQ').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { QUERY = e.target.value.trim(); drawStocks(false); }, 120); });
  $('#viewSeg').onclick = e => { const b = e.target.closest('button'); if (!b || b.classList.contains('on')) return; $$('#viewSeg button').forEach(x => x.classList.toggle('on', x === b)); VIEW = b.dataset.v; $('#sgrid2').hidden = VIEW !== 'cards'; $('#mapBox').hidden = VIEW !== 'map'; $('.smore').hidden = VIEW !== 'cards'; drawStocks(true); ScrollTrigger.refresh(); };
  $('#moreStocks').onclick = () => { SHOWALL = !SHOWALL; drawStocks(false); ScrollTrigger.refresh(); if (!SHOWALL) $('#stocks').scrollIntoView({ block: 'start' }); };
  let rt = null; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => VIEW === 'map' && drawMap(false), 200); });
}
// the market map: every stock in the filter, sized by liquidity, colored by its day
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
function drawMap(animate) {
  const box = $('#mapBox'); if (!box || box.hidden || !LIST.length) return;
  const W = box.clientWidth, H = box.clientHeight, G = 3;
  const items = stockList().filter(s => s.liq).slice(0, isMobile() ? 34 : 64).map(s => ({ s, v: Math.sqrt(s.liq) }));
  box.innerHTML = squarify(items, 0, 0, W, H).map(r => {
    const s = r.s, fs = Math.max(12, Math.min(30, r.w / 6.2, r.h / 3.2)), fits = r.h > 54 && (s.ticker.length * fs * .62 + 60) < r.w, xs = r.w < 46 || r.h < 40;
    return `<div class="mt${fits ? '' : ' s'}${xs ? ' xs' : ''}${s.kind === 'preipo' ? ' pre' : ''}" data-id="${esc(s.id)}" title="${esc(s.ticker)} · ${esc(s.name)} · ${pct(s.chg24)}" style="--fs:${fs.toFixed(1)}px;left:${(r.x + G / 2).toFixed(1)}px;top:${(r.y + G / 2).toFixed(1)}px;width:${Math.max(0, r.w - G).toFixed(1)}px;height:${Math.max(0, r.h - G).toFixed(1)}px;background:${heat(s.chg24)}"><div class="tp">${s.icon ? `<img src="${logo(s.mint)}" alt="" loading="lazy">` : ''}<b>${esc(s.ticker)}</b></div><span class="p">${pct(s.chg24)}</span></div>`;
  }).join('');
  if (animate && !RM) gsap.fromTo($$('.mt', box), { scale: .3, opacity: 0 }, { scale: 1, opacity: 1, duration: .7, ease: 'back.out(1.6)', stagger: { each: .012 } });
}

// ---------------------------------------------------------------- 03 the split + the math
function split() {
  const segs = $('#dSegs'), items = $$('#legend li'), C = 2 * Math.PI * 80;
  let acc = 0;
  const parts = items.map(li => { const n = +li.querySelector('b').dataset.n, c = li.dataset.c; li.querySelector('i').style.background = c; const p = { n, c, off: acc }; acc += n; return p; });
  segs.innerHTML = parts.map((p, i) => `<circle class="d-seg" data-i="${i}" cx="100" cy="100" r="80" stroke="${p.c}" stroke-dasharray="0 ${C}" stroke-dashoffset="${-C * p.off / 100}"/>`).join('');
  const circles = $$('.d-seg', segs);
  const draw = k => circles.forEach((c, i) => { const p = parts[i], len = Math.max(0, Math.min(p.n, k * 100 - p.off)) / 100 * C; c.setAttribute('stroke-dasharray', `${Math.max(0, len - (len > 3 ? 2.5 : 0))} ${C}`); });
  if (RM) draw(1);
  else ScrollTrigger.create({ trigger: '#donut', start: 'top 85%', once: true, onEnter: () => { const o = { k: 0 }; gsap.to(o, { k: 1, duration: 1.6, ease: 'power3.inOut', onUpdate: () => draw(o.k) }); items.forEach((li, i) => setTimeout(() => countTo(li.querySelector('b'), parts[i].n, { dur: 1.2 }), 200 + i * 140)); } });
  const mid = $('#dPct'), lbl = $('#dLbl');
  const hot = i => { circles.forEach((c, j) => c.classList.toggle('hot', j === i)); items.forEach((li, j) => li.classList.toggle('hot', j === i)); if (i == null) { mid.textContent = '100%'; lbl.textContent = 'of every creator fee'; } else { mid.textContent = parts[i].n + '%'; lbl.textContent = items[i].querySelector('em').textContent; } };
  items.forEach((li, i) => { li.addEventListener('pointerenter', () => hot(i)); li.addEventListener('pointerleave', () => hot(null)); });
  circles.forEach((c, i) => { c.style.pointerEvents = 'stroke'; c.addEventListener('pointerenter', () => hot(i)); c.addEventListener('pointerleave', () => hot(null)); });
}
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
  const vol = $('#cVol'), pc = $('#cPct'), big = $('#oDay');
  const V = () => Math.pow(10, 3 + 4 * vol.value / 100), P = () => Math.pow(10, Math.log10(.05) + pc.value / 100 * (Math.log10(20) - Math.log10(.05)));
  function upd() {
    [vol, pc].forEach(r => r.style.setProperty('--p', r.value + '%'));
    const v = V(), p = P();
    $('#oVol').textContent = usd(v, 0); $('#oPct').textContent = (p < 1 ? p.toFixed(2) : p.toFixed(1)) + '%';
    if (feeBps == null || !sel || sel.price == null) { big.textContent = '—'; $('#oShares').textContent = '—'; return; }
    const all = v * feeBps / 1e4 * holdersPct / 100, me = all * p / 100, sh = me / sel.price;
    big.textContent = usd(me) + ' / day';
    $('#oShares').textContent = `${sh >= 1 ? sh.toFixed(2) : sh.toPrecision(2)} ${sel.ticker} a day`;
    $('#oWeek').textContent = usd(me * 7); $('#oMonth').textContent = usd(me * 30); $('#oAll').textContent = usd(all);
    $('#oNote').textContent = `creator fee ${(feeBps / 100).toFixed(2)}% (on-chain) · ${holdersPct}% buys ${sel.ticker} at ${usd(sel.price)} · math, not a promise`;
  }
  vol.oninput = pc.oninput = upd; upd();
  on('stocks', ({ list }) => { sel = list.find(s => s.id === sel.id) || sel; upd(); });
}

// ---------------------------------------------------------------- 04 live: coins, payouts, engine, your bag
const KIND = { claim: 'fees in', buy: 'bought', pay: 'paid', milk: 'for $MILK', burn: 'burned' };
async function live() {
  const tabs = $('#liveTabs'), panes = { coins: $('#lpCoins'), payouts: $('#lpPayouts'), engine: $('#lpEngine'), bag: $('#lpBag') };
  const show = k => { $$('button', tabs).forEach(x => x.classList.toggle('on', x.dataset.t === k)); Object.entries(panes).forEach(([n, el]) => { el.hidden = n !== k; }); if (!RM) gsap.fromTo(panes[k], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .45, ease: 'power3.out' }); ScrollTrigger.refresh(); };
  tabs.onclick = e => { const b = e.target.closest('button'); if (b && !b.classList.contains('on')) show(b.dataset.t); };
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
      grid.innerHTML = !r.coins.length ? `<div class="empty"><span class="empty-drop"><svg viewBox="0 0 16 19"><use href="#dropShape"/></svg></span><div><h3>The first cow is yours.</h3><p>No coins yet. Launch one and its holders get paid first.</p><a class="btn btn-white btn-lg mag" href="/launch" data-link>Launch a coin <i class="arr">→</i></a></div></div>`
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
  bag(show);
}
function bag(show) {
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
  window.__milkBag = () => { show('bag'); const w = window.__milkWallet && window.__milkWallet(); if (w) { inp.value = w.address; check(w.address); } };
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

// ---------------------------------------------------------------- 05 $MILK
async function milkBand() {
  const cfg = await config();
  if (cfg && cfg.ca) { $('#ca').hidden = false; $('#caTxt').textContent = cfg.ca; $('#caCopy').onclick = () => copy(cfg.ca); }
  drip($('#dripCv'));
}
function drip(cv) {
  const g = cv.getContext('2d'), P = 6, W = cv.width / P | 0, H = cv.height / P | 0;
  const DROP = ['.......##.......', '......####......', '......####......', '.....######.....', '.....######.....', '....########....', '...##########...', '...##########...', '..############..', '..##WW########..', '.###WW#########.', '.###W##########.', '.##############.', '.##############.', '.##############.', '..############..', '..############..', '...##########...', '.....######.....'];
  const S = 3, ox = (W - 16 * S) / 2 | 0, oy = 4, drops = [], splash = [];
  let t0 = 0, vis = false, puddle = 0;
  new IntersectionObserver(([e]) => vis = e.isIntersecting).observe(cv);
  const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x * P, y * P, P, P); };
  const cell = (x, y) => DROP[y] && DROP[y][x] && DROP[y][x] !== '.';
  function frame(now) {
    requestAnimationFrame(frame);
    if (!vis || now - t0 < 40) return; t0 = now;
    g.clearRect(0, 0, cv.width, cv.height);
    const wob = Math.sin(now / 500) * .6;
    DROP.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '.') return; const dy = y > 12 ? Math.round(wob) : 0; for (const [ex, ey] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (!cell(x + ex, y + ey)) for (let a = 0; a < S; a++) px(ox + (x + ex) * S + (ex ? (ex < 0 ? S - 1 : 0) : a), oy + (y + ey) * S + (ey ? (ey < 0 ? S - 1 : 0) : a) + dy, '#0d1020'); }));
    DROP.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '.') return; for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) px(ox + x * S + a, oy + y * S + b + (y > 12 ? Math.round(wob) : 0), ch === 'W' ? '#cfe0ff' : '#ffffff'); }));
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

// ---------------------------------------------------------------- 06 FAQ
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

// ---------------------------------------------------------------- end: the giant wordmark
function megaIn() { if (!RM) gsap.from('.mega span', { yPercent: 70, opacity: 0, ease: 'power3.out', stagger: .08, scrollTrigger: { trigger: '.mega', start: 'top 95%', end: 'top 50%', scrub: .8 } }); }

// ---------------------------------------------------------------- nav: active section, light/dark, hide on scroll down
function navWatch() {
  const nav = $('#nav'), links = $$('.links a');
  const setOn = a => links.forEach(l => l.classList.toggle('on', l === a));
  ['#how', '#stocks', '#split', '#live', '#milk', '#faq'].forEach(id => ScrollTrigger.create({ trigger: id, start: 'top 55%', end: 'bottom 55%', onToggle: s => { if (s.isActive) setOn(links.find(l => l.getAttribute('href') === '/' + id)); } }));
  ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom 55%', onToggle: s => { if (s.isActive) setOn(null); } });
  ScrollTrigger.create({ trigger: '#milk', start: 'top 40px', end: 'bottom 40px', onToggle: s => nav.classList.toggle('on-light', s.isActive) });
  let last = 0;
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => { const y = s.scroll(); nav.classList.toggle('scrolled', y > 40); if (Math.abs(y - last) > 6) { nav.classList.toggle('hide', y > last && y > innerHeight * .6); last = y; } } });
}

export async function home() {
  const listP = stocks().catch(() => []);
  hero();
  how(); stocksSec(); split(); faq(); megaIn();
  revealAll($('#home'));
  magnetic();
  navWatch();
  live(); milkBand(); surprise(listP);
  listP.then(async list => {
    LIST = list;
    $('#nStocks').textContent = list.length || '137';
    if (PC && PC.setStocks) PC.setStocks(featured(list).slice(0, 14).map(s => s.ticker));
    orbit(list); tape(list); drawStocks(true); await calc(list).catch(() => {});
    ScrollTrigger.refresh();
  });
  ScrollTrigger.refresh();
  return listP;
}
