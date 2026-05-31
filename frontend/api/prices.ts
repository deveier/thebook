import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PriceFeed {
  price_usd_micro: string | number;
  change_24h_bps?: string | number;
  symbol?: string;
}

interface Prices {
  BTC: PriceFeed | null;
  ETH: PriceFeed | null;
  VARA: PriceFeed | null;
}

interface PricePoint {
  ts: number;
  BTC: number | null;
  ETH: number | null;
  VARA: number | null;
}

interface CacheEntry {
  prices: Prices;
  timestamp: number;
  history: PricePoint[];
}

const MAX_HISTORY = 200;
const COINGECKO_TTL = 5 * 60 * 1000; // 5 min

let memCache: CacheEntry = { prices: { BTC: null, ETH: null, VARA: null }, timestamp: 0, history: [] };
let cgCache: { prices: Prices; ts: number } | null = null;

/* ── Vercel KV ── */

async function kvGet(): Promise<CacheEntry | null> {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    const res = await fetch(`${url}/get/thebookdex:prices`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const json = await res.json() as { result?: string | null };
    if (!json.result) return null;
    return JSON.parse(json.result) as CacheEntry;
  } catch { return null; }
}

async function kvSet(entry: CacheEntry): Promise<void> {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return;
    await fetch(`${url}/set/thebookdex:prices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(entry), ex: 86400 }),
    });
  } catch { /* ignore */ }
}

/* ── CoinGecko fallback (server-side only, no CORS issue) ── */

async function fetchCoinGecko(): Promise<Prices | null> {
  try {
    if (cgCache && Date.now() - cgCache.ts < COINGECKO_TTL) return cgCache.prices;
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,vara-network&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json() as Record<string, { usd?: number; usd_24h_change?: number }>;
    const prices: Prices = {
      BTC: data.bitcoin?.usd != null ? {
        symbol: 'BTC',
        price_usd_micro: Math.round(data.bitcoin.usd * 1_000_000),
        change_24h_bps: Math.round((data.bitcoin.usd_24h_change ?? 0) * 100),
      } : null,
      ETH: data.ethereum?.usd != null ? {
        symbol: 'ETH',
        price_usd_micro: Math.round(data.ethereum.usd * 1_000_000),
        change_24h_bps: Math.round((data.ethereum.usd_24h_change ?? 0) * 100),
      } : null,
      VARA: data['vara-network']?.usd != null ? {
        symbol: 'VARA',
        price_usd_micro: Math.round(data['vara-network'].usd * 1_000_000),
        change_24h_bps: Math.round((data['vara-network'].usd_24h_change ?? 0) * 100),
      } : null,
    };
    cgCache = { prices, ts: Date.now() };
    return prices;
  } catch { return null; }
}

function hasAnyPrice(prices: Prices): boolean {
  return prices.BTC !== null || prices.ETH !== null || prices.VARA !== null;
}

/* ── Handler ── */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'POST') {
    const { prices, timestamp, history } = req.body as { prices?: Prices; timestamp?: number; history?: PricePoint[] };
    if (prices && timestamp) {
      const entry: CacheEntry = { prices, timestamp, history: Array.isArray(history) ? history.slice(-MAX_HISTORY) : memCache.history };
      memCache = entry;
      await kvSet(entry);
    }
    res.status(200).json({ ok: true });
    return;
  }

  /* GET: KV → memCache → CoinGecko fallback */
  let entry: CacheEntry | null = await kvGet();
  if (!entry || !hasAnyPrice(entry.prices)) {
    if (hasAnyPrice(memCache.prices)) {
      entry = memCache;
    } else {
      const cg = await fetchCoinGecko();
      if (cg) {
        entry = { prices: cg, timestamp: Date.now(), history: [] };
      }
    }
  }

  res.status(200).json({
    prices:    entry?.prices    ?? { BTC: null, ETH: null, VARA: null },
    timestamp: entry?.timestamp ?? null,
    history:   entry?.history   ?? [],
  });
}
