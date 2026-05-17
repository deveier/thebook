# Feature Spec: thebookdex

## Problem
The current "thebook" is a basic orderbook exchange on Vara. To compete in the Vara Agent Network Season 1 hackathon ($8K pool), it needs:
1. Fix code quality (unsafe state, stale tests, unused code)
2. Add AMM (Automated Market Maker) pools alongside the orderbook
3. Proper Sails events for indexability
4. Registration on the Vara Agent Network

## User Goal
Deploy a production-ready DEX ("thebookdex") on Vara mainnet combining an orderbook with AMM pools, registered as an Application on the Vara Agent Network.

## In Scope
- Rename project from "thebook" to "thebookdex"
- Refactor to Sails-idiomatic state ownership (RefCell-based, no UnsafeCell)
- Add constant-product AMM pools (create pool, add liquidity, remove liquidity, swap x*y=k)
- AMM pool types: VARA-USDC, VARA-BTC, VARA-ETH, plus generic pair creation
- Proper Sails event emission for every state change
- Fix gtest suite
- Register on Vara Agent Network

## Out of Scope
- Cross-chain swaps (Vara.eth/ethexe)
- Staking/farming rewards
- Governance tokens
- Frontend UI (separate track)

## Actors
| Actor | Description |
|---|---|
| **Trader** | Any Vara wallet. Places limit/market orders on the orderbook, or swaps via AMM pools. |
| **Liquidity Provider** | Adds/removes liquidity from AMM pools, earns swap fees. |
| **Admin** | Deployer wallet. Controls pause, pool creation. |
| **Vara Agent Network** | External contract at `0x19f27f4c...`. THEBOOKDEX registers as an Application. |

## State Changes

### Orderbook (existing, refactored)
- `Join(trader)` → creates agent with initial balances
- `PlaceLimit(side, asset, price, qty)` → escrows funds, creates/partially fills order
- `CancelOrder(oid)` → unlocks escrowed funds, marks cancelled
- `MarketBuy/MarketSell` → sweeps orderbook at best prices

### AMM (new)
- `CreatePool(asset_a, asset_b)` → creates a new constant-product pool. Only admin.
- `AddLiquidity(pool_id, amount_a, amount_b)` → LP provider adds to pool, receives LP tokens
- `RemoveLiquidity(pool_id, lp_amount)` → burns LP tokens, returns proportional assets
- `Swap(pool_id, asset_in, amount_in, min_out)` → swaps along x*y=k curve with 0.3% fee

## Messages And Replies
All calls are direct Sails command → state change → event emission. No async reply flows.

## Events
- `OrderPlaced { trader, side, asset, price, qty, order_id }`
- `OrderCancelled { trader, order_id }`
- `OrderFilled { order_id, trader, fill_price, fill_qty, counterparty }`
- `Trade { trade_id, asset, price, qty, buyer, seller }`
- `PoolCreated { pool_id, asset_a, asset_b }`
- `LiquidityAdded { pool_id, provider, amount_a, amount_b, lp_minted }`
- `LiquidityRemoved { pool_id, provider, amount_a, amount_b, lp_burned }`
- `SwapExecuted { pool_id, trader, asset_in, amount_in, asset_out, amount_out, fee }`

## Invariants
- AMM: `reserve_a * reserve_b = k` (constant product) after each swap
- AMM: Swap fee = 0.3% of `amount_in`, added to reserves
- Orderbook: sum(filled + remaining) = original qty for every order
- Balances: trader's escrowed + available = initial balance + trades - spent

## Edge Cases
- Zero liquidity pool (k=0): reject swaps
- Slippage protection: `min_out` parameter on swaps
- Orderbook with no matching orders: order stays open
- Same asset pair pool: reject creation
- LP withdrawal at pool exhaustion: proportional return

## Acceptance Criteria
1. `cargo build --release` succeeds with zero warnings
2. `cargo test --release` passes (gtest suite with 20+ tests)
3. AMM `CreatePool → AddLiquidity → Swap` roundtrip works in gtest
4. Orderbook `PlaceLimit → partial fill → CancelOrder` works
5. IDL generated correctly reflecting all services
6. WASM binary < 200KB
