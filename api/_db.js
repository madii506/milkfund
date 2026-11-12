// MILK storage: Neon Postgres when DATABASE_URL is set, memory otherwise (local dev).
// coins (registry + each coin's pot), images (coin art), events (the public ledger), meta (the server secret, locks).
const crypto = require('crypto');
const URL_ = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_URL || '';
let fn = null, ready = null, SECRET = null;
const MEM = { coins: new Map(), images: new Map(), events: [], meta: new Map() };
const sql = () => { if (!URL_) return null; if (!fn) { const { neon } = require('@neondatabase/serverless'); fn = neon(URL_); } return fn; };

async function init() {
  const s = sql(); if (!s) return;
  if (!ready) ready = (async () => {
    await s`create table if not exists mk_coins (
      coin text primary key, creator text not null, name text not null, symbol text not null, description text not null default '',
      socials jsonb not null default '{}', stock text not null, status text not null default 'prepared', sig text,
      claimed bigint not null default 0, pot bigint not null default 0, milk bigint not null default 0, rounds int not null default 0,
      last_claim bigint not null default 0, last_round bigint not null default 0, last_look bigint not null default 0,
      created timestamptz not null default now(), live_at timestamptz)`;
    await s`create index if not exists mk_coins_live on mk_coins (status, live_at desc)`;
    await s`create table if not exists mk_images (id text primary key, mime text not null, data text not null)`;
    await s`create table if not exists mk_meta (k text primary key, v text not null)`;
    await s`create table if not exists mk_events (n bigserial primary key, at bigint not null, coin text not null default '', kind text not null,
      lamports bigint not null default 0, amount numeric not null default 0, asset text not null default '', who text not null default '', sig text, note text not null default '')`;
    await s`create index if not exists mk_events_coin on mk_events (coin, n desc)`;
    await s`create index if not exists mk_events_kind on mk_events (kind, n desc)`;
  })();
  try { await ready; } catch (e) { ready = null; throw e; }
}
async function ping() { const s = sql(); if (!s) return 'memory'; await init(); await s`select 1`; return 'postgres'; }

// the master secret: the engine wallet is derived from it. Created once, never leaves the server.
async function secret() {
  if (SECRET) return SECRET;
  if (process.env.MILK_SECRET) return (SECRET = process.env.MILK_SECRET);
  const s = sql();
  if (!s) { if (!MEM.meta.has('secret')) MEM.meta.set('secret', crypto.randomBytes(32).toString('hex')); return (SECRET = MEM.meta.get('secret')); }
  await init();
  await s`insert into mk_meta (k, v) values ('secret', ${crypto.randomBytes(32).toString('hex')}) on conflict (k) do nothing`;
  const r = await s`select v from mk_meta where k = 'secret'`; return (SECRET = r[0].v);
}
// a short lock so overlapping engine runs never double-spend a pot
async function lock(name, ms) {
  const now = Date.now(), s = sql();
  if (!s) { const t = +(MEM.meta.get('lock:' + name) || 0); if (now - t < ms) return false; MEM.meta.set('lock:' + name, String(now)); return true; }
  await init();
  const r = await s`insert into mk_meta (k, v) values (${'lock:' + name}, ${String(now)})
    on conflict (k) do update set v = excluded.v where (mk_meta.v)::bigint < ${now - ms} returning v`;
  return r.length > 0;
}
async function unlock(name) { const s = sql(); if (!s) { MEM.meta.delete('lock:' + name); return; } await init(); await s`delete from mk_meta where k = ${'lock:' + name}`; }
async function getMeta(k) { const s = sql(); if (!s) return MEM.meta.get(k) || null; await init(); const r = await s`select v from mk_meta where k = ${k}`; return r[0] ? r[0].v : null; }
async function setMeta(k, v) { const s = sql(); if (!s) { MEM.meta.set(k, String(v)); return; } await init(); await s`insert into mk_meta (k, v) values (${k}, ${String(v)}) on conflict (k) do update set v = excluded.v`; }

const N = v => (v == null ? 0 : Number(v));
const shape = r => r ? {
  coin: r.coin, creator: r.creator, name: r.name, symbol: r.symbol, description: r.description, socials: r.socials || {}, stock: r.stock,
  status: r.status, sig: r.sig || null, claimed: N(r.claimed), pot: N(r.pot), milk: N(r.milk), rounds: N(r.rounds),
  lastClaim: N(r.last_claim), lastRound: N(r.last_round), lastLook: N(r.last_look),
  created: r.created ? new Date(r.created).getTime() : null, liveAt: r.live_at ? new Date(r.live_at).getTime() : null,
} : null;

async function putPrepared(c) {
  const s = sql();
  if (!s) { MEM.coins.set(c.coin, { ...c, socials: c.socials || {}, status: 'prepared', claimed: 0, pot: 0, milk: 0, rounds: 0, last_claim: 0, last_round: 0, last_look: 0, created: new Date(), live_at: null }); return; }
  await init();
  await s`insert into mk_coins (coin, creator, name, symbol, description, socials, stock) values
    (${c.coin}, ${c.creator}, ${c.name}, ${c.symbol}, ${c.description || ''}, ${JSON.stringify(c.socials || {})}, ${c.stock})
    on conflict (coin) do nothing`;
}
async function byCoin(coin) {
  const s = sql(); if (!s) return shape(MEM.coins.get(coin) || null);
  await init(); const r = await s`select * from mk_coins where coin = ${coin}`; return shape(r[0]);
}
async function markLive(coin, sig) {
  const s = sql();
  if (!s) { const r = MEM.coins.get(coin); if (r && r.status !== 'live') { r.status = 'live'; r.sig = sig || r.sig; r.live_at = new Date(); } return shape(r); }
  await init();
  const r = await s`update mk_coins set status = 'live', sig = coalesce(${sig}, sig), live_at = coalesce(live_at, now()) where coin = ${coin} returning *`;
  return shape(r[0]);
}
async function live(limit = 300) {
  const s = sql();
  if (!s) return [...MEM.coins.values()].filter(r => r.status === 'live').sort((a, b) => b.live_at - a.live_at).slice(0, limit).map(shape);
  await init(); const r = await s`select * from mk_coins where status = 'live' order by live_at desc limit ${limit}`; return r.map(shape);
}
// coins launched while nobody watched: prepared rows younger than a day, oldest first
async function stale(limit = 20) {
  const s = sql(), cutoff = Date.now() - 864e5;
  if (!s) return [...MEM.coins.values()].filter(r => r.status === 'prepared' && r.created.getTime() > cutoff).slice(0, limit).map(shape);
  await init(); const r = await s`select * from mk_coins where status = 'prepared' and created > now() - interval '1 day' order by created asc limit ${limit}`; return r.map(shape);
}
// the engine's turn order: the coins it looked at longest ago
async function queue(limit = 8) {
  const s = sql();
  if (!s) return [...MEM.coins.values()].filter(r => r.status === 'live').sort((a, b) => a.last_look - b.last_look).slice(0, limit).map(shape);
  await init(); const r = await s`select * from mk_coins where status = 'live' order by last_look asc limit ${limit}`; return r.map(shape);
}
// pot bookkeeping: every lamport the engine receives for a coin, and what it spends from it
async function bump(coin, f) {
  const s = sql(), now = Date.now();
  if (!s) { const r = MEM.coins.get(coin); if (!r) return; r.claimed += f.claimed || 0; r.pot += f.pot || 0; r.milk += f.milk || 0; r.rounds += f.rounds || 0; if (f.claim) r.last_claim = now; if (f.round) r.last_round = now; if (f.look) r.last_look = now; return; }
  await init();
  await s`update mk_coins set claimed = claimed + ${f.claimed || 0}, pot = greatest(0, pot + ${f.pot || 0}), milk = milk + ${f.milk || 0}, rounds = rounds + ${f.rounds || 0},
    last_claim = case when ${!!f.claim} then ${now} else last_claim end, last_round = case when ${!!f.round} then ${now} else last_round end,
    last_look = case when ${!!f.look} then ${now} else last_look end where coin = ${coin}`;
}

async function putImage(id, mime, buf) {
  const s = sql(), data = Buffer.from(buf).toString('base64');
  if (!s) { MEM.images.set(id, { mime, data }); return; }
  await init(); await s`insert into mk_images (id, mime, data) values (${id}, ${mime}, ${data}) on conflict (id) do update set mime = excluded.mime, data = excluded.data`;
}
async function getImage(id) {
  const s = sql(); if (!s) return MEM.images.get(id) || null;
  await init(); const r = await s`select mime, data from mk_images where id = ${id}`; return r[0] || null;
}

// the ledger: claim (fees pushed out to the engine), buy (stock bought for holders), pay (stock sent to one holder),
// milk (SOL set aside for $MILK), burn ($MILK bought and burned)
async function event(e) {
  const s = sql(), row = { at: Date.now(), coin: e.coin || '', kind: e.kind, lamports: Math.round(e.lamports || 0), amount: String(e.amount || 0), asset: e.asset || '', who: e.who || '', sig: e.sig || null, note: e.note || '' };
  if (!s) { MEM.events.push({ n: MEM.events.length + 1, ...row }); return; }
  await init();
  await s`insert into mk_events (at, coin, kind, lamports, amount, asset, who, sig, note) values (${row.at}, ${row.coin}, ${row.kind}, ${row.lamports}, ${row.amount}, ${row.asset}, ${row.who}, ${row.sig}, ${row.note})`;
}
const shapeE = r => ({ n: N(r.n), at: N(r.at), coin: r.coin, kind: r.kind, lamports: N(r.lamports), amount: String(r.amount), asset: r.asset, who: r.who, sig: r.sig || null, note: r.note || '' });
async function events({ coin = '', kind = '', limit = 60 } = {}) {
  const s = sql();
  if (!s) return MEM.events.filter(e => (!coin || e.coin === coin) && (!kind || e.kind === kind)).slice(-limit).reverse().map(shapeE);
  await init();
  const r = coin ? (kind ? await s`select * from mk_events where coin = ${coin} and kind = ${kind} order by n desc limit ${limit}` : await s`select * from mk_events where coin = ${coin} order by n desc limit ${limit}`)
    : (kind ? await s`select * from mk_events where kind = ${kind} order by n desc limit ${limit}` : await s`select * from mk_events order by n desc limit ${limit}`);
  return r.map(shapeE);
}
async function paidTo(who, limit = 200) {
  const s = sql(); if (!s) return MEM.events.filter(e => e.kind === 'pay' && e.who === who).slice(-limit).reverse().map(shapeE);
  await init(); const r = await s`select * from mk_events where kind = 'pay' and who = ${who} order by n desc limit ${limit}`; return r.map(shapeE);
}
async function hasSig(sig) {
  const s = sql(); if (!s) return MEM.events.some(e => e.sig === sig);
  await init(); const r = await s`select 1 from mk_events where sig = ${sig} limit 1`; return r.length > 0;
}
async function totals() {
  const s = sql();
  if (!s) {
    const t = { coins: [...MEM.coins.values()].filter(r => r.status === 'live').length, claimed: 0, bought: 0, payouts: 0, holdersPaid: 0, milk: 0, burned: 0 };
    const who = new Set();
    for (const e of MEM.events) { if (e.kind === 'claim') t.claimed += e.lamports; if (e.kind === 'buy') t.bought += e.lamports; if (e.kind === 'pay') { t.payouts++; who.add(e.who); } if (e.kind === 'milk') t.milk += e.lamports; if (e.kind === 'burn') t.burned += Number(e.amount); }
    t.holdersPaid = who.size; return t;
  }
  await init();
  const [c] = await s`select count(*)::int n from mk_coins where status = 'live'`;
  const [e] = await s`select coalesce(sum(lamports) filter (where kind = 'claim'), 0) claimed, coalesce(sum(lamports) filter (where kind = 'buy'), 0) bought,
    count(*) filter (where kind = 'pay') payouts, count(distinct who) filter (where kind = 'pay') holders, coalesce(sum(lamports) filter (where kind = 'milk'), 0) milk,
    coalesce(sum(amount) filter (where kind = 'burn'), 0) burned from mk_events`;
  return { coins: c.n, claimed: N(e.claimed), bought: N(e.bought), payouts: N(e.payouts), holdersPaid: N(e.holders), milk: N(e.milk), burned: N(e.burned) };
}

module.exports = { init, ping, secret, lock, unlock, getMeta, setMeta, putPrepared, byCoin, markLive, live, stale, queue, bump, putImage, getImage, event, events, paidTo, hasSig, totals };
