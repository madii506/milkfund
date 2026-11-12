// /coin/<mint>: the coin, the stock it pays, the split read from the chain, fees waiting (anyone can push them out),
// its holders and its own ledger.
import { $, $$, esc, api, logo, usd, pct, chgClass, sol, num, ago, short, sleep, stocks, toast, copy, solscan } from './core.js';
import { gsap, magnetic } from './motion.js';
import { openStock } from './drawer.js';
import * as W from './wallet.js';

export async function coin(root, mint) {
  root.innerHTML = `<div class="wrap"><a class="back" href="/#coins" data-link>← All coins</a><div class="panel"><p class="muted">Loading the coin…</p></div></div>`;
  let r; try { r = await api.get('coin', { mint }); } catch (e) { root.innerHTML = `<div class="wrap"><a class="back" href="/#coins" data-link>← All coins</a><div class="panel"><h2>Not a MILK coin</h2><p class="sub">${esc(e.message)}</p><a class="btn btn-blue" href="/launch" data-link>Launch one <i class="arr">→</i></a></div></div>`; return; }
  const list = await stocks().catch(() => []);
  const c = r.coin, s = list.find(x => x.id === c.stock.id) || null, cv = c.curve, mcap = cv && r.usd ? cv.mcap * r.usd : null;
  document.title = '$' + c.symbol + ' · MILK';
  const sh = (r.split && r.split.shareholders) || [];
  const label = a => a === c.creator ? 'creator' : a === r.engine ? 'MILK engine' : short(a);
  root.innerHTML = `<div class="wrap">
    <a class="back" href="/#coins" data-link>← All coins</a>
    <header class="coin-head"><img src="${c.image}" alt="">
      <div><h1>${esc(c.name)}</h1><div class="sym">$${esc(c.symbol)} <button class="btn btn-sm btn-line" style="color:var(--ink)" id="cpy" type="button">${short(c.coin)} · copy</button></div></div>
      <div class="acts"><a class="btn btn-blue mag" href="https://pump.fun/coin/${c.coin}" target="_blank" rel="noopener">Trade on pump.fun <i class="arr">↗</i></a><a class="btn btn-line" style="color:var(--ink)" href="https://dexscreener.com/solana/${c.coin}" target="_blank" rel="noopener">Chart</a></div>
    </header>
    <div class="kpis">
      <div><span>market cap</span><b>${usd(mcap)}</b></div>
      <div><span>bonding curve</span><b>${cv ? (cv.complete ? 'graduated' : Math.round(cv.progress * 100) + '%') : '—'}</b></div>
      <div><span>fees to the engine</span><b>${sol(c.claimed)}</b></div>
      <div><span>payout rounds</span><b>${c.rounds}</b></div>
    </div>
    <div class="cgrid2">
      <div>
        <section class="panel"><h2>Pays its holders in</h2>
          <div class="pickd" id="stk" style="margin-top:12px">${s ? `<img src="${logo(s.mint)}" alt=""><div><b>${esc(s.ticker)}</b><span>${esc(s.name)} · ${esc(s.issuer)}</span></div><div class="px">${usd(s.price)}<br><span class="chg ${chgClass(s.chg24)}">${pct(s.chg24)}</span></div>` : `<b>${esc(c.stock.ticker)}</b>`}</div>
          <div class="waiting"><div><span>creator fees waiting in pump.fun's vault</span><br><b>${r.vault ? sol(r.vault.waiting, 4) : '—'}</b></div><button class="btn btn-white" id="push" type="button">Push them out</button></div>
          <p class="muted" style="margin-top:10px">Anyone can push them out for a tiny network fee. Pot: <b>${sol(c.pot, 4)}</b> · buys ${esc(c.stock.ticker)} at the round size.</p>
        </section>
        <section class="panel"><h2>This coin's ledger</h2><div id="evs" style="margin-top:8px">${r.events.length ? r.events.map(ev).join('') : '<p class="muted">Nothing yet. The first claim shows up here, with its transaction.</p>'}</div></section>
      </div>
      <div>
        <section class="panel"><h2>The split, from the chain</h2><p class="sub">pump.fun fee sharing · <a href="${solscan(r.split ? r.split.address : '', 'account')}" target="_blank" rel="noopener" style="color:var(--blue)">sharing account ↗</a></p>
          ${sh.map(x => `<div class="share"><span class="mono">${esc(label(x.address))}</span><span class="mono muted">${short(x.address)}</span><b>${x.bps / 100}%</b></div>`).join('') || '<p class="muted">Could not read the sharing account right now.</p>'}
          <p style="margin-top:12px">${r.split && r.split.adminRevoked ? '<span class="okpill">✓ admin revoked: nobody can change it</span>' : r.split && r.split.exists ? '<span class="badpill">admin not revoked</span>' : ''}</p>
        </section>
        <section class="panel"><h2>Holders</h2><p class="sub" id="hsub">Wallets with at least the minimum get paid, pro rata.</p><div id="hl"><p class="muted">Loading…</p></div></section>
      </div>
    </div></div>`;
  $('#cpy').onclick = () => copy(c.coin);
  if (s) $('#stk').onclick = () => openStock(s.id);
  $('#push').onclick = () => push(c);
  gsap.from($$('.coin-head, .kpis > div, .panel', root), { y: 30, opacity: 0, duration: .7, ease: 'power3.out', stagger: .05 });
  magnetic(root);
  holders(c);
}
const KIND = { claim: 'fees in', buy: 'bought', pay: 'paid', milk: 'for $MILK', burn: 'burned' };
const ev = x => `<div class="ev" data-k="${x.kind}"><span class="kind">${KIND[x.kind] || x.kind}</span><span class="mono" style="font-size:13px">${x.kind === 'pay' ? 'to ' + short(x.who) : x.kind === 'buy' ? esc(x.note) + ' for ' + sol(x.lamports / 1e9) : sol(x.lamports / 1e9)} · ${ago(x.at)}</span>${x.sig ? `<a class="mono" style="font-size:12.5px;color:var(--blue)" href="${solscan(x.sig)}" target="_blank" rel="noopener">tx ↗</a>` : '<span></span>'}</div>`;

async function holders(c) {
  const box = $('#hl');
  try {
    const r = await api.get('holders', { mint: c.coin });
    $('#hsub').textContent = `Wallets with at least ${num(r.minHold)} tokens (${(r.minHold / 1e7).toFixed(2)}% of the supply) get paid, pro rata.`;
    box.innerHTML = r.holders.length ? r.holders.slice(0, 20).map(h => `<div class="hl"><a class="mono" href="${solscan(h.owner, 'account')}" target="_blank" rel="noopener">${short(h.owner)}${h.owner === c.creator ? ' · creator' : ''}</a><span class="mono">${h.pct.toFixed(2)}%</span>${h.paid ? '<span class="okpill">paid</span>' : '<span class="muted" style="font-size:12px">below min</span>'}</div>`).join('') : '<p class="muted">No wallet holds it yet.</p>';
  } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}

async function push(c) {
  let w = W.current();
  if (!w) { try { w = await (await import('./launch.js?v=1')).pickWallet(); } catch { return; } }
  const b = $('#push'); b.disabled = true; b.textContent = 'Building…';
  try {
    const p = await api.post('payout', { payer: w.address, coin: c.coin });
    b.textContent = 'Sign in your wallet…';
    const signed = await W.signTx(p.tx);
    b.textContent = 'Sending…';
    const { sig } = await api.post('send', { tx: signed });
    for (let i = 0; i < 40; i++) { const st = await api.post('status', { sig }).catch(() => null); if (st && st.status === 'failed') throw new Error('The payout failed on-chain.'); if (st && /confirmed|finalized/.test(st.status)) break; await sleep(1500); }
    const cr = await api.post('claimed', { coin: c.coin, sig }).catch(() => null);
    toast(cr && cr.credited ? `Pushed out: ${sol(cr.credited / 1e9, 4)} went to the engine for this coin's holders.` : 'Pushed out. The ledger updates in a moment.');
    setTimeout(() => coin(document.getElementById('app'), c.coin), 1500);
  } catch (e) { toast(e.message, true); b.disabled = false; b.textContent = 'Push them out'; }
}
