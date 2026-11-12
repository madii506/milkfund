// /launch: name, picture, the stock it pays, an optional first buy. The server builds and simulates the transaction
// (create_v2 + fee sharing [you 10%, engine 90%], admin revoked); your wallet signs it; we send it and watch it land.
import { $, $$, esc, api, logo, usd, pct, chgClass, short, sleep, stocks, toast, solscan, store } from './core.js';
import { gsap, magnetic } from './motion.js';
import { browse, modal, closeAll } from './drawer.js';
import * as W from './wallet.js';

const DROP = '<svg viewBox="0 0 16 19"><use href="#dropShape"/></svg>';
const QUICK = ['NVDA', 'TSLA', 'SPACEX', 'AAPL', 'OPENAI', 'SPY'];
const S = { name: '', symbol: '', description: '', image: null, stock: null, buy: 0, socials: {}, busy: false };

export async function launch(root) {
  const list = (await stocks().catch(() => [])).slice().sort((a, b) => (b.liq || 0) - (a.liq || 0));
  const want = new URLSearchParams(location.search).get('stock');
  S.stock = list.find(s => s.id === want) || list.find(s => s.ticker === 'NVDA') || list[0] || null;
  const quick = QUICK.map(t => list.find(s => s.ticker === t && s.price != null)).filter(Boolean);
  root.innerHTML = `<div class="wrap">
    <header class="app-head"><span class="eyebrow">Launch</span><h1>Launch a cash cow.</h1><p>One signature. Its fees buy a real stock for its holders.</p></header>
    <div class="launch">
      <div>
        <section class="panel"><h2><span class="n">1</span>Your coin</h2><p class="sub">As it shows on pump.fun.</p>
          <div class="pic"><label class="pic-box" id="picBox" for="pic">${DROP}</label><input type="file" id="pic" accept="image/png,image/jpeg,image/webp,image/gif" hidden><div><b>Picture</b><small>Cropped square.</small></div></div>
          <div class="f2"><div class="f"><label for="fName">Name</label><input id="fName" maxlength="32" placeholder="Cash Cow" autocomplete="off"></div><div class="f"><label for="fSym">Ticker</label><input id="fSym" maxlength="10" placeholder="COW" autocomplete="off" style="text-transform:uppercase"></div></div>
          <div class="f"><label for="fDesc">Description <span class="muted">(optional)</span></label><textarea id="fDesc" maxlength="400" placeholder="What's the story?"></textarea></div>
        </section>
        <section class="panel"><h2><span class="n">2</span>What it pays</h2><p class="sub">Its fees buy this for holders.</p>
          <div class="pickd" id="pickd" tabindex="0" role="button"></div>
          <div class="quick" id="quick">${quick.map(s => `<button type="button" data-id="${esc(s.id)}"><img src="${logo(s.mint)}" alt="">${esc(s.ticker)}</button>`).join('')}<button type="button" id="more">All ${list.length} →</button></div>
        </section>
        <section class="panel"><h2><span class="n">3</span>Links <span class="muted" style="font:600 14px Inter">optional</span></h2><p class="sub">Shown on pump.fun.</p>
          <div class="f2"><div class="f"><label for="fX">X</label><input id="fX" placeholder="x.com/yourcoin" autocomplete="off"></div><div class="f"><label for="fTg">Telegram</label><input id="fTg" placeholder="t.me/yourcoin" autocomplete="off"></div></div>
          <div class="f"><label for="fWeb">Website</label><input id="fWeb" placeholder="yourcoin.com" autocomplete="off"></div>
        </section>
        <section class="panel"><h2><span class="n">4</span>First buy <span class="muted" style="font:600 14px Inter">optional</span></h2><p class="sub">Right after launch, a second signature.</p>
          <div class="buyrow" id="buyrow">${[0, .1, .25, .5, 1].map((v, i) => `<button type="button" data-v="${v}" class="${i === 0 ? 'on' : ''}">${v ? v + ' SOL' : 'None'}</button>`).join('')}</div>
        </section>
      </div>
      <aside class="preview">
        <div class="pv" id="pv">
          <div class="pv-top"><div class="im" id="pvIm">${DROP}</div><div><b id="pvName">Your coin</b><span id="pvSym">$TICKER</span></div></div>
          <div class="pv-pays" id="pvPays"></div>
          <div class="pv-split"><div class="ph-lbl" style="color:rgba(255,255,255,.75)">EVERY CREATOR FEE, SPLIT ON-CHAIN</div><div class="ph-bar"><i style="width:10%"></i><i style="width:90%"></i></div><div class="ph-legend"><span>You 10%</span><span>Engine 90%</span></div></div>
          <p class="pv-desc" id="pvDesc"></p>
        </div>
        <div class="panel pv-go" id="go">
          <button class="btn btn-blue btn-lg mag" id="launchBtn" type="button">Launch on pump.fun <i class="arr">→</i></button>
          <p class="pv-fine">About 0.02 SOL in network costs, shown exactly before you sign. The split locks at launch.</p>
          <div class="steps-live" id="stepsLive" hidden></div>
        </div>
      </aside>
    </div></div>`;
  bind(root, list);
  gsap.from($$('.panel, .pv', root), { y: 40, opacity: 0, duration: .8, ease: 'power3.out', stagger: .07 });
  magnetic(root);
}

function bind(root, list) {
  const name = $('#fName'), sym = $('#fSym'), desc = $('#fDesc');
  const sync = () => {
    S.name = name.value.trim(); S.symbol = sym.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); S.description = desc.value.trim();
    $('#pvName').textContent = S.name || 'Your coin'; $('#pvSym').textContent = '$' + (S.symbol || 'TICKER'); $('#pvDesc').textContent = S.description;
  };
  [name, sym, desc].forEach(i => i.addEventListener('input', sync));
  sym.addEventListener('input', () => { const p = sym.selectionStart; sym.value = sym.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); sym.setSelectionRange(p, p); });
  // picture: cropped square to 512 in the browser (metadata and EXIF stay behind)
  $('#pic').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 8e6) return toast('That picture is too large. Use one under 8 MB.', true);
    try { S.image = await square(f); $('#picBox').innerHTML = `<img src="${S.image}" alt="">`; $('#pvIm').innerHTML = `<img src="${S.image}" alt="">`; gsap.fromTo('#pvIm', { scale: .7, rotate: -8 }, { scale: 1, rotate: 0, duration: .7, ease: 'back.out(2.2)' }); }
    catch { toast('That file could not be read as a picture.', true); }
  });
  const showStock = () => {
    const s = S.stock;
    $('#pickd').innerHTML = s ? `<img src="${logo(s.mint)}" alt=""><div><b>${esc(s.ticker)}</b><span>${esc(s.name)} · ${s.kind === 'preipo' ? 'pre-IPO · ' : ''}${esc(s.issuer)}</span></div><div class="px">${usd(s.price)}<br><span class="chg ${chgClass(s.chg24)}">${pct(s.chg24)}</span></div>` : '<b>Pick a stock</b>';
    $('#pvPays').innerHTML = s ? `<img src="${logo(s.mint)}" alt=""><div><span>holders get paid in</span><b>${esc(s.ticker)}</b></div>` : '';
    $$('#quick button[data-id]').forEach(b => b.classList.toggle('on', s && b.dataset.id === s.id));
    gsap.fromTo('#pvPays', { y: 8, opacity: .4 }, { y: 0, opacity: 1, duration: .4 });
  };
  showStock();
  const pick = () => browse({ selected: S.stock && S.stock.id, onPick: s => { S.stock = s; showStock(); } });
  $('#pickd').addEventListener('click', pick); $('#pickd').addEventListener('keydown', e => e.key === 'Enter' && pick());
  $('#quick').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'more') return pick(); S.stock = list.find(s => s.id === b.dataset.id) || S.stock; showStock(); });
  $('#buyrow').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.buy = +b.dataset.v; $$('#buyrow button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#launchBtn').addEventListener('click', () => go(root));
}

function square(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 512;
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 512, 512);
      URL.revokeObjectURL(url);
      let d = c.toDataURL('image/png'); if (d.length > 1.4e6) d = c.toDataURL('image/jpeg', .9);
      res(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

// ---------------------------------------------------------------- wallet picker
export function pickWallet() {
  return new Promise((resolve, reject) => {
    const ws = W.wallets();
    const body = modal(`<h3>Connect a wallet</h3><p>Your wallet signs the launch. MILK never sees your key.</p><div class="wl">${ws.length ? ws.map((w, i) => `<button type="button" data-i="${i}"><img src="${w.icon}" alt="">${esc(w.name)}</button>`).join('') : '<p class="muted">No Solana wallet found in this browser. Install <a href="https://phantom.app" target="_blank" rel="noopener" style="color:var(--blue)">Phantom</a>, <a href="https://solflare.com" target="_blank" rel="noopener" style="color:var(--blue)">Solflare</a> or <a href="https://backpack.app" target="_blank" rel="noopener" style="color:var(--blue)">Backpack</a>, then reload.</p>'}</div>`);
    body.querySelector('.wl').addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      try { const w = await W.connect(ws[+b.dataset.i]); closeAll(); resolve(w); } catch (err) { toast(err.message || 'The wallet did not connect.', true); }
    });
    const m = $('#modal'), stop = new MutationObserver(() => { if (!m.classList.contains('open')) { stop.disconnect(); if (!W.current()) reject(new Error('cancelled')); } });
    stop.observe(m, { attributes: true, attributeFilter: ['class'] });
  });
}

// ---------------------------------------------------------------- the launch
const STEPS = [['build', 'Building and simulating on mainnet'], ['sign', 'Sign in your wallet'], ['send', 'Sending to Solana'], ['land', 'Landing: coin, curve and fee split'], ['buy', 'Your first buy']];
function stepsUI(withBuy) {
  const box = $('#stepsLive'); box.hidden = false;
  box.innerHTML = STEPS.filter(s => withBuy || s[0] !== 'buy').map(([k, t]) => `<div class="sl" data-k="${k}"><i></i><span>${t}</span></div>`).join('');
  return (k, st, txt) => { const el = box.querySelector(`[data-k="${k}"]`); if (!el) return; el.className = 'sl ' + st; el.querySelector('i').textContent = st === 'ok' ? '✓' : st === 'bad' ? '!' : ''; if (txt) el.querySelector('span').textContent = txt; };
}
async function waitSig(sig, ms = 75000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await api.post('status', { sig }).catch(() => null);
    if (r && r.status === 'failed') throw new Error('The transaction failed on-chain' + (r.err ? ': ' + r.err : '.'));
    if (r && (r.status === 'confirmed' || r.status === 'finalized')) return true;
    await sleep(1600);
  }
  return false;
}
async function go(root) {
  if (S.busy) return;
  if (!S.image) return toast('Add a picture first.', true);
  if (S.name.length < 2) return toast('Give your coin a name.', true);
  if (S.symbol.length < 2) return toast('Give your coin a ticker.', true);
  if (!S.stock) return toast('Pick the stock it pays.', true);
  S.socials = { twitter: $('#fX').value.trim(), telegram: $('#fTg').value.trim(), website: $('#fWeb').value.trim() };
  let w = W.current();
  if (!w) { try { w = await pickWallet(); } catch { return; } }
  S.busy = true; const btn = $('#launchBtn'); btn.disabled = true;
  const set = stepsUI(S.buy > 0);
  try {
    set('build', 'on');
    const p = await api.post('prepare', { owner: w.address, name: S.name, symbol: S.symbol, description: S.description, socials: S.socials, stock: S.stock.id, image: S.image });
    set('build', 'ok', `Simulated: ${p.cost != null ? p.cost.toFixed(4) + ' SOL total, ' : ''}split ${p.split.map(x => x.bps / 100 + '%').join(' / ')}`);
    set('sign', 'on');
    const signed = await W.signTx(p.tx).catch(e => { throw new Error(/reject|cancel|denied/i.test(e.message) ? 'You cancelled in the wallet.' : e.message); });
    set('sign', 'ok'); set('send', 'on');
    const { sig } = await api.post('send', { tx: signed });
    set('send', 'ok', 'Sent · ' + short(sig)); set('land', 'on');
    await waitSig(sig);
    let live = null;
    for (let i = 0; i < 12 && !(live && live.live); i++) { live = await api.post('confirm', { coin: p.coin, sig }).catch(() => null); if (!(live && live.live)) await sleep(1500); }
    if (!(live && live.live)) throw new Error('Sent, but not seen on-chain yet. Check the transaction on Solscan.');
    set('land', 'ok', live.split && live.split.adminRevoked ? 'Live · fee split locked, admin revoked' : 'Live on pump.fun');
    store.set('last', p.coin);
    if (S.buy > 0) {
      set('buy', 'on');
      try {
        const b = await api.post('buy', { owner: w.address, coin: p.coin, sol: S.buy });
        const sb = await W.signTx(b.tx); const r = await api.post('send', { tx: sb }); await waitSig(r.sig);
        set('buy', 'ok', 'Bought ' + S.buy + ' SOL of $' + S.symbol);
      } catch (e) { set('buy', 'bad', 'First buy skipped: ' + e.message); }
    }
    done(p.coin, sig);
  } catch (e) {
    const k = [...$$('#stepsLive .sl')].find(x => x.classList.contains('on'));
    if (k) set(k.dataset.k, 'bad', e.message);
    toast(e.message, true);
  } finally { S.busy = false; btn.disabled = false; }
}
function done(coin, sig) {
  const go = $('#go');
  go.innerHTML = `<div class="done-card"><img src="/i/${coin}" alt=""><h3>$${esc(S.symbol)} is live.</h3><p>Its fees now buy ${esc(S.stock.ticker)} for its holders.</p>
    <div class="ctas"><a class="btn btn-blue mag" href="/coin/${coin}" data-link>Open the coin page <i class="arr">→</i></a><a class="btn btn-line" style="color:var(--ink)" href="https://pump.fun/coin/${coin}" target="_blank" rel="noopener">pump.fun</a><a class="btn btn-line" style="color:var(--ink)" href="${solscan(sig)}" target="_blank" rel="noopener">Solscan</a></div></div>`;
  gsap.from('.done-card > *', { y: 20, opacity: 0, stagger: .08, duration: .7, ease: 'back.out(1.6)' });
  confetti();
}
function confetti() {
  const c = document.createElement('canvas'); Object.assign(c.style, { position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 99, pointerEvents: 'none' }); document.body.appendChild(c);
  c.width = innerWidth; c.height = innerHeight; const g = c.getContext('2d'), P = [];
  for (let i = 0; i < 90; i++) P.push({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .55, vx: (Math.random() - .5) * 14, vy: -Math.random() * 16 - 6, s: 6 + Math.random() * 6 | 0, c: ['#2357ff', '#ffd23f', '#f2667f', '#8f63f5', '#ffffff', '#8fc8ff'][i % 6], r: Math.random() * 6 });
  let n = 0; (function f() { g.clearRect(0, 0, c.width, c.height); P.forEach(p => { p.vy += .45; p.x += p.vx; p.y += p.vy; p.vx *= .99; g.fillStyle = p.c; g.fillRect(p.x | 0, p.y | 0, p.s, p.s); }); if (++n < 150) requestAnimationFrame(f); else c.remove(); })();
}
