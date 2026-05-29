import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { web3FromSource } from '@polkadot/extension-dapp';
import { useSails } from '../hooks/useSails';
import { toPair, toTradesArray } from '../lib/helpers';

/* ── Types ── */

interface OrderbookData {
  bids: [bigint, bigint][];
  asks: [bigint, bigint][];
}

interface MarketPrices {
  BTC: PriceFeed | null;
  ETH: PriceFeed | null;
  VARA: PriceFeed | null;
}

const STALE_MS = 5 * 60 * 1000;

interface MarketContextValue {
  prices: MarketPrices;
  orderbooks: Record<string, OrderbookData>;
  trades: Record<string, any[]>;
  pools: Pool[];
  leaders: LeaderEntry[];
  loading: boolean;
  lastFetched: number | null;
  pricesStale: boolean;
  pricesLoading: boolean;
  fetchPrices: () => Promise<void>;
}

/* ── Helpers ── */

const API_URL = '/api/prices';
const ASSETS: Asset[] = ['BTC', 'ETH', 'VARA'];

function defaultPrices(): MarketPrices {
  return { BTC: null, ETH: null, VARA: null };
}

async function loadSharedPrices(): Promise<{ prices: MarketPrices; timestamp: number | null }> {
  try {
    const res = await fetch(API_URL);
    if (res.ok) {
      const data = await res.json();
      if (data.prices) return { prices: data.prices, timestamp: data.timestamp ?? null };
    }
  } catch {}
  return { prices: defaultPrices(), timestamp: null };
}

async function saveSharedPrices(prices: MarketPrices, ts: number) {
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices, timestamp: ts }),
    });
  } catch {}
}

/* ── Context ── */

const MarketContext = createContext<MarketContextValue>({
  prices: { BTC: null, ETH: null, VARA: null },
  orderbooks: {},
  trades: {},
  pools: [],
  leaders: [],
  loading: true,
  lastFetched: null,
  pricesStale: false,
  pricesLoading: false,
  fetchPrices: async () => {},
});

export function useMarketData() {
  return useContext(MarketContext);
}

/* ── Provider ── */

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const { account } = useAccount();
  const { program } = useSails();
  const [prices, setPrices] = useState<MarketPrices>(defaultPrices);
  const [orderbooks, setOrderbooks] = useState<Record<string, OrderbookData>>({});
  const [trades, setTrades] = useState<Record<string, any[]>>({});
  const [pools, setPools] = useState<Pool[]>([]);
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const fetchingRef = useRef(false);
  const initLoadedRef = useRef(false);

  const pricesStale = lastFetched !== null && Date.now() - lastFetched > STALE_MS;

  /* Load shared prices from the server on mount */
  useEffect(() => {
    if (initLoadedRef.current) return;
    initLoadedRef.current = true;
    loadSharedPrices().then(({ prices: sp, timestamp }) => {
      if (sp.BTC || sp.ETH || sp.VARA) {
        setPrices(sp);
        if (timestamp) setLastFetched(timestamp);
      }
    });
  }, []);

  /* Fetch public data: orderbook + trades + pools + leaderboard */
  useEffect(() => {
    if (!program) return;

    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);

      const results = await Promise.allSettled([
        ...ASSETS.map(async (asset) => {
          const [obResult, tradesResult] = await Promise.all([
            program.orderbook.getOrderbook(asset).call().catch(() => null),
            program.orderbook.getTrades(asset, 20).call().catch(() => null),
          ]);
          return { asset, obResult, tradesResult };
        }),
        program.amm.listPools().call().catch(() => []),
        program.orderbook.getLeaderboard(10).call().catch(() => []),
      ]);

      if (cancelled) return;

      const newOrderbooks: Record<string, OrderbookData> = {};
      const newTrades: Record<string, any[]> = {};

      for (let i = 0; i < ASSETS.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') {
          const { asset, obResult, tradesResult } = r.value as { asset: Asset; obResult: any; tradesResult: any };
          if (obResult && Array.isArray(obResult)) {
            const bidsRaw: any[] = obResult[0] as any;
            const asksRaw: any[] = obResult[1] as any;
            newOrderbooks[asset] = {
              bids: Array.from(bidsRaw || []).map(toPair),
              asks: Array.from(asksRaw || []).map(toPair),
            };
          } else {
            newOrderbooks[asset] = { bids: [], asks: [] };
          }
          newTrades[asset] = toTradesArray(tradesResult);
        } else {
          newOrderbooks[ASSETS[i]] = { bids: [], asks: [] };
          newTrades[ASSETS[i]] = [];
        }
      }

      setOrderbooks(newOrderbooks);
      setTrades(newTrades);

      const poolsResult = results[3];
      if (poolsResult.status === 'fulfilled') {
        setPools(poolsResult.value as Pool[]);
      }

      const leadersResult = results[4];
      if (leadersResult.status === 'fulfilled') {
        setLeaders(leadersResult.value as LeaderEntry[]);
      }

      setLoading(false);
    };

    fetchAll();

    return () => { cancelled = true; };
  }, [program]);

  /* Fetch oracle prices (needs wallet — only call from user gesture, not from effects/interval) */
  const fetchPrices = useCallback(async () => {
    if (!program || !account || fetchingRef.current) return;
    fetchingRef.current = true;
    setPricesLoading(true);
    try {
      const { signer } = await web3FromSource(account.meta.source);
      const newPrices: MarketPrices = { BTC: null, ETH: null, VARA: null };
      let changed = false;

      for (const asset of ASSETS) {
        try {
          const transaction = program.orderbook.getLivePrice(asset);
          await transaction.withAccount(account.address, { signer }).withValue(0n).calculateGas();
          const { response } = await transaction.signAndSend();
          const result = await response();
          if (result && typeof result === 'object' && 'ok' in result) {
            newPrices[asset] = result.ok as PriceFeed;
            changed = true;
          }
        } catch (e) {
          console.error(`MarketDataProvider: Failed to fetch ${asset} price:`, e);
        }
      }

      if (changed) {
        const ts = Date.now();
        setPrices(newPrices);
        setLastFetched(ts);
        saveSharedPrices(newPrices, ts);
      }
    } finally {
      fetchingRef.current = false;
      setPricesLoading(false);
    }
  }, [program, account]);

  return (
    <MarketContext.Provider value={{
      prices,
      orderbooks,
      trades,
      pools,
      leaders,
      loading,
      lastFetched,
      pricesStale,
      pricesLoading,
      fetchPrices,
    }}>
      {children}
    </MarketContext.Provider>
  );
}
