// The MILK engine. Every few minutes it looks at a handful of coins, oldest look first:
//   1. claim: pushes each coin's creator fees out of pump.fun's vault (10% lands with the creator, 90% with the engine)
//   2. round: once a coin's pot reaches MILK_ROUND_MIN SOL, it spends the pot by the rule shown on the site:
//        70% of the coin's fees buy the coin's stock on Jupiter and go to its holders, pro rata
//        15% buy $MILK and burn it (set aside until $MILK exists)        5% pay the engine's network fees and token accounts
// Every transaction is simulated first, signed by the engine key (derived from the server secret), and written to the ledger.
const BN = require('bn.js');
const { PublicKey, ComputeBudgetProgram, VersionedTransaction, TransactionMessage, AddressLookupTableAccount, TransactionInstruction } = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const L = require('./_lib'), S = require('./_sol'), DB = require('./_db'), X = require('./_launch'), M = require('./_market'), ST = require('./_stocks');

const SPLIT = { holders: 70, milk: 15, ops: 5, creator: 10 };          // shares of a coin's creator fees, in percent
const ROUND_MIN = Math.round(1e9 * Math.max(0.02, Number(process.env.MILK_ROUND_MIN || 0.1)));
const MIN_HOLD_PCT = Math.max(0, Number(process.env.MILK_MIN_HOLD_PCT || 0.05));   // % of supply a holder needs to be paid
const MAX_PAYEES = 40, PER_TX = 6, ATA_MIN_USD = 1;
const MILK_CA = L.B58.test(process.env.MILK_CA || '') ? process.env.MILK_CA : null;
const SUPPLY = 1e15;   // pump.fun coins: 1B tokens, 6 decimals

const TOKEN = spl.TOKEN_PROGRAM_ID.toBase58(), TOKEN22 = spl.TOKEN_2022_PROGRAM_ID.toBase58();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function confirm(sig, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await S.rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]).catch(() => null);
    const v = r && r.value && r.value[0];
    if (v && v.err) throw L.err(400, 'transaction failed on-chain: ' + L.clean(JSON.stringify(v.err), 120));
    if (v && (v.confirmationStatus === 'confirmed' || v.confirmationStatus === 'finalized')) return true;
    await sleep(1500);
  }
  return false;
}
// simulate, sign with the engine key, send, wait for confirmation
async function run(ixs, alts = [], cu = 300000, prioFor) {
  const eng = await X.engineKey(), prio = await X.priorityFee(prioFor);
  const bh = await S.blockhash();
  const all = [ComputeBudgetProgram.setComputeUnitLimit({ units: cu }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: prio }), ...ixs];
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: eng.publicKey, recentBlockhash: bh.blockhash, instructions: all }).compileToV0Message(alts.filter(Boolean)));
  const probe = Buffer.from(tx.serialize()).toString('base64');
  const sim = await S.simulate(probe);
  if (!sim.ok) { const e = L.err(400, 'simulation failed: ' + (sim.logs.slice(-2).join(' ') || sim.err)); e.sim = sim; throw e; }
  tx.sign([eng]);
  const sig = await S.rpc('sendTransaction', [Buffer.from(tx.serialize()).toString('base64'), { encoding: 'base64', skipPreflight: true, maxRetries: 4 }], 15000);
  const ok = await confirm(sig);
  return { sig, ok, logs: sim.logs };
}

const ixFrom = i => new TransactionInstruction({ programId: new PublicKey(i.programId), keys: i.accounts.map(a => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })), data: Buffer.from(i.data, 'base64') });
async function luts(addrs) {
  if (!addrs || !addrs.length) return [];
  const acc = await S.accounts(addrs);
  return acc.map((a, i) => a ? new AddressLookupTableAccount({ key: new PublicKey(addrs[i]), state: AddressLookupTableAccount.deserialize(S.b64(a.data[0])) }) : null).filter(Boolean);
}
// raw token balance of one of the engine's accounts (0 if the account doesn't exist)
async function tokenBal(owner, mint, program) {
  const ata = spl.getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), true, new PublicKey(program));
  const a = await S.account(ata.toBase58());
  return { ata, amount: a ? S.b64(a.data[0]).readBigUInt64LE(64) : 0n };
}

// SOL → token on Jupiter for the engine. Returns the raw amount that actually arrived.
async function buy(mint, lamports, program) {
  const eng = (await X.engineKey()).publicKey.toBase58();
  const before = await tokenBal(eng, mint, program);
  const { quote, si } = await M.swapIxs({ owner: eng, outMint: mint, amount: lamports });
  const ixs = [...(si.setupInstructions || []).map(ixFrom), ixFrom(si.swapInstruction), ...(si.cleanupInstruction ? [ixFrom(si.cleanupInstruction)] : [])];
  const r = await run(ixs, await luts(si.addressLookupTableAddresses || []), 1000000, 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
  const after = await tokenBal(eng, mint, program);
  const got = after.amount > before.amount ? after.amount - before.amount : (r.ok ? BigInt(quote.minOut) : 0n);
  return { sig: r.sig, ok: r.ok, got, quote };
}

// who holds a coin right now: wallets only (pools, the curve and other program accounts are skipped), largest first
async function holdersOf(coin) {
  const out = new Map();
  if (process.env.RPC_URL) {
    const r = await S.rpc('getProgramAccounts', [TOKEN22, { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 32, length: 40 }, filters: [{ memcmp: { offset: 0, bytes: coin } }] }], 25000);
    for (const x of r || []) { const d = S.b64(x.account.data[0]); if (d.length < 40) continue; const o = new PublicKey(d.subarray(0, 32)).toBase58(), a = d.readBigUInt64LE(32); if (a > 0n) out.set(o, (out.get(o) || 0n) + a); }
  } else {
    const r = await S.rpc('getTokenLargestAccounts', [coin, { commitment: 'confirmed' }]);
    const list = (r && r.value) || [];
    const acc = await S.accounts(list.map(x => x.address));
    acc.forEach((a, i) => { if (!a) return; const d = S.b64(a.data[0]); const o = new PublicKey(d.subarray(32, 64)).toBase58(); out.set(o, (out.get(o) || 0n) + BigInt(list[i].amount)); });
  }
  const eng = (await X.engineKey()).publicKey.toBase58();
  return [...out.entries()].filter(([o]) => o !== eng && PublicKey.isOnCurve(new PublicKey(o).toBytes()))
    .map(([owner, amount]) => ({ owner, amount })).sort((a, b) => (b.amount > a.amount ? 1 : -1));
}

// send `total` raw units of a stock to a coin's holders, pro rata. Shares too small to cover a new token account wait.
async function payHolders(row, st, info, total) {
  const eng = (await X.engineKey()).publicKey, mint = new PublicKey(st.mint), program = new PublicKey(info.program || TOKEN22);
  const min = BigInt(Math.floor(SUPPLY * MIN_HOLD_PCT / 100));
  const list = (await holdersOf(row.coin)).filter(h => h.amount >= min).slice(0, MAX_PAYEES);
  if (!list.length) return { paid: 0n, payees: 0, note: 'no holder above the minimum yet' };
  const sum = list.reduce((a, h) => a + h.amount, 0n);
  const shares = list.map(h => ({ ...h, share: total * h.amount / sum })).filter(h => h.share > 0n);
  const atas = shares.map(h => spl.getAssociatedTokenAddressSync(mint, new PublicKey(h.owner), false, program));
  const exist = await S.accounts(atas.map(a => a.toBase58()));
  const unit = info.price ? info.price / 10 ** info.decimals : 0;
  const src = spl.getAssociatedTokenAddressSync(mint, eng, true, program);
  let paid = 0n, payees = 0;
  const go = shares.map((h, i) => ({ ...h, ata: atas[i], has: !!exist[i] })).filter(h => h.has || Number(h.share) * unit >= ATA_MIN_USD);
  for (let i = 0; i < go.length; i += PER_TX) {
    const part = go.slice(i, i + PER_TX), ixs = [];
    for (const h of part) {
      if (!h.has) ixs.push(spl.createAssociatedTokenAccountIdempotentInstruction(eng, h.ata, new PublicKey(h.owner), mint, program));
      ixs.push(spl.createTransferCheckedInstruction(src, mint, h.ata, eng, h.share, info.decimals, [], program));
    }
    const r = await run(ixs, [], 40000 * part.length + 30000);
    for (const h of part) { await DB.event({ coin: row.coin, kind: 'pay', amount: h.share.toString(), asset: st.mint, who: h.owner, sig: r.sig, note: st.ticker }); paid += h.share; payees++; }
  }
  return { paid, payees };
}

// one coin's round: buy its stock, pay its holders, set aside (or buy and burn) $MILK
async function round(row) {
  const st = ST.BY_ID.get(row.stock); if (!st) throw L.err(400, 'unknown stock ' + row.stock);
  const pot = row.pot, engineShare = SPLIT.holders + SPLIT.milk + SPLIT.ops;
  const toStock = Math.floor(pot * SPLIT.holders / engineShare), toMilk = Math.floor(pot * SPLIT.milk / engineShare);
  const info = (await M.tokens([st.mint]))[st.mint];
  if (!info || info.decimals == null) throw L.err(502, 'no market data for ' + st.ticker);
  await DB.bump(row.coin, { pot: -pot, rounds: 1, round: true });          // the pot is spent first, so a retry can't spend it twice
  const out = { coin: row.coin, stock: st.ticker, pot };
  try {
    const b = await buy(st.mint, toStock, info.program || TOKEN22);
    await DB.event({ coin: row.coin, kind: 'buy', lamports: toStock, amount: b.got.toString(), asset: st.mint, sig: b.sig, note: st.ticker + (b.ok ? '' : ' (unconfirmed)') });
    const carry = BigInt((await DB.getMeta('carry:' + row.coin)) || '0');
    const p = await payHolders(row, st, info, b.got + carry);
    await DB.setMeta('carry:' + row.coin, String(b.got + carry - p.paid));
    Object.assign(out, { bought: b.got.toString(), paid: p.paid.toString(), payees: p.payees, note: p.note || '' });
  } catch (e) { await DB.bump(row.coin, { pot: toStock }); out.error = 'stock: ' + e.message; }
  if (MILK_CA) {
    try {
      const m = await buy(MILK_CA, toMilk, TOKEN22);
      if (m.got > 0n) {
        const eng = (await X.engineKey()).publicKey, mint = new PublicKey(MILK_CA), prog = spl.TOKEN_2022_PROGRAM_ID;
        const r = await run([spl.createBurnCheckedInstruction(spl.getAssociatedTokenAddressSync(mint, eng, true, prog), mint, eng, m.got, 6, [], prog)], [], 60000);
        await DB.event({ coin: row.coin, kind: 'burn', lamports: toMilk, amount: m.got.toString(), asset: MILK_CA, sig: r.sig });
      }
      out.milk = 'burned';
    } catch (e) { await DB.bump(row.coin, { milk: toMilk }); await DB.event({ coin: row.coin, kind: 'milk', lamports: toMilk, note: 'set aside: ' + L.clean(e.message, 60) }); out.milk = 'set aside'; }
  } else { await DB.bump(row.coin, { milk: toMilk }); await DB.event({ coin: row.coin, kind: 'milk', lamports: toMilk, note: 'set aside until $MILK is live' }); out.milk = 'set aside'; }
  return out;
}

// how many lamports a confirmed transaction moved into the engine (the network fee added back when the engine paid it)
async function engineGain(sig, coin) {
  if (process.env.MILK_MOCK) return null;
  const eng = (await X.engineKey()).publicKey.toBase58();
  for (let i = 0; i < 6; i++) {
    const t = await S.rpc('getTransaction', [sig, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]).catch(() => null);
    if (t && t.meta) {
      if (t.meta.err) return 0;
      const la = t.meta.loadedAddresses || {}, keys = [...t.transaction.message.accountKeys, ...(la.writable || []), ...(la.readonly || [])];
      if (coin) { const sc = require('@pump-fun/pump-sdk').feeSharingConfigPda(new PublicKey(coin)).toBase58(); if (!keys.includes(sc)) return 0; }
      const k = keys.indexOf(eng); if (k < 0) return 0;
      return Math.max(0, t.meta.postBalances[k] - t.meta.preBalances[k] + (k === 0 ? t.meta.fee : 0));
    }
    await sleep(1500);
  }
  return null;
}
// credit a coin's pot from a payout someone else pushed (the coin page's button): read from the chain, once per signature
async function credit(coin, sig) {
  if (await DB.hasSig(sig)) return { credited: 0, already: true };
  const gain = await engineGain(sig, coin);
  if (!gain) return { credited: 0 };
  await DB.bump(coin, { claimed: gain, pot: gain, claim: true });
  await DB.event({ coin, kind: 'claim', lamports: gain, sig, note: 'pushed by a visitor' });
  return { credited: gain };
}

// one pass. Holds a 4-minute lock so overlapping runs never touch the same pot.
async function tick({ max = 6 } = {}) {
  if (!(await DB.lock('tick', 240e3))) return { skipped: 'another run is busy' };
  const eng = (await X.engineKey()).publicKey.toBase58(), out = [];
  try {
    let bal = await S.balance(eng).catch(() => 0);
    const rows = await DB.queue(max);
    for (const row of rows) {
      const r = { coin: row.coin };
      await DB.bump(row.coin, { look: true });
      try {
        const v = await X.vault(row.coin);
        r.waiting = v.waiting;
        if (v.ready && bal >= 2e6) {
          const est = Math.floor(v.lamports * X.ENGINE_BPS / 10000);
          const res = await run(await X.payoutIxs({ payer: new PublicKey(eng), coin: row.coin }), [await X.lookupTable()], 300000);
          const gain = res.ok ? await engineGain(res.sig, row.coin) : null, share = gain == null ? est : gain;
          await DB.bump(row.coin, { claimed: share, pot: share, claim: true });
          await DB.event({ coin: row.coin, kind: 'claim', lamports: share, sig: res.sig, note: res.ok ? '' : 'unconfirmed' });
          r.claimed = share; bal += share;
        }
        const fresh = await DB.byCoin(row.coin);
        if (fresh.pot >= ROUND_MIN) r.round = await round(fresh);
      } catch (e) { r.error = L.clean(e.message, 160); }
      out.push(r);
    }
    await DB.setMeta('lastTick', String(Date.now()));
    return { engine: eng, balance: bal / 1e9, coins: out };
  } finally { await DB.unlock('tick'); }
}

module.exports = { SPLIT, ROUND_MIN, MIN_HOLD_PCT, tick, holdersOf, round, credit, engineGain };
