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
const LIVE_TTL = 60 * 1000;       // 1-min live cache
const VARA_TTL = 3 * 60 * 1000;   // 3-min for VARA (CoinGecko slower)

let memCache: CacheEntry = { prices: { BTC: null, ETH: null, VARA: null }, timestamp: 0, history: [] };
let liveCache: { prices: Prices; ts: number } | null = null;
let varaCache: { feed: PriceFeed; ts: number } | null = null;

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

/* ── Binance (BTC + ETH) ── */

async function fetchBinance(): Promise<{ BTC: PriceFeed | null; ETH: PriceFeed | null }> {
  try {
    const res = await fetch(
      'https://api.binance.com/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D',
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return { BTC: null, ETH: null };
    const data = await res.json() as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
    const btcRow = data.find(d => d.symbol === 'BTCUSDT');
    const ethRow = data.find(d => d.symbol === 'ETHUSDT');
    return {
      BTC: btcRow ? {
        symbol: 'BTC',
        price_usd_micro: Math.round(parseFloat(btcRow.lastPrice) * 1_000_000),
        change_24h_bps: Math.round(parseFloat(btcRow.priceChangePercent) * 100),
      } : null,
      ETH: ethRow ? {
        symbol: 'ETH',
        price_usd_micro: Math.round(parseFloat(ethRow.lastPrice) * 1_000_000),
        change_24h_bps: Math.round(parseFloat(ethRow.priceChangePercent) * 100),
      } : null,
    };
  } catch { return { BTC: null, ETH: null }; }
}

/* ── CoinGecko (VARA only) ── */

async function fetchVara(): Promise<PriceFeed | null> {
  try {
    if (varaCache && Date.now() - varaCache.ts < VARA_TTL) return varaCache.feed;
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=vara-network&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json() as Record<string, { usd?: number; usd_24h_change?: number }>;
    const v = data['vara-network'];
    if (!v?.usd) return null;
    const feed: PriceFeed = {
      symbol: 'VARA',
      price_usd_micro: Math.round(v.usd * 1_000_000),
      change_24h_bps: Math.round((v.usd_24h_change ?? 0) * 100),
    };
    varaCache = { feed, ts: Date.now() };
    return feed;
  } catch { return null; }
}

async function fetchLivePrices(): Promise<Prices | null> {
  if (liveCache && Date.now() - liveCache.ts < LIVE_TTL) return liveCache.prices;
  const [binance, vara] = await Promise.all([fetchBinance(), fetchVara()]);
  if (!binance.BTC && !binance.ETH && !vara) return null;
  const prices: Prices = { BTC: binance.BTC, ETH: binance.ETH, VARA: vara };
  liveCache = { prices, ts: Date.now() };
  return prices;
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

  /* GET: always try live prices first */
  const live = await fetchLivePrices();
  if (live && hasAnyPrice(live)) {
    const kvEntry = await kvGet();
    res.status(200).json({
      prices: live,
      timestamp: Date.now(),
      history: kvEntry?.history ?? memCache.history,
    });
    return;
  }

  /* Live feeds unavailable — fall back to KV / memCache */
  let entry: CacheEntry | null = await kvGet();
  if (!entry || !hasAnyPrice(entry.prices)) {
    if (hasAnyPrice(memCache.prices)) entry = memCache;
  }
  res.status(200).json({
    prices:    entry?.prices    ?? { BTC: null, ETH: null, VARA: null },
    timestamp: entry?.timestamp ?? null,
    history:   entry?.history   ?? [],
  });
}
