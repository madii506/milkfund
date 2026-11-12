// The MILK launch transaction, built with pump.fun's own SDK. One v0 transaction, the creator's wallet signs it:
//   create_v2 (creator = the launcher) → create_fee_sharing_config → update_fee_shares_v2 [creator 10%, MILK engine 90%]
// update_fee_shares revokes the sharing config's admin in the same instruction, so the split is final the moment the coin
// exists. MILK adds one signature: the coin's fresh mint key, generated for this message and never stored.
const crypto = require('crypto');
const BN = require('bn.js');
const { Keypair, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, AddressLookupTableAccount } = require('@solana/web3.js');
const { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
const SDK = require('@pump-fun/pump-sdk');
const { PUMP_SDK } = SDK;
const L = require('./_lib'), S = require('./_sol'), DB = require('./_db');

const CREATOR_BPS = 1000, ENGINE_BPS = 9000, MAX_TX = 1232;

// the engine wallet: receives 90% of every MILK coin's creator fees, buys the stocks, pays the holders
let ENGINE = null;
async function engineKey() {
  if (ENGINE) return ENGINE;
  const s = await DB.secret();
  return (ENGINE = Keypair.fromSeed(crypto.createHmac('sha256', String(s)).update('milk:engine:v1').digest()));
}
async function engineAddress() { return (await engineKey()).publicKey.toBase58(); }

async function launchIxs({ owner, mint, name, symbol, uri, engine }) {
  const creator = new PublicKey(owner);
  return [
    await PUMP_SDK.createV2Instruction({ mint, name, symbol, uri, creator, user: creator, mayhemMode: false }),
    await PUMP_SDK.createFeeSharingConfig({ creator, mint, pool: null }),
    await PUMP_SDK.updateFeeSharesV2({
      authority: creator, mint, currentShareholders: [creator],
      newShareholders: [{ address: creator, shareBps: CREATOR_BPS }, { address: engine, shareBps: ENGINE_BPS }],
      quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID, bondingCurveComplete: false,
    }),
  ];
}

// lookup table: without one the launch is ~1.35 KB, over Solana's 1,232-byte limit. The default is a public table that
// already holds all 14 shared accounts (checked on mainnet 2026-11-04); MILK_ALT (comma list) overrides.
const DEFAULT_ALT = 'Hyif6eWb8x88RVrvjPfabsgRYnwkVnyByEXTVTXbUcyP';
async function lookupTable() {
  const list = (process.env.MILK_ALT || DEFAULT_ALT).split(',').map(s => s.trim()).filter(a => L.B58.test(a));
  return L.cached('alt:' + list.join(','), 300e3, async () => {
    for (const addr of list) {
      const a = await S.account(addr).catch(() => null);
      if (!a) continue;
      const t = new AddressLookupTableAccount({ key: new PublicKey(addr), state: AddressLookupTableAccount.deserialize(S.b64(a.data[0])) });
      if (t.isActive()) return t;
    }
    return null;
  });
}
async function priorityFee(program = S.PUMP) {
  return L.cached('prio:' + program, 20e3, async () => {
    try {
      const r = await S.rpc('getRecentPrioritizationFees', [[program]]);
      const v = (r || []).map(x => x.prioritizationFee).filter(x => x > 0).sort((a, b) => a - b);
      const p = v.length ? v[Math.floor(v.length * 0.75)] : 100000;
      return Math.max(50000, Math.min(1500000, p));
    } catch { return 150000; }
  });
}
function compile(payer, ixs, blockhash, alts) {
  const msg = new TransactionMessage({ payerKey: new PublicKey(payer), recentBlockhash: blockhash, instructions: ixs }).compileToV0Message((alts || []).filter(Boolean));
  return new VersionedTransaction(msg);
}
const bytesOf = tx => { try { return tx.serialize(); } catch { return null; } };

// Build, simulate on mainnet, size the compute budget, co-sign with the fresh mint key.
async function prepare({ owner, name, symbol, uri: uriFor }) {
  const engine = (await engineKey()).publicKey, kp = Keypair.generate(), mint = kp.publicKey;
  const uri = typeof uriFor === 'function' ? uriFor(mint.toBase58()) : uriFor;
  const alt = await lookupTable();
  const base = await launchIxs({ owner, mint, name, symbol, uri, engine });
  const prio = await priorityFee(), bh = await S.blockhash();
  const withBudget = units => [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: prio }), ...base];
  const probe = compile(owner, withBudget(600000), bh.blockhash, [alt]);
  const probeBytes = bytesOf(probe);
  if (!probeBytes || probeBytes.length > MAX_TX) throw L.err(503, alt ? 'The launch transaction is too large.' : 'MILK is not open yet: the lookup table is not reachable.');
  const [pre, sim] = await Promise.all([S.balance(owner), S.simulate(Buffer.from(probeBytes).toString('base64'), [owner])]);
  if (!sim.ok) {
    const why = /insufficient (lamports|funds)|0x1\b/i.test(sim.err + sim.logs.join(' ')) ? 'Not enough SOL in this wallet for the launch (about 0.03 SOL).' : 'The launch would fail on-chain: ' + (sim.logs.slice(-2).join(' ') || sim.err);
    const e = L.err(400, why); e.sim = sim; throw e;
  }
  const units = Math.min(1400000, Math.ceil((sim.units || 200000) * 1.2) + 20000);
  const tx = compile(owner, withBudget(units), bh.blockhash, [alt]);
  tx.sign([kp]);
  const bytes = tx.serialize();
  const post = sim.post && sim.post[0];
  return {
    tx: Buffer.from(bytes).toString('base64'), coin: mint.toBase58(), bytes: bytes.length, units, prio,
    lastValidBlockHeight: bh.lastValidBlockHeight, cost: post != null && pre != null ? Math.max(0, pre - post) / 1e9 : null,
    sharingConfig: SDK.feeSharingConfigPda(mint).toBase58(),
    split: [{ address: owner, bps: CREATOR_BPS }, { address: engine.toBase58(), bps: ENGINE_BPS }],
  };
}

// the creator's own first buy, right after the launch lands (the coin must exist for pump's buy accounts)
const ai = a => a ? { data: S.b64(a.data[0]), executable: a.executable, lamports: a.lamports, owner: new PublicKey(a.owner), rentEpoch: a.rentEpoch || 0 } : null;
async function buyTx({ owner, coin, lamports, slippagePct = 15 }) {
  const user = new PublicKey(owner), mint = new PublicKey(coin);
  const ata = getAssociatedTokenAddressSync(mint, user, true, TOKEN_2022_PROGRAM_ID);
  const [g, fc, bc, ua] = await S.accounts([SDK.GLOBAL_PDA.toBase58(), SDK.PUMP_FEE_CONFIG_PDA.toBase58(), SDK.bondingCurvePda(mint).toBase58(), ata.toBase58()]);
  if (!g || !bc) throw L.err(404, 'The coin is not on-chain yet.');
  const global = PUMP_SDK.decodeGlobal(ai(g)), bondingCurve = PUMP_SDK.decodeBondingCurve(ai(bc)), feeConfig = fc ? PUMP_SDK.decodeFeeConfig(ai(fc)) : null;
  const sol = new BN(String(Math.floor(lamports)));
  const amount = SDK.getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: bondingCurve.tokenTotalSupply, bondingCurve, amount: sol });
  const ixs = await PUMP_SDK.buyInstructions({ global, bondingCurveAccountInfo: ai(bc), bondingCurve, associatedUserAccountInfo: ai(ua), mint, user, amount, solAmount: sol, slippage: slippagePct, tokenProgram: TOKEN_2022_PROGRAM_ID });
  const prio = await priorityFee(), bh = await S.blockhash(), alt = await lookupTable();
  const tx = compile(owner, [ComputeBudgetProgram.setComputeUnitLimit({ units: 220000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: prio }), ...ixs], bh.blockhash, [alt]);
  const bytes = tx.serialize();
  const sim = await S.simulate(Buffer.from(bytes).toString('base64'));
  if (!sim.ok) { const e = L.err(400, 'The buy would fail on-chain: ' + (sim.logs.slice(-2).join(' ') || sim.err)); e.sim = sim; throw e; }
  return { tx: Buffer.from(bytes).toString('base64'), tokens: amount.toString(), lastValidBlockHeight: bh.lastValidBlockHeight };
}

// the split as it stands on-chain right now (the coin page's proof)
async function splitOnChain(coin) {
  const addr = SDK.feeSharingConfigPda(new PublicKey(coin)).toBase58();
  const a = await S.account(addr);
  if (!a) return { address: addr, exists: false };
  const c = PUMP_SDK.decodeSharingConfig(ai(a));
  return { address: addr, exists: true, adminRevoked: !!c.adminRevoked, shareholders: c.shareholders.map(s => ({ address: s.address.toBase58(), bps: Number(s.shareBps) })) };
}

// creator fees waiting in a coin's vault, and the instructions that push them out to the shareholders
const RENT0 = 890880, PUMP_MIN = 3901440;   // pump skips the distribution until the vault holds 3,901,440 lamports
async function vault(coin) {
  const mint = new PublicKey(coin), scAddr = SDK.feeSharingConfigPda(mint), v = SDK.creatorVaultPda(scAddr);
  const [sc, va, bc] = await S.accounts([scAddr.toBase58(), v.toBase58(), SDK.bondingCurvePda(mint).toBase58()]);
  const curve = bc ? (() => { try { return PUMP_SDK.decodeBondingCurve(ai(bc)); } catch { return null; } })() : null;
  const bucket = curve && curve.creatorFee ? Number(curve.creatorFee.toString()) : 0;
  const lamports = Math.max(0, (va ? va.lamports : 0) - RENT0 + bucket);
  return { sharingConfig: scAddr.toBase58(), exists: !!sc, vault: v.toBase58(), lamports, waiting: lamports / 1e9, ready: lamports + RENT0 >= PUMP_MIN, graduated: !!(curve && curve.complete) };
}
async function payoutIxs({ payer, coin }) {
  const mint = new PublicKey(coin), user = new PublicKey(payer), scAddr = SDK.feeSharingConfigPda(mint);
  const [sc, bc] = await S.accounts([scAddr.toBase58(), SDK.bondingCurvePda(mint).toBase58()]);
  if (!sc) throw L.err(404, 'This coin has no fee sharing account.');
  const sharingConfig = PUMP_SDK.decodeSharingConfig(ai(sc)), curve = bc ? (() => { try { return PUMP_SDK.decodeBondingCurve(ai(bc)); } catch { return null; } })() : null;
  const ixs = [];
  if (curve && curve.complete) ixs.push(await PUMP_SDK.transferCreatorFeesToPumpV2({ payer: user, mint, quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID }));
  ixs.push(await PUMP_SDK.sweepCreatorFeeInstruction({ payer: user, mint, creator: scAddr, quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID }));
  ixs.push(await PUMP_SDK.distributeCreatorFeesV2({ mint, sharingConfig, sharingConfigAddress: scAddr, quoteMint: NATIVE_MINT, payer: user, shouldInitializeAta: false, quoteTokenProgram: TOKEN_PROGRAM_ID }));
  return ixs;
}
// anyone can push a coin's fees out (the coin page's "milk it" button): their wallet pays the network fee
async function payoutTx({ payer, coin }) {
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: await priorityFee() }), ...(await payoutIxs({ payer, coin }))];
  const bh = await S.blockhash(), alt = await lookupTable();
  const tx = compile(payer, ixs, bh.blockhash, [alt]), bytes = tx.serialize();
  const sim = await S.simulate(Buffer.from(bytes).toString('base64'));
  if (!sim.ok) { const e = L.err(400, 'The payout would fail on-chain: ' + (sim.logs.slice(-2).join(' ') || sim.err)); e.sim = sim; throw e; }
  const low = sim.logs.join(' ').match(/Insufficient fees for distribution\. Minimum vault balance needed: (\d+)/);
  if (low) throw L.err(400, `Not enough fees waiting yet. Payouts start once the coin's vault holds ${(Number(low[1]) / 1e9).toFixed(4)} SOL.`);
  return { tx: Buffer.from(bytes).toString('base64'), units: sim.units, lastValidBlockHeight: bh.lastValidBlockHeight };
}

module.exports = { CREATOR_BPS, ENGINE_BPS, DEFAULT_ALT, engineKey, engineAddress, prepare, buyTx, splitOnChain, vault, payoutIxs, payoutTx, lookupTable, priorityFee, compile, ai, PUMP_MIN };
