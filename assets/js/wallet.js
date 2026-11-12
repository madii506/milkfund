// Wallet Standard (Phantom, Solflare, Backpack, …): connect, follow account switches, sign transactions.
// MILK never sees a key: the wallet signs the launch transaction that our server built and co-signed.
import { emit, on, store, b64e, b64d, api } from './core.js';

const WALLETS = [], WATCHED = new WeakSet();
const isSol = a => (a.chains || []).some(c => String(c).startsWith('solana:'));
const usable = w => w && w.features && w.features['standard:connect'] && (w.chains || []).some(c => String(c).startsWith('solana:')) && (w.features['solana:signTransaction'] || w.features['solana:signAndSendTransaction']);
const reg = Object.freeze({ register(...ws) { let n = 0; for (const w of ws) if (usable(w) && !WALLETS.some(x => x.name === w.name)) { WALLETS.push(w); n++; } if (n) emit('wallets', WALLETS.slice()); return () => {}; } });
try { addEventListener('wallet-standard:register-wallet', e => { try { e.detail(reg); } catch {} }); dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: reg })); } catch {}

let CUR = null;
export const wallets = () => WALLETS.slice();
export const current = () => CUR;
export async function connect(w, { silent = false } = {}) {
  const r = await w.features['standard:connect'].connect(silent ? { silent: true } : undefined);
  const accts = (r && r.accounts && r.accounts.length ? r.accounts : w.accounts) || [];
  const acc = accts.find(isSol) || accts[0];
  if (!acc) throw new Error(silent ? 'not connected yet' : 'The wallet did not share an account.');
  CUR = { wallet: w, account: acc, address: acc.address, name: w.name, icon: w.icon };
  store.set('wallet', w.name); watch(w); BAL = null; emit('wallet', CUR); refreshBalance(); poll(); return CUR;
}
function watch(w) {
  const ev = w.features['standard:events']; if (!ev || WATCHED.has(w)) return; WATCHED.add(w);
  try {
    ev.on('change', ({ accounts } = {}) => {
      if (!CUR || CUR.wallet !== w || !accounts) return;
      const acc = accounts.find(isSol) || accounts[0];
      if (!acc) { CUR = null; store.del('wallet'); emit('wallet', null); return; }
      if (acc.address !== CUR.address) { CUR = { ...CUR, account: acc, address: acc.address }; BAL = null; emit('wallet', CUR); refreshBalance(); }
    });
  } catch {}
}
export async function disconnect() { const w = CUR && CUR.wallet; CUR = null; BAL = null; clearTimeout(BT); store.del('wallet'); emit('wallet', null); try { await w?.features['standard:disconnect']?.disconnect(); } catch {} }
// sign a short text with the wallet (sign-in): free, not a transaction
export async function signMessage(text) {
  if (!CUR) throw new Error('Connect a wallet first.');
  const f = CUR.wallet.features['solana:signMessage'];
  if (!f) throw new Error(CUR.name + ' cannot sign messages. Try Phantom, Solflare or Backpack.');
  const out = await f.signMessage({ account: CUR.account, message: new TextEncoder().encode(text) });
  const o = Array.isArray(out) ? out[0] : out;
  return b64e(new Uint8Array(o.signature));
}
// the connected wallet's SOL balance, live: every 15 s while the tab is open, on focus, and after every transaction
let BAL = null, BT = null;
export const balance = () => BAL;
export async function refreshBalance() {
  const cur = CUR; if (!cur) { BAL = null; return null; }
  try {
    const r = await api.get('balance', { owner: cur.address });
    if (!CUR || CUR.address !== cur.address) return null;
    const prev = BAL; BAL = { address: cur.address, sol: r.sol, usd: r.usd, at: Date.now() };
    emit('balance', { ...BAL, prev: prev && prev.address === cur.address ? prev.sol : null });
    return BAL;
  } catch { return BAL; }
}
function poll() { clearTimeout(BT); if (!CUR) return; BT = setTimeout(async () => { if (!document.hidden) await refreshBalance(); poll(); }, 15000); }
addEventListener('focus', () => { if (CUR) refreshBalance(); });
on('tx', () => { setTimeout(refreshBalance, 500); setTimeout(refreshBalance, 4000); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && CUR) refreshBalance(); });
// reconnect quietly to the wallet used last time (no popup)
export async function resume() {
  const name = store.get('wallet'); if (!name) return null;
  for (let i = 0; i < 12 && !WALLETS.some(w => w.name === name); i++) await new Promise(r => setTimeout(r, 150));
  const w = WALLETS.find(x => x.name === name); if (!w) return null;
  try { return await connect(w, { silent: true }); } catch { return null; }
}
// sign a base64 transaction (already partly signed with the coin's fresh mint key); returns the fully signed base64
export async function signTx(txB64) {
  if (!CUR) throw new Error('Connect a wallet first.');
  const f = CUR.wallet.features['solana:signTransaction'];
  if (!f) throw new Error(CUR.name + ' cannot sign this kind of transaction. Try Phantom, Solflare or Backpack.');
  const out = await f.signTransaction({ account: CUR.account, transaction: b64d(txB64), chain: 'solana:mainnet' });
  const o = Array.isArray(out) ? out[0] : out;
  setTimeout(refreshBalance, 2500);
  return b64e(new Uint8Array(o.signedTransaction));
}
