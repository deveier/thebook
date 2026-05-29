import type { VercelRequest, VercelResponse } from '@vercel/node';

interface PriceFeed {
  price_usd_micro: string;
  change_24h_bps: string;
}

interface Prices {
  BTC: PriceFeed | null;
  ETH: PriceFeed | null;
  VARA: PriceFeed | null;
}

let cachedPrices: Prices = { BTC: null, ETH: null, VARA: null };
let cachedTs: number | null = null;

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    const { prices, timestamp } = req.body;
    if (prices && timestamp) {
      cachedPrices = prices;
      cachedTs = timestamp;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(200).json({ prices: cachedPrices, timestamp: cachedTs });
}
