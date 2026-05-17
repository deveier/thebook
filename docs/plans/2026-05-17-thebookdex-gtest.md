# thebookdex gtest Report

**Date:** 2026-05-17
**Program:** thebookdex (orderbook + AMM)
**Framework:** Sails 0.10.4, gtest 1.10.0
**Build:** Rust stable 1.95.0, wasm32-unknown-unknown
**Client Generation:** `sails_rs::build_client::<thebook_app::Program>()`

## Approach

Used raw `Service::pending_call::<io::X>(args)` pattern to bypass trait-import issues with the generated client. Each service method is called via its corresponding `io` module type (e.g., `ob_io::Join`, `amm_io::Swap`).

## Test Suite (14 tests)

### Orderbook Service (8 tests)

| Test | Description | Status |
|------|-------------|--------|
| `join_creates_agent` | ALICE joins, receives initial balances (100K USD, 100K BTC, 1M ETH, 10B VARA) | ✅ |
| `place_limit_buy_then_cancel` | Place buy order, cancel, verify USD refunded | ✅ |
| `place_limit_sell_then_cancel` | Place sell order, cancel, verify BTC refunded | ✅ |
| `market_buy_fills_sell_order` | ALICE sells 2 BTC @ $50, BOB buys 1 BTC via market_buy | ✅ |
| `market_sell_fills_buy_order` | ALICE buys 2 BTC @ $50, BOB sells 1 BTC via market_sell | ✅ |
| `swap_insufficient_balance_fails` | BOB swaps 999,999 BTC (insufficient) → InsufficientAsset | ✅ |
| `swap_slippage_protection` | Swap demanding impossible min_out → SlippageExceeded | ✅ |
| `full_dex_scenario` | Orderbook sell + AMM pool + market buy + AMM swap | ✅ |

### AMM Service (6 tests)

| Test | Description | Status |
|------|-------------|--------|
| `amm_create_pool_works` | Create BTC/ETH pool, verify Pool struct | ✅ |
| `amm_same_asset_pool_fails` | Pool with same asset A/A → SameAssetPool | ✅ |
| `amm_add_liquidity_works` | Add 5 BTC + 50 ETH, verify reserves and portfolio | ✅ |
| `amm_swap_executes` | Add liquidity, BOB swaps 1 BTC → ~9 ETH out | ✅ |
| `amm_remove_liquidity_works` | Add then remove all liquidity, verify full return | ✅ |
| `list_pools_after_creation` | Create pool, verify ListPools returns 1 entry | ✅ |

## Key Findings

1. **First IDs start at 0** — `next_oid` and `next_pid` fields initialize to 0, so first order/pool gets ID 0.
2. **Borrow conflicts resolved** — All previous borrow-checker issues in AMM/orderbook fixed by cloning before mutation.
3. **Helper functions as free functions** — `balance_of`, `add_asset`, `sub_asset` moved outside service impl blocks to work with `#[service]` wrapper.

## Build Artifacts

- **WASM (optimized):** 99 KB (`thebook.opt.wasm`)
- **WASM (unoptimized):** 133 KB
- **IDL:** 22 methods across 2 services (Orderbook + Amm)
- **Generated Client:** `client/src/thebook_client.rs` (18 KB)
