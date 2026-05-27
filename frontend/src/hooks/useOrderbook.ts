import { useEffect, useState, useCallback } from 'react';
import { useSails } from './useSails';

function toBigInt(v: any): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  if (typeof v === 'string') return BigInt(v);
  if (v?.toString) return BigInt(v.toString());
  return 0n;
}

function toPair(v: any): [bigint, bigint] {
  if (Array.isArray(v)) return [toBigInt(v[0]), toBigInt(v[1])];
  if (v && typeof v === 'object') return [toBigInt((v as any)[0] || (v as any).price), toBigInt((v as any)[1] || (v as any).qty)];
  return [0n, 0n];
}

function toTradesArray(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result.map((t: any) => ({
    id: t?.[0]?.toString() || '0',
    price: toBigInt(t?.[1]),
    qty: toBigInt(t?.[2]),
    buyer: t?.[3]?.toString?.() || '',
    seller: t?.[4]?.toString?.() || '',
    time: new Date().toLocaleTimeString(),
  }));
  return [];
}

export function useOrderbook(asset: Asset = 'BTC') {
  const { program, isReady } = useSails();
  const [orderbook, setOrderbook] = useState<{ bids: [bigint, bigint][], asks: [bigint, bigint][] }>({ bids: [], asks: [] });
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOrderbook = useCallback(async () => {
    if (!program) return;
    try {
      const result = await program.orderbook.getOrderbook(asset).call();
      console.log('Orderbook raw:', JSON.stringify(result));
      if (result && Array.isArray(result)) {
        const bidsRaw: any[] = result[0] as any;
        const asksRaw: any[] = result[1] as any;
        console.log('Bids raw:', bidsRaw, 'Asks raw:', asksRaw);
        setOrderbook({
          bids: Array.from(bidsRaw).map(toPair),
          asks: Array.from(asksRaw).map(toPair),
        });
      }
    } catch (e) {
      console.error('Failed to fetch orderbook:', e);
    }
  }, [program, asset]);

  const fetchTrades = useCallback(async () => {
    if (!program) return;
    try {
      const result = await program.orderbook.getTrades(asset, 20).call();
      console.log('Trades raw:', JSON.stringify(result));
      if (result && Array.isArray(result)) {
        setTrades(toTradesArray(result));
      }
    } catch (e) {
      console.error('Failed to fetch trades:', e);
    }
  }, [program, asset]);

  useEffect(() => {
    if (isReady) {
      setLoading(true);
      Promise.all([fetchOrderbook(), fetchTrades()]).finally(() => setLoading(false));
      const interval = setInterval(() => {
        fetchOrderbook();
        fetchTrades();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isReady, fetchOrderbook, fetchTrades]);

  return {
    orderbook,
    trades,
    loading,
    refresh: () => { fetchOrderbook(); fetchTrades(); }
  };
}
