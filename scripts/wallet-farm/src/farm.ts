import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GearApi } from '@gear-js/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, mnemonicGenerate, setSS58Format } from '@polkadot/util-crypto';
import { TypeRegistry } from '@polkadot/types';

/* Vara Network SS58 prefix */
const SS58_PREFIX = 137;

/* ── Config ── */

const RPC = process.env.RPC || 'wss://rpc.vara.network';
const PROGRAM_ID = (process.env.PROGRAM_ID || '0x7fa1988c57ba1134e2461c5fb36bc13d66c1dfbf47d36c5e9960b9ca2dc0e4c4') as `0x${string}`;
const MASTER_SEED = process.env.MASTER_SEED || '';
const WALLET_COUNT = Number(process.env.WALLET_COUNT) || 5;
const VARA_PER_WALLET = process.env.VARA_PER_WALLET || '0.5';
const CONCURRENCY = Number(process.env.CONCURRENCY) || 3;
const WALLETS_FILE = process.env.WALLETS_FILE || resolve('wallets.json');
const RESULTS_FILE = process.env.RESULTS_FILE || resolve('results.json');

/* ── CLI ── */

type Step = 'create' | 'fund' | 'run';
const steps: Step[] = [];

for (const arg of process.argv.slice(2)) {
  if (arg === '--create') steps.push('create');
  else if (arg === '--fund') steps.push('fund');
  else if (arg === '--run') steps.push('run');
  else if (arg === '--all') steps.push('create', 'fund', 'run');
  else if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: tsx src/farm.ts [OPTIONS]

Options:
  --create       Generate wallets and save to wallets.json
  --fund         Transfer VARA from master wallet to each sub-wallet
  --run          Execute DEX operations (join, place orders) for each wallet
  --all          Run all three steps sequentially

Environment variables (.env):
  MASTER_SEED     Master wallet mnemonic or seed (required for --fund and --run)
  WALLET_COUNT    Number of wallets to create (default: 5)
  VARA_PER_WALLET VARA to transfer to each wallet (default: 0.5)
  RPC             Vara RPC endpoint (default: wss://rpc.vara.network)
  PROGRAM_ID      DEX program ID (default: current)
  CONCURRENCY     Max parallel operations (default: 3)
`);
    process.exit(0);
  }
}

if (steps.length === 0) {
  console.error('Specify at least one step: --create, --fund, --run, or --all');
  process.exit(1);
}

/* ── Wallet types ── */

interface WalletEntry {
  index: number;
  mnemonic: string;
  address: string;
  publicKey: string;
}

interface WalletResult {
  index: number;
  address: string;
  joined: boolean;
  orders: { side: string; asset: string; price: number; qty: number; orderId?: string }[];
  error?: string;
}

/* ── Util: load/save wallets ── */

function loadWallets(): WalletEntry[] {
  if (!existsSync(WALLETS_FILE)) return [];
  return JSON.parse(readFileSync(WALLETS_FILE, 'utf-8'));
}

function saveWallets(wallets: WalletEntry[]) {
  writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));
  console.log(`Saved ${wallets.length} wallets to ${WALLETS_FILE}`);
}

function loadResults(): WalletResult[] {
  if (!existsSync(RESULTS_FILE)) return [];
  return JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
}

function appendResult(r: WalletResult) {
  const results = loadResults();
  results.push(r);
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

/* ── Step 1: Create wallets ── */

async function stepCreate() {
  const keyring = new Keyring({ type: 'sr25519', ss58Format: 137 });

  const wallets: WalletEntry[] = [];

  for (let i = 0; i < WALLET_COUNT; i++) {
    const mnemonic = mnemonicGenerate();
    const pair = keyring.addFromUri(mnemonic);
    wallets.push({
      index: i,
      mnemonic,
      address: pair.address,
      publicKey: pair.publicKey?.toString() || '',
    });
    console.log(`[${i + 1}/${WALLET_COUNT}] ${pair.address}`);
  }

  saveWallets(wallets);
  console.log('\nIMPORTANT: Back up wallets.json securely! Each mnemonic controls real VARA funds.\n');
}

/* ── Step 2: Fund wallets ── */

async function stepFund() {
  if (!MASTER_SEED) {
    console.error('MASTER_SEED is required for --fund. Set it in .env');
    process.exit(1);
  }

  const keyring = new Keyring({ type: 'sr25519', ss58Format: 137 });
  const master = keyring.addFromUri(MASTER_SEED);
  console.log(`Master address: ${master.address}`);

  const api = await GearApi.create({ providerAddress: RPC });
  await api.isReadyOrError;
  const wallets = loadWallets();
  if (wallets.length === 0) {
    console.error('No wallets found. Run --create first.');
    try { await api.disconnect(); } catch {}
    process.exit(1);
  }

  const amountRaw = BigInt(Math.round(parseFloat(VARA_PER_WALLET) * 10 ** 12)); // VARA has 12 decimals
  console.log(`Funding ${wallets.length} wallets with ${VARA_PER_WALLET} VARA each`);
  console.log(`Total needed: ${(parseFloat(VARA_PER_WALLET) * wallets.length).toFixed(2)} VARA\n`);

  let success = 0;
  let failed = 0;

  async function fundOne(w: WalletEntry): Promise<void> {
    try {
      const tx = api.tx.balances.transferAllowDeath(w.address, amountRaw);
      await tx.signAndSend(master, ({ status, events }) => {
        if (status.isInBlock || status.isFinalized) {
          const ok = events.some((e: any) => api.events.balances.Transfer.is(e.event));
          if (ok) {
            console.log(`  ✓ ${w.address}`);
            success++;
          } else {
            console.log(`  ✗ ${w.address} — transfer event not found`);
            failed++;
          }
        }
      });
    } catch (e: any) {
      console.log(`  ✗ ${w.address} — ${e.message?.slice(0, 60)}`);
      failed++;
    }
  }

  /* Batch with limited concurrency */
  const queue = [...wallets];
  async function worker() {
    while (queue.length > 0) {
      const w = queue.shift()!;
      await fundOne(w);
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, wallets.length) }, () => worker());
  await Promise.all(workers);

  console.log(`\nDone: ${success} funded, ${failed} failed`);
  try { await api.disconnect(); } catch {}
}

/* ── Step 3: Run DEX operations ── */

/* Manually encode a Sails payload using the TypeRegistry.
   Format: [service_name_len (1b)] [service_name] [func_name_len (1b)] [func_name] [SCALE args] */
function encodePayload(registry: TypeRegistry, route: string, args: any, inputType: string | null): `0x${string}` {
  const [service, method] = route.split('.');
  const serviceBytes = new TextEncoder().encode(service);
  const methodBytes = new TextEncoder().encode(method);

  const parts: Uint8Array[] = [
    Uint8Array.from([serviceBytes.length]),
    serviceBytes,
    Uint8Array.from([methodBytes.length]),
    methodBytes,
  ];

  if (args !== null && inputType) {
    const encoded = registry.createType(inputType, args).toU8a();
    parts.push(encoded);
  }

  const total = new Uint8Array(parts.reduce((acc, p) => acc + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    total.set(p, offset);
    offset += p.length;
  }
  return `0x${Buffer.from(total).toString('hex')}`;
}

async function gearSend(
  api: GearApi,
  pair: ReturnType<Keyring['addFromUri']>,
  payload: `0x${string}`,
): Promise<void> {
  const _api = api as any;
  const gasInfo = await _api.program.gasSpent.handle(
    pair.address,
    PROGRAM_ID,
    payload,
    0,
    false,
  );
  const rawLimit = gasInfo?.minLimit?.toBigInt?.() ?? gasInfo?.min_limit ?? 100_000_000_000n;
  const gasLimit = typeof rawLimit === 'bigint' ? rawLimit : BigInt(rawLimit as string | number);

  const tx = api.tx.gear.sendMessage(PROGRAM_ID, payload, gasLimit, 0);
  return new Promise((resolve, reject) => {
    tx.signAndSend(pair, ({ status, dispatchError }: any) => {
      if (dispatchError) {
        reject(new Error(dispatchError.toString()));
        return;
      }
      if (status.isInBlock || status.isFinalized) {
        resolve();
      }
    }).catch(reject);
  });
}

const ASSETS = ['BTC', 'ETH', 'VARA'] as const;

async function stepRun() {
  if (!MASTER_SEED) {
    console.error('MASTER_SEED is required for --run. Set it in .env');
    process.exit(1);
  }

  const keyring = new Keyring({ type: 'sr25519', ss58Format: 137 });
  const master = keyring.addFromUri(MASTER_SEED);
  console.log(`Using master (for gas estimation): ${master.address}`);

  const api = await GearApi.create({ providerAddress: RPC });
  await api.isReadyOrError;
  const registry = new TypeRegistry();

  /* Register DEX types (mirrors sails.ts) */
  registry.register({
    ContractError: { _enum: ['NotAuthorized', 'NotAdmin', 'BadParams', 'JoinFirst', 'InsufficientUsd', 'InsufficientAsset', 'OrderNotFound', 'OrderAlreadyDone', 'NoLiquidity', 'NoBuyers', 'PoolExists', 'PoolNotFound', 'SameAssetPool', 'InsufficientLiquidity', 'SlippageExceeded', 'ZeroAmount', 'AgentCallFailed'] },
    PriceFeed: { symbol: 'String', price_usd_micro: 'u64', change_24h_bps: 'i32', market_cap_usd: 'u64', volume_24h_usd: 'u64', updated_at_block: 'u32' },
    Asset: { _enum: ['BTC', 'ETH', 'VARA'] },
    Side: { _enum: ['Buy', 'Sell'] },
  });

  const wallets = loadWallets();
  if (wallets.length === 0) {
    console.error('No wallets found. Run --create first.');
    try { await api.disconnect(); } catch {}
    process.exit(1);
  }

  /* Build keyring pairs for each wallet */
  const pairs = wallets.map(w => {
    const p = keyring.addFromUri(w.mnemonic);
    return p;
  });

  const results = loadResults();
  const doneAddresses = new Set(results.map(r => r.address));

  console.log(`Running DEX operations for ${wallets.length} wallets\n`);

  let joined = 0;
  let ordered = 0;
  let errors = 0;

  async function processWallet(w: WalletEntry, pair: ReturnType<Keyring['addFromUri']>) {
    if (doneAddresses.has(w.address)) {
      console.log(`  ○ ${w.address} (already done, skipping)`);
      return;
    }

    try {
      /* Join DEX */
      console.log(`  → ${w.address} joining...`);
      const joinPayload = encodePayload(registry, 'Orderbook.Join', null, null);
      await gearSend(api, pair, joinPayload);
      console.log(`    ✓ joined`);
      joined++;

      /* Place a buy limit order */
      const asset = ASSETS[w.index % ASSETS.length];
      /* Use seed-based pseudo-random price/qty for variety */
      const price = 25000 + (w.index * 137) % 50000;
      const qty = 100_000_000n + BigInt((w.index * 73) % 1_000_000_000);

      console.log(`    → placing buy limit ${asset} @ $${price}...`);
      const buyPayload = encodePayload(registry, 'Orderbook.PlaceLimit', ['Buy' as const, asset, price, qty], '(Side, Asset, u64, u64)');
      await gearSend(api, pair, buyPayload);
      console.log(`    ✓ buy order placed`);
      ordered++;

      /* Place a sell limit order */
      const sellPrice = Math.floor(price * 1.01); /* 1% above buy */
      console.log(`    → placing sell limit ${asset} @ $${sellPrice}...`);
      const sellPayload = encodePayload(registry, 'Orderbook.PlaceLimit', ['Sell' as const, asset, sellPrice, qty], '(Side, Asset, u64, u64)');
      await gearSend(api, pair, sellPayload);
      console.log(`    ✓ sell order placed`);
      ordered++;

      appendResult({
        index: w.index,
        address: w.address,
        joined: true,
        orders: [
          { side: 'Buy', asset, price, qty: Number(qty) },
          { side: 'Sell', asset, price: sellPrice, qty: Number(qty) },
        ],
      });
    } catch (e: any) {
      console.log(`    ✗ error: ${e.message?.slice(0, 80)}`);
      errors++;
      appendResult({
        index: w.index,
        address: w.address,
        joined: false,
        orders: [],
        error: e.message,
      });
    }
  }

  const queue = wallets.map((w, i) => ({ w, pair: pairs[i] }));
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await processWallet(item.w, item.pair);
      /* Small delay between wallets to avoid RPC hammering */
      await new Promise(r => setTimeout(r, 500));
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, wallets.length) }, () => worker());
  await Promise.all(workers);

  console.log(`\nDone: ${joined} joined, ${ordered} orders placed, ${errors} errors`);
  try { await api.disconnect(); } catch {}
}

/* ── Main ── */

async function main() {
  await cryptoWaitReady();
  setSS58Format(SS58_PREFIX);

  const start = Date.now();

  for (const step of steps) {
    console.log(`\n═══ Step: ${step} ═══\n`);
    if (step === 'create') await stepCreate();
    else if (step === 'fund') await stepFund();
    else if (step === 'run') await stepRun();
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nTotal time: ${elapsed}s`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
