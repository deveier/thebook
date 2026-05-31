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

/* In-memory fallback (used when Vercel KV env vars are absent) */
let memCache: CacheEntry = {
  prices: { BTC: null, ETH: null, VARA: null },
  timestamp: 0,
  history: [],
};

async function kvGet(): Promise<CacheEntry | null> {
  try {
    const url   = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;
    const res = await fetch(`${url}/get/thebookdex:prices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json() as { result?: string | null };
    if (!json.result) return null;
    return JSON.parse(json.result) as CacheEntry;
  } catch { return null; }
}

async function kvSet(entry: CacheEntry): Promise<void> {
  try {
    const url   = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return;
    await fetch(`${url}/set/thebookdex:prices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(entry), ex: 86400 }),
    });
  } catch { /* ignore */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (req.method === 'POST') {
    const { prices, timestamp, history } = req.body as { prices?: Prices; timestamp?: number; history?: PricePoint[] };
    if (prices && timestamp) {
      const entry: CacheEntry = {
        prices,
        timestamp,
        history: Array.isArray(history) ? history.slice(-MAX_HISTORY) : memCache.history,
      };
      memCache = entry;
      await kvSet(entry);
    }
    res.status(200).json({ ok: true });
    return;
  }

  /* GET — try KV first, fall back to in-memory */
  const kv = await kvGet();
  const entry = kv ?? memCache;
  res.status(200).json({
    prices:    entry.prices,
    timestamp: entry.timestamp || null,
    history:   entry.history ?? [],
  });
}
