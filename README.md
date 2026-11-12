# MILK: every coin is a cash cow

Launch a coin on pump.fun. Its creator fees buy a real tokenized stock (or pre-IPO name) and the stock goes to its holders, pro rata.

## How it works
- **Launch** (`api/_launch.js`): one v0 transaction built with `@pump-fun/pump-sdk` 4.3.1 and signed by the creator's wallet: `create_v2` → `create_fee_sharing_config` → `update_fee_shares_v2` with `[creator 1000 bps, MILK engine 9000 bps]`. The admin is revoked in the same instruction, so the split is final. MILK co-signs only with the coin's fresh mint key.
- **Engine** (`api/_engine.js`): pushes each coin's fees out of pump.fun's vault (`sweep_creator_fee` → `distribute_creator_fees_v2`), keeps a pot per coin, and once a pot reaches `MILK_ROUND_MIN` SOL (default 0.1): 70% of the coin's fees buy its stock on Jupiter and go to holders with at least `MILK_MIN_HOLD_PCT`% of the supply (default 0.05%, up to 40 a round), 15% buy and burn $MILK (set aside until `MILK_CA` is set), 5% pay network fees and token accounts. Every transaction is simulated first and written to the ledger (`mk_events`).
- **Engine wallet**: derived from a server secret created once in the database (`mk_meta`), never stored elsewhere. Its address is public (`/api/engine`). It pays its own network fees from the fees it receives; anyone can also push a coin's fees out from the coin page.
- **Stocks** (`api/_stocks.js`): 137 tokenized stocks, ETFs and pre-IPO names on Solana with real Jupiter liquidity (xStocks, Backpack, PreStocks, Tessera, Ondo), checked on mainnet 2026-11-07.

## Environment
| var | needed | what |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres (Vercel Storage). Tables `mk_*` are created automatically |
| `RPC_URL` | recommended | a Helius (or similar) RPC URL: full holder lists and faster reads |
| `MILK_CA` | later | the $MILK mint: switches the 15% from "set aside" to buy + burn, shows the CA |
| `MILK_X` | optional | the X link |
| `MILK_ORIGIN` | optional | public URL written into coin metadata (defaults to the request host) |
| `MILK_ROUND_MIN`, `MILK_MIN_HOLD_PCT` | optional | round size in SOL, holder minimum in % of supply |

The engine runs on `/api/tick` (GitHub Actions every 5 minutes, and page visits nudge it); a lock keeps it to one run at a time.

## Local
`node dev/server.cjs 8861` (mock chain, no network) · `node dev/apitest.cjs` (launch → fees → engine round → ledger) · `python3 dev/shots.py` (screenshots).
