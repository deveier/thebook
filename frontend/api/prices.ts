import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PriceFeed {
  price_usd_micro: string | number;
  change_24h_bps: string | number;
  symbol?: string;
  market_cap_usd?: string | number;
  volume_24h_usd?: string | number;
  updated_at_block?: number;
}

interface Prices {
  BTC: PriceFeed | null;
  ETH: PriceFeed | null;
  VARA: PriceFeed | null;
}

interface CacheEntry {
  prices: Prices;
  timestamp: number;
}

/* In-memory fallback (used when Vercel KV env vars are absent) */
let memCache: CacheEntry = {
  prices: { BTC: null, ETH: null, VARA: null },
  timestamp: 0,
};

async function kvGet(): Promise<CacheEntry | null> {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;

    const res = await fetch(`${url}/get/thebookdex:prices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json() as { result?: string | null };
    if (!json.result) return null;
    return JSON.parse(json.result) as CacheEntry;
  } catch {
    return null;
  }
}

async function kvSet(entry: CacheEntry): Promise<void> {
  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return;

    await fetch(`${url}/set/thebookdex:prices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: JSON.stringify(entry), ex: 3600 }),
    });
  } catch {
    /* ignore */
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    const { prices, timestamp } = req.body as { prices?: Prices; timestamp?: number };
    if (prices && timestamp) {
      const entry: CacheEntry = { prices, timestamp };
      memCache = entry;
      await kvSet(entry);
    }
    res.status(200).json({ ok: true });
    return;
  }

  /* GET — try KV first, fall back to in-memory */
  const kv = await kvGet();
  if (kv) {
    res.status(200).json({ prices: kv.prices, timestamp: kv.timestamp });
    return;
  }

  res.status(200).json({ prices: memCache.prices, timestamp: memCache.timestamp || null });
}
