import { useState, useCallback, useEffect } from 'react';

const BASE_KEY = 'thebookdex:positions';

export interface FuturesPosition {
  id: string;
  asset: string;
  direction: 'Long' | 'Short';
  entryPrice: number;
  sizeQty: number;
  leverage: number;
  margin: number;
  openedAt: string;
}

function loadFor(address: string): FuturesPosition[] {
  try {
    const raw = localStorage.getItem(`${BASE_KEY}:${address}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function persistFor(address: string, positions: FuturesPosition[]) {
  try { localStorage.setItem(`${BASE_KEY}:${address}`, JSON.stringify(positions.slice(-50))); } catch {}
}

export function usePositions(address?: string) {
  const [positions, setPositions] = useState<FuturesPosition[]>([]);

  /* Reload positions whenever the connected wallet changes */
  useEffect(() => {
    if (address) {
      setPositions(loadFor(address));
    } else {
      setPositions([]);
    }
  }, [address]);

  const addPosition = useCallback((p: FuturesPosition) => {
    if (!address) return;
    setPositions(prev => {
      const next = [...prev, p];
      persistFor(address, next);
      return next;
    });
  }, [address]);

  const removePosition = useCallback((id: string) => {
    if (!address) return;
    setPositions(prev => {
      const next = prev.filter(p => p.id !== id);
      persistFor(address, next);
      return next;
    });
  }, [address]);

  const unrealizedPnl = useCallback((pos: FuturesPosition, markPrice: number): number => {
    if (!markPrice || !pos.entryPrice) return 0;
    const size = pos.sizeQty / 1e5;
    return pos.direction === 'Long'
      ? (markPrice - pos.entryPrice) * size
      : (pos.entryPrice - markPrice) * size;
  }, []);

  const liqPrice = useCallback((pos: FuturesPosition): number => {
    const margin = 0.9 / Math.max(pos.leverage, 1);
    return pos.direction === 'Long'
      ? pos.entryPrice * (1 - margin)
      : pos.entryPrice * (1 + margin);
  }, []);

  return { positions, addPosition, removePosition, unrealizedPnl, liqPrice };
}
