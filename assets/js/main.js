// MILK: the router (/, /launch, /coin/<mint>, /coins), the wallet button, smooth scroll, the intro
import { $, $$, on, short, toast } from './core.js';
import { smooth, scrollTo, ScrollTrigger, gsap, magnetic, revealAll } from './motion.js';
import * as W from './wallet.js';

const homeEl = $('#home'), appEl = $('#app');
let homeReady = null, booted = false;

async function route(push) {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  const m = p.match(/^\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
  if (p === '/launch' || m) {
    homeEl.hidden = true; appEl.hidden = false;
    $('#nav').classList.add('on-light'); $('#nav').classList.remove('hide');
    ScrollTrigger.getAll().forEach(t => t.disable(false));
    finishIntro();
    scrollTo(0, { immediate: true });
    appEl.innerHTML = '';
    if (m) (await import('./coin.js?v=1')).coin(appEl, m[1]);
    else (await import('./launch.js?v=1')).launch(appEl);
    document.title = 'MILK';
    return;
  }
  appEl.hidden = true; appEl.innerHTML = ''; homeEl.hidden = false;
  ScrollTrigger.getAll().forEach(t => t.enable());
  if (!homeReady) homeReady = startHome();
  await homeReady;
  ScrollTrigger.refresh();
  const sec = p === '/coins' ? '#coins' : location.hash;
  if (sec && $(sec)) setTimeout(() => scrollTo(sec, { immediate: !push, offset: sec === '#how' ? 0 : -20 }), push ? 50 : 300);
}
async function startHome() {
  const H = await import('./home.js?v=1');
  await H.home();
  if (!booted) { booted = true; await H.intro(); }
}
function finishIntro() { $('#intro').classList.add('gone'); document.body.classList.remove('booting'); gsap.set('#nav', { opacity: 1 }); }

// links: same-page sections scroll smoothly; app links route without a reload
document.addEventListener('click', e => {
  const a = e.target.closest('a'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  const href = a.getAttribute('href') || ''; if (!href.startsWith('/')) return;
  const u = new URL(href, location.origin);
  e.preventDefault();
  const onHome = !homeEl.hidden;
  if (u.pathname === '/' && u.hash && onHome) { history.pushState(null, '', u.hash); scrollTo(u.hash, { offset: u.hash === '#how' ? 0 : -20 }); return; }
  if (u.pathname + u.search + u.hash === location.pathname + location.search + location.hash && !u.hash) { scrollTo(0); return; }
  history.pushState(null, '', u.pathname + u.search + u.hash);
  route(true);
});
addEventListener('popstate', () => route(false));

// the wallet button in the nav: shows once a wallet is connected
const wb = $('#walletBtn');
on('wallet', w => { wb.hidden = !w; if (w) wb.textContent = short(w.address); });
window.__milkWallet = () => W.current();
on('balance', b => { if (b && W.current()) wb.textContent = (b.sol != null ? b.sol.toFixed(2) + ' SOL · ' : '') + short(W.current().address); });
wb.addEventListener('click', async () => { if (confirmDisconnect()) { await W.disconnect(); toast('Wallet disconnected'); } });
function confirmDisconnect() { return wb.dataset.armed === '1' ? (wb.dataset.armed = '', true) : (wb.dataset.armed = '1', wb.textContent = 'Disconnect?', setTimeout(() => { wb.dataset.armed = ''; const c = W.current(); if (c) wb.textContent = short(c.address); }, 2500), false); }

smooth();
W.resume().catch(() => {});
route(false);
