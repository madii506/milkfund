// the stock drawer (live price, chart, numbers) and the stock browser (every stock a coin can pay)
import { $, $$, esc, api, logo, usd, pct, chgClass, num, stocks } from './core.js';
import { lenis } from './motion.js';

const dr = () => $('#drawer');
function lock(on) { if (lenis) on ? lenis.stop() : lenis.start(); document.documentElement.style.overflow = on ? 'hidden' : ''; }
function closeAll() { dr().classList.remove('open'); dr().setAttribute('aria-hidden', 'true'); $('#modal').classList.remove('open', 'wide'); $('#modal').setAttribute('aria-hidden', 'true'); lock(false); }
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeAll(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

let CUR = null, TF = '24h';
export async function openStock(id) {
  const list = await stocks().catch(() => []);
  const s = list.find(x => x.id === id); if (!s) return;
  CUR = s; TF = '24h';
  $('#drLogo').src = logo(s.mint); $('#drTitle').textContent = s.ticker;
  $('#drSub').textContent = s.name + ' · ' + (s.kind === 'preipo' ? 'pre-IPO · ' : '') + s.issuer;
  $('#drPrice').textContent = usd(s.price);
  const c = $('#drChg'); c.textContent = pct(s.chg24) + ' 24h'; c.className = 'chg ' + chgClass(s.chg24);
  $('#drStats').innerHTML = [['1h', pct(s.chg1h)], ['24h volume', usd(s.vol24)], ['liquidity', usd(s.liq)], ['holders', num(s.holders)], ['issuer', s.issuer], ['transfer fee', s.feeBps ? (s.feeBps / 100) + '%' : 'none']].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('#drGo').href = '/launch?stock=' + encodeURIComponent(s.id); $('#drGo').innerHTML = `Launch a coin that pays ${esc(s.ticker)} <i class="arr">→</i>`;
  $('#drMint').textContent = 'mint ' + s.mint;
  $$('.dr-tf button').forEach(b => b.classList.toggle('on', b.dataset.tf === TF));
  dr().classList.add('open'); dr().setAttribute('aria-hidden', 'false'); lock(true);
  chart();
}
$$('.dr-tf button').forEach(b => b.addEventListener('click', () => { TF = b.dataset.tf; $$('.dr-tf button').forEach(x => x.classList.toggle('on', x === b)); chart(); }));

async function chart() {
  const s = CUR, cv = $('#drChart'), g = cv.getContext('2d'), W = cv.width, H = cv.height, note = $('#drCn');
  g.clearRect(0, 0, W, H); note.textContent = 'loading…';
  let r; try { r = await api.get('chart', { m: s.mint, tf: TF }); } catch (e) { if (CUR === s) note.textContent = 'no chart for this one yet: too few trades on-chain'; return; }
  if (CUR !== s) return;
  const pts = r.pts, ys = pts.map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * .12 || hi * .01;
  const X = i => 10 + i / (pts.length - 1) * (W - 20), Y = v => H - 16 - (v - lo + pad) / (hi - lo + pad * 2) * (H - 32);
  const up = ys[ys.length - 1] >= ys[0], col = up ? '#12b76a' : '#f04438';
  // draw in with a wipe
  let k = 0;
  const step = () => {
    k = Math.min(1, k + .06);
    g.clearRect(0, 0, W, H);
    const n = Math.max(2, Math.round(pts.length * k));
    g.beginPath(); pts.slice(0, n).forEach((p, i) => i ? g.lineTo(X(i), Y(p[1])) : g.moveTo(X(i), Y(p[1])));
    g.strokeStyle = col; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
    g.lineTo(X(n - 1), H); g.lineTo(X(0), H); g.closePath(); g.fillStyle = up ? 'rgba(18,183,106,.1)' : 'rgba(240,68,56,.1)'; g.fill();
    const lp = pts[n - 1]; g.beginPath(); g.arc(X(n - 1), Y(lp[1]), 7, 0, 7); g.fillStyle = col; g.fill();
    if (k < 1) requestAnimationFrame(step);
  };
  step();
  const ch = (ys[ys.length - 1] / ys[0] - 1) * 100;
  note.textContent = `${TF}: ${usd(lo)} to ${usd(hi)} · ${pct(ch)} · GeckoTerminal`;
}

// every stock, searchable. onPick(stock) for the launch page; without it, a click opens the drawer
const CATS = [['all', 'All'], ['stock', 'Stocks'], ['preipo', 'Pre-IPO'], ['etf', 'Funds'], ['tech', 'Tech'], ['crypto', 'Crypto']];
export async function browse({ onPick, selected } = {}) {
  const list = (await stocks().catch(() => [])).slice().sort((a, b) => (b.liq || 0) - (a.liq || 0));
  const m = $('#modal'), body = $('#mdBody');
  let cat = 'all', q = '';
  body.innerHTML = `<h3>${onPick ? 'Pick the stock it pays' : 'Every stock a coin can pay'}</h3><p>${list.length} tokenized stocks, funds and pre-IPO names on Solana, with live prices.</p>
    <input class="search" id="sq" placeholder="Search NVDA, SpaceX, gold…" autocomplete="off">
    <div class="chips" id="scats" style="background:var(--paper);margin-top:12px;width:max-content;max-width:100%">${CATS.map(([k, n]) => `<button class="chip${k === 'all' ? ' on' : ''}" data-k="${k}" type="button" style="color:var(--ink)">${n}</button>`).join('')}</div>
    <div class="sgrid" id="sgrid"></div>`;
  const grid = $('#sgrid', body);
  const draw = () => {
    const ql = q.toLowerCase();
    const l = list.filter(s => (cat === 'all' || s.kind === cat || s.tags.includes(cat) || (cat === 'etf' && s.kind === 'commodity')) && (!ql || s.ticker.toLowerCase().includes(ql) || s.name.toLowerCase().includes(ql) || s.id.toLowerCase().includes(ql)));
    grid.innerHTML = l.map(s => `<button class="sg${selected === s.id ? ' on' : ''}" data-id="${esc(s.id)}" type="button"><img src="${logo(s.mint)}" alt="" loading="lazy"><span><b>${esc(s.ticker)}</b><span>${esc(s.issuer)} · ${usd(s.price)}</span></span></button>`).join('') || '<p class="muted">Nothing matches that.</p>';
  };
  draw();
  $('#sq', body).addEventListener('input', e => { q = e.target.value.trim(); draw(); });
  $('#scats', body).addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; cat = b.dataset.k; $$('#scats .chip', body).forEach(x => { x.classList.toggle('on', x === b); x.style.color = x === b ? '' : 'var(--ink)'; }); draw(); });
  grid.addEventListener('click', e => { const b = e.target.closest('.sg'); if (!b) return; const s = list.find(x => x.id === b.dataset.id); closeAll(); if (onPick) onPick(s); else setTimeout(() => openStock(s.id), 50); });
  m.classList.add('open', 'wide'); m.setAttribute('aria-hidden', 'false'); lock(true);
  setTimeout(() => { if (!matchMedia('(pointer: coarse)').matches) $('#sq', body).focus(); }, 300);
}
export function modal(html, { wide = false } = {}) {
  const m = $('#modal'); $('#mdBody').innerHTML = html; m.classList.toggle('wide', wide); m.classList.add('open'); m.setAttribute('aria-hidden', 'false'); lock(true); return $('#mdBody');
}
export { closeAll };
