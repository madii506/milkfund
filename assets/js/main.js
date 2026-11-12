// MILK: the router (/, /launch, /coin/<mint>, /coins), the nav (wallet, X), smooth scroll and the intro
import { $, on, short, toast, copy, config, logo, solscan, reduced } from './core.js';
import { smooth, scrollTo, ScrollTrigger, gsap } from './motion.js';
import { playIntro } from './intro.js?v=4';
import * as W from './wallet.js';

const homeEl = $('#home'), appEl = $('#app'), nav = $('#nav');
let homeReady = null, H = null, homeLoaded = false, introOver = false, heroShown = false;

// ---------------------------------------------------------------- the intro: a milk drop, a ring of real logos, a blue flood
// (home page only, once per visit, ~3.5 s; a click, a key or the wheel skips it)
const INTRO_MINTS = ['Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', 'PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh',
  'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg', 'Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw', 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu',
  'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', 'PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF', 'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', 'XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4'];
function intro() {
  const p = location.pathname.replace(/\/+$/, '') || '/', q = location.search;
  let seen = false; try { seen = sessionStorage.getItem('milk:intro') === '1'; sessionStorage.setItem('milk:intro', '1'); } catch {}
  if ((p !== '/' && p !== '/coins') || location.hash || reduced() || (/[?&](shot|nointro)\b/.test(q) && !/[?&]intro\b/.test(q))) return endIntro();
  const ctl = playIntro({ canvas: $('#introCv'), logos: INTRO_MINTS.map(logo), quick: seen, onDone: endIntro });
  const skip = () => { if (!introOver) ctl.skip(); };
  $('#intro').addEventListener('click', skip);
  addEventListener('keydown', e => { if (/^(Escape| |Enter|ArrowDown|PageDown)$/.test(e.key)) skip(); });
  addEventListener('wheel', skip, { passive: true });
  addEventListener('touchmove', skip, { passive: true });
}
function endIntro() {
  if (introOver) return; introOver = true;
  $('#intro').classList.add('gone'); document.body.classList.remove('booting');
  showHero();
}
function showHero() { if (heroShown || !homeLoaded || !introOver) return; heroShown = true; H.heroIn(); }

// ---------------------------------------------------------------- routes
async function route(push) {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  const m = p.match(/^\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
  closeMenu();
  if (p === '/launch' || m) {
    homeEl.hidden = true; appEl.hidden = false;
    nav.classList.remove('on-light', 'hide'); nav.classList.add('on-app');
    ScrollTrigger.getAll().forEach(t => t.disable(false));
    endIntro(); gsap.set('#nav', { opacity: 1, clearProps: 'transform' });
    scrollTo(0, { immediate: true });
    appEl.innerHTML = '';
    if (m) (await import('./coin.js?v=4')).coin(appEl, m[1]);
    else (await import('./launch.js?v=4')).launch(appEl);
    document.title = 'MILK';
    return;
  }
  nav.classList.remove('on-app');
  appEl.hidden = true; appEl.innerHTML = ''; homeEl.hidden = false;
  ScrollTrigger.getAll().forEach(t => t.enable());
  if (!homeReady) homeReady = startHome();
  await homeReady;
  ScrollTrigger.refresh();
  const sec = p === '/coins' ? '#live' : location.hash;
  if (sec && $(sec)) setTimeout(() => scrollTo(sec, { immediate: !push, offset: -10 }), push ? 50 : 300);
}
async function startHome() {
  H = await import('./home.js?v=4');
  if (!heroShown) H.heroHide();
  await H.home();
  homeLoaded = true;
  showHero();
}

// links: same-page sections scroll smoothly; app links route without a reload
document.addEventListener('click', e => {
  const a = e.target.closest('a'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  const href = a.getAttribute('href') || ''; if (!href.startsWith('/')) return;
  const u = new URL(href, location.origin);
  e.preventDefault();
  const onHome = !homeEl.hidden;
  if (u.pathname === '/' && u.hash && onHome) { history.pushState(null, '', u.hash); scrollTo(u.hash, { offset: -10 }); return; }
  if (u.pathname + u.search + u.hash === location.pathname + location.search + location.hash && !u.hash) { scrollTo(0); return; }
  history.pushState(null, '', u.pathname + u.search + u.hash);
  route(true);
});
addEventListener('popstate', () => route(false));

// ---------------------------------------------------------------- the nav: X, and the wallet (Connect → a wallet; connected → balance · address + a menu)
config().then(c => { if (!c || !c.x) return; const x = $('#navX'); x.hidden = false; x.href = /^https?:/.test(c.x) ? c.x : 'https://x.com/' + c.x.replace(/^@/, ''); });
const wb = $('#walletBtn');
function paintWallet() {
  const w = W.current(), b = W.balance && W.balance();
  wb.classList.toggle('on', !!w);
  wb.innerHTML = !w ? 'Connect' : (b && b.sol != null && b.address === w.address ? `<span class="bal">${b.sol.toFixed(2)} SOL</span>` : '') + `<span>${short(w.address)}</span><i class="cv" aria-hidden="true"></i>`;
}
on('wallet', () => { paintWallet(); closeMenu(); });
on('balance', paintWallet);
window.__milkWallet = () => W.current();
wb.addEventListener('click', async e => {
  e.stopPropagation();
  if (!W.current()) { try { await (await import('./launch.js?v=4')).pickWallet(); } catch {} return; }
  if (MENU) closeMenu(); else openMenu();
});
let MENU = null;
function openMenu() {
  const w = W.current(); if (!w) return;
  MENU = document.createElement('div'); MENU.className = 'wmenu';
  MENU.innerHTML = `<div class="wm-h mono">${short(w.address)}</div><button data-a="bag" type="button">My bag</button><button data-a="copy" type="button">Copy address</button><a data-a="scan" href="${solscan(w.address, 'account')}" target="_blank" rel="noopener">Solscan ↗</a><button data-a="out" type="button">Disconnect</button>`;
  const r = wb.getBoundingClientRect();
  MENU.style.top = Math.round(r.bottom + 10) + 'px'; MENU.style.right = Math.max(12, Math.round(innerWidth - r.right)) + 'px';
  document.body.appendChild(MENU);
  if (!reduced()) gsap.fromTo(MENU, { opacity: 0, y: -8, scale: .97 }, { opacity: 1, y: 0, scale: 1, duration: .3, ease: 'power3.out' });
  MENU.addEventListener('click', async ev => {
    const a = ev.target.closest('[data-a]'); if (!a) return;
    const cur = W.current();
    if (cur && a.dataset.a === 'copy') copy(cur.address);
    if (a.dataset.a === 'out') { await W.disconnect(); toast('Wallet disconnected'); }
    if (cur && a.dataset.a === 'bag') {
      if (homeEl.hidden) { history.pushState(null, '', '/#live'); await route(true); }
      window.__milkBag && window.__milkBag(); scrollTo('#live', { offset: -10 });
    }
    closeMenu();
  });
}
function closeMenu() { if (MENU) { MENU.remove(); MENU = null; } }
document.addEventListener('click', e => { if (MENU && !MENU.contains(e.target) && e.target !== wb) closeMenu(); });
addEventListener('resize', closeMenu);
addEventListener('scroll', () => MENU && closeMenu(), { passive: true });

intro();
smooth();
W.resume().catch(() => {});
paintWallet();
route(false);
