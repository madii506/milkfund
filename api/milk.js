// MILK API: one function, routed by ?op=. Launches pump.fun coins whose creator fees buy real stocks for their holders.
// Reads: health, config, stats, stocks, logo, chart, sol, coins, coin, events, holders, engine, meta, image.
// Writes: prepare → (wallet signs) → send → confirm, buy (first buy), payout + claimed (anyone pushes a coin's fees out), tick.
const L = require('./_lib'), S = require('./_sol'), DB = require('./_db'), X = require('./_launch'), M = require('./_market'), E = require('./_engine'), ST = require('./_stocks');
const VERSION = '1.0.0';
const origin = req => (process.env.MILK_ORIGIN || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host || 'localhost'))).replace(/\/$/, '');
const isAddr = a => typeof a === 'string' && L.B58.test(a);
const need = (c, msg, code = 400) => { if (!c) throw L.err(code, msg); };
const SIG = /^[1-9A-HJ-NP-Za-km-z]{60,100}$/;

function cleanMeta(b) {
  const name = L.clean(b.name, 32).replace(/\s+/g, ' '), symbol = L.clean(b.symbol, 10).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  need(name.length >= 2, 'Give your coin a name (2 to 32 characters).');
  need(symbol.length >= 2, 'Give your coin a ticker (2 to 10 letters or numbers).');
  const description = L.clean(b.description, 400).replace(/\s+/g, ' ');
  const url = (v, re) => { const s = L.clean(v, 120); if (!s) return ''; const u = /^https?:\/\//i.test(s) ? s : 'https://' + s; return re.test(u) ? u : ''; };
  const socials = {};
  const x = url((b.socials || {}).twitter, /^https:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_\/]+/i); if (x) socials.twitter = x;
  const tg = url((b.socials || {}).telegram, /^https:\/\/(www\.)?t\.me\/[A-Za-z0-9_\/+]+/i); if (tg) socials.telegram = tg;
  const w = url((b.socials || {}).website, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i); if (w) socials.website = w;
  return { name, symbol, description, socials };
}
function imageFrom(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  need(m, 'Add a picture for your coin (PNG, JPG, WebP or GIF).');
  const buf = Buffer.from(m[3], 'base64');
  need(buf.length > 200 && buf.length <= 1.2e6, 'The picture is too large. Use one under 1 MB.');
  return { mime: m[1], buf };
}

async function coinsLive() {
  return L.cached('coins', 15e3, async () => {
    // launches that landed while nobody watched: the coin's mint exists on-chain → live
    const st = await DB.stale(20).catch(() => []);
    if (st.length) { const acc = await S.accounts(st.map(r => r.coin)).catch(() => []); await Promise.all(st.map((r, i) => acc[i] ? DB.markLive(r.coin, null) : null)); }
    const rows = await DB.live(300);
    const [cv, usd] = await Promise.all([rows.length ? S.curves(rows.map(r => r.coin)).catch(() => ({})) : {}, M.solUsd().catch(() => null)]);
    return { usd, coins: rows.map(r => ({ ...pub(r), curve: cv[r.coin] || null })) };
  });
}
// pump.fun's creator fee for a new coin right now: the pump-fees schedule (market-cap tiers), read from the chain
async function creatorFeeBps() {
  return L.cached('cfee', 600e3, async () => {
    const SDK = require('@pump-fun/pump-sdk');
    const [g, fc] = await S.accounts([SDK.GLOBAL_PDA.toBase58(), SDK.PUMP_FEE_CONFIG_PDA.toBase58()]);
    if (!g) return null;
    const global = SDK.PUMP_SDK.decodeGlobal(X.ai(g)), feeConfig = fc ? SDK.PUMP_SDK.decodeFeeConfig(X.ai(fc)) : null;
    const r = SDK.computeFeesBps({ global, feeConfig, mintSupply: global.tokenTotalSupply, virtualQuoteReserves: global.initialVirtualSolReserves, virtualTokenReserves: global.initialVirtualTokenReserves });
    return Number(r.creatorFeeBps.toString());
  });
}
const pub = r => {
  const s = ST.BY_ID.get(r.stock) || {};
  return { coin: r.coin, creator: r.creator, name: r.name, symbol: r.symbol, description: r.description, socials: r.socials, image: `/i/${r.coin}`,
    stock: { id: r.stock, ticker: s.ticker || r.stock, name: s.name || '', mint: s.mint || '', kind: s.kind || '' },
    claimed: r.claimed / 1e9, pot: r.pot / 1e9, milk: r.milk / 1e9, rounds: r.rounds, liveAt: r.liveAt, sig: r.sig };
};

module.exports = async (req, res) => {
  const q = L.query(req), op = q.op || '';
  try {
    if (req.method === 'OPTIONS') return L.send(res, 204, {});
    // ---- public reads
    if (op === 'health') {
      const [db, alt, slot] = await Promise.all([DB.ping().catch(e => 'error: ' + L.clean(e.message, 60)), X.lookupTable().catch(() => null), S.rpc('getSlot', []).catch(() => null)]);
      return L.send(res, 200, { ok: true, version: VERSION, db, rpc: !!slot, slot, lookupTable: alt ? alt.key.toBase58() : null, engine: await X.engineAddress().catch(() => null), milkCa: process.env.MILK_CA || null });
    }
    if (op === 'config') {
      return L.send(res, 200, { split: E.SPLIT, creatorBps: X.CREATOR_BPS, engineBps: X.ENGINE_BPS, roundMin: E.ROUND_MIN / 1e9, minHoldPct: E.MIN_HOLD_PCT,
        pumpCreatorFeeBps: await creatorFeeBps().catch(() => null), engine: await X.engineAddress(), ca: process.env.MILK_CA || null, x: process.env.MILK_X || null }, 'public, max-age=60');
    }
    if (op === 'stats') {
      const t = await L.cached('totals', 15e3, () => DB.totals());
      return L.send(res, 200, { ...t, claimed: t.claimed / 1e9, bought: t.bought / 1e9, milk: t.milk / 1e9, lastTick: Number(await DB.getMeta('lastTick').catch(() => 0)) || null }, 'public, max-age=15');
    }
    if (op === 'stocks') {
      const r = await M.stocks();
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
      return L.send(res, 200, r, 'public, max-age=20');
    }
    if (op === 'logo') {
      const mint = String(q.m || ''); need(isAddr(mint), 'bad mint', 404);
      const { type, buf } = await M.logo(mint);
      res.statusCode = 200; res.setHeader('content-type', type); res.setHeader('x-content-type-options', 'nosniff');
      res.setHeader('cache-control', 'public, max-age=86400'); res.setHeader('CDN-Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');
      return res.end(buf);
    }
    if (op === 'chart') {
      const mint = String(q.m || ''); need(isAddr(mint), 'bad mint', 404);
      const tf = q.tf === '7d' ? '7d' : '24h';
      const r = await M.chart(mint, tf);
      res.setHeader('CDN-Cache-Control', `public, s-maxage=${tf === '7d' ? 1200 : 300}, stale-while-revalidate=3600`);
      return L.send(res, 200, r, 'public, max-age=60');
    }
    if (op === 'sol') return L.send(res, 200, { usd: await M.solUsd() }, 'public, max-age=60');
    if (op === 'coins') return L.send(res, 200, await coinsLive(), 'public, max-age=10, s-maxage=15');
    if (op === 'coin') {
      const coin = String(q.mint || ''); need(isAddr(coin), 'That is not a Solana address.');
      const row = await DB.byCoin(coin); need(row && row.status === 'live', 'No MILK coin at that address.', 404);
      const [cv, split, usd, vault, events] = await Promise.all([S.curves([coin]).catch(() => ({})), X.splitOnChain(coin).catch(() => null), M.solUsd().catch(() => null), X.vault(coin).catch(() => null), DB.events({ coin, limit: 80 })]);
      return L.send(res, 200, { coin: { ...pub(row), curve: cv[coin] || null }, split, usd, vault, events, engine: await X.engineAddress() }, 'public, max-age=10');
    }
    if (op === 'events') {
      const coin = isAddr(q.coin || '') ? q.coin : '', kind = /^(claim|buy|pay|milk|burn)$/.test(q.kind || '') ? q.kind : '';
      return L.send(res, 200, { events: await DB.events({ coin, kind, limit: Math.min(200, Number(q.limit) || 60) }) }, 'public, max-age=10');
    }
    if (op === 'holders') {
      const coin = String(q.mint || ''); need(isAddr(coin), 'That is not a Solana address.');
      const row = await DB.byCoin(coin); need(row && row.status === 'live', 'No MILK coin at that address.', 404);
      const list = await L.cached('holders:' + coin, 30e3, () => E.holdersOf(coin));
      const min = 1e15 * E.MIN_HOLD_PCT / 100;
      return L.send(res, 200, { coin, minHold: min / 1e6, holders: list.slice(0, 60).map(h => ({ owner: h.owner, tokens: Number(h.amount) / 1e6, pct: Number(h.amount) / 1e13, paid: Number(h.amount) >= min })) }, 'public, max-age=30');
    }
    if (op === 'balance') {
      const owner = String(q.owner || ''); need(isAddr(owner), 'bad address');
      const [lam, usd] = await Promise.all([S.balance(owner), M.solUsd().catch(() => null)]);
      return L.send(res, 200, { sol: lam / 1e9, usd });
    }
    if (op === 'bag') {
      // a wallet's MILK coins (on-chain balances) and every stock payout MILK sent it (the ledger)
      const owner = String(q.owner || ''); need(isAddr(owner), 'Paste a Solana wallet address.');
      const r = await L.cached('bag:' + owner, 20e3, async () => {
        const rows = await DB.live(500), byCoin = new Map(rows.map(x => [x.coin, x]));
        const ta = await S.rpc('getTokenAccountsByOwner', [owner, { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' }, { encoding: 'jsonParsed', commitment: 'confirmed' }]).catch(() => ({ value: [] }));
        const held = new Map();
        for (const a of (ta && ta.value) || []) { const i = a.account.data && a.account.data.parsed && a.account.data.parsed.info; if (!i || !byCoin.has(i.mint)) continue; const amt = Number(i.tokenAmount.amount) / 1e6; if (amt > 0) held.set(i.mint, (held.get(i.mint) || 0) + amt); }
        const paid = await DB.paidTo(owner, 300);
        const sums = new Map(); for (const e of paid) sums.set(e.asset, (sums.get(e.asset) || 0n) + BigInt(String(e.amount).split('.')[0] || '0'));
        const info = sums.size ? await M.tokens([...sums.keys()]).catch(() => ({})) : {};
        return {
          owner,
          coins: [...held.entries()].map(([coin, tokens]) => { const c = byCoin.get(coin), s = ST.BY_ID.get(c.stock) || {}; return { coin, name: c.name, symbol: c.symbol, image: `/i/${coin}`, tokens, pct: tokens / 1e7, pays: s.ticker || c.stock, paidOut: (tokens / 1e9) >= E.MIN_HOLD_PCT / 100 }; }).sort((a, b) => b.tokens - a.tokens),
          stocks: [...sums.entries()].map(([mint, raw]) => { const t = info[mint] || {}, s = ST.BY_MINT.get(mint) || {}, amt = t.decimals != null ? Number(raw) / 10 ** t.decimals : null; return { mint, ticker: s.ticker || '?', amount: amt, usd: amt != null && t.price != null ? amt * t.price : null }; }),
          payouts: paid.slice(0, 30),
        };
      });
      return L.send(res, 200, r, 'public, max-age=15');
    }
    if (op === 'engine') {
      const a = await X.engineAddress();
      return L.send(res, 200, { address: a, balance: (await S.balance(a).catch(() => null)) / 1e9, lastTick: Number(await DB.getMeta('lastTick').catch(() => 0)) || null }, 'public, max-age=20');
    }
    // ---- pump.fun metadata for each coin (the URI written in the coin's on-chain metadata)
    if (op === 'meta') {
      const id = String(q.id || '').replace(/\.json$/, ''); need(isAddr(id), 'bad id', 404);
      const row = await DB.byCoin(id); need(row, 'not found', 404);
      const o = origin(req), s = ST.BY_ID.get(row.stock) || {};
      return L.send(res, 200, {
        name: row.name, symbol: row.symbol, description: row.description, image: `${o}/i/${row.coin}`, showName: true, createdOn: o,
        ...(row.socials.twitter ? { twitter: row.socials.twitter } : {}), ...(row.socials.telegram ? { telegram: row.socials.telegram } : {}), ...(row.socials.website ? { website: row.socials.website } : {}),
        milk: { pays: s.ticker || row.stock, stockMint: s.mint || '' },
      }, row.status === 'live' ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=30');
    }
    if (op === 'image') {
      const id = String(q.id || '').replace(/\.(png|jpe?g|webp|gif)$/, ''); need(isAddr(id), 'bad id', 404);
      const im = await DB.getImage(id); need(im, 'not found', 404);
      res.statusCode = 200; res.setHeader('content-type', im.mime); res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800');
      return res.end(Buffer.from(im.data, 'base64'));
    }
    // ---- the engine's clock: Vercel cron (or anyone; the lock keeps it to one run at a time)
    if (op === 'tick') return L.send(res, 200, await E.tick({ max: 6 }));

    // ---- writes
    if (req.method !== 'POST') throw L.err(404, 'unknown endpoint');
    const b = await L.body(req, 1.8e6);
    if (op === 'prepare') {
      need(!L.limited('prep:' + L.ip(req), 12, 60e3), 'Too many tries. Wait a minute.', 429);
      const owner = String(b.owner || ''); need(isAddr(owner), 'Connect a wallet first.');
      const stock = ST.BY_ID.get(String(b.stock || '')); need(stock, 'Pick the stock your coin pays its holders in.');
      const meta = cleanMeta(b), img = imageFrom(b.image);
      const r = await X.prepare({ owner, name: meta.name, symbol: meta.symbol, uri: coin => `${origin(req)}/m/${coin}` });
      await DB.putImage(r.coin, img.mime, img.buf);
      await DB.putPrepared({ coin: r.coin, creator: owner, ...meta, stock: stock.id });
      return L.send(res, 200, { ...r, metadata: `${origin(req)}/m/${r.coin}` });
    }
    if (op === 'send') {
      need(!L.limited('send:' + L.ip(req), 30, 60e3), 'Too many tries. Wait a minute.', 429);
      const tx = String(b.tx || ''); need(/^[A-Za-z0-9+/=]{100,2400}$/.test(tx), 'bad transaction');
      const sig = await S.rpc('sendTransaction', [tx, { encoding: 'base64', skipPreflight: true, maxRetries: 4 }], 15000);
      return L.send(res, 200, { sig });
    }
    if (op === 'status') {
      const sig = String(b.sig || ''); need(SIG.test(sig), 'bad signature');
      const r = await S.rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]);
      const v = r.value && r.value[0];
      return L.send(res, 200, { status: v ? (v.err ? 'failed' : v.confirmationStatus || 'processed') : 'unknown', err: v && v.err ? L.clean(JSON.stringify(v.err), 160) : null });
    }
    if (op === 'confirm') {
      const coin = String(b.coin || ''); need(isAddr(coin), 'bad coin');
      const row = await DB.byCoin(coin); need(row, 'Nothing was prepared for this coin.', 404);
      if (row.status === 'live') return L.send(res, 200, { live: true, coin: pub(row) });
      const a = await S.account(coin);
      if (!a) return L.send(res, 200, { live: false });
      const split = await X.splitOnChain(coin).catch(() => null);
      const done = await DB.markLive(coin, SIG.test(b.sig || '') ? b.sig : null);
      L.bust('coins'); L.bust('totals');
      return L.send(res, 200, { live: true, coin: pub(done), split });
    }
    if (op === 'buy') {
      const owner = String(b.owner || ''), coin = String(b.coin || ''), sol = Number(b.sol);
      need(isAddr(owner) && isAddr(coin), 'bad request');
      need(sol >= 0.001 && sol <= 50, 'Pick between 0.001 and 50 SOL.');
      return L.send(res, 200, await X.buyTx({ owner, coin, lamports: Math.floor(sol * 1e9) }));
    }
    if (op === 'payout') {
      const payer = String(b.payer || ''), coin = String(b.coin || '');
      need(isAddr(payer) && isAddr(coin), 'bad request');
      need(!L.limited('payout:' + L.ip(req), 20, 60e3), 'Too many tries. Wait a minute.', 429);
      const row = await DB.byCoin(coin); need(row && row.status === 'live', 'No MILK coin at that address.', 404);
      return L.send(res, 200, await X.payoutTx({ payer, coin }));
    }
    if (op === 'claimed') {
      const coin = String(b.coin || ''), sig = String(b.sig || '');
      need(isAddr(coin) && SIG.test(sig), 'bad request');
      const row = await DB.byCoin(coin); need(row && row.status === 'live', 'No MILK coin at that address.', 404);
      const r = await E.credit(coin, sig); L.bust('totals');
      return L.send(res, 200, r);
    }
    throw L.err(404, 'unknown endpoint');
  } catch (e) {
    const code = e.code && e.code >= 400 && e.code < 600 ? e.code : 500;
    if (code === 500) console.error(op, e);
    return L.send(res, code, { error: code === 500 ? 'Something went wrong on our side. Try again.' : e.message, ...(e.sim ? { sim: e.sim } : {}) });
  }
};
