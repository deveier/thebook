import { useState, useCallback } from 'react';

const KEY = 'thebookdex:positions';

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

function load(): FuturesPosition[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function persist(positions: FuturesPosition[]) {
  try { localStorage.setItem(KEY, JSON.stringify(positions.slice(-50))); } catch {}
}

export function usePositions() {
  const [positions, setPositions] = useState<FuturesPosition[]>(load);

  const addPosition = useCallback((p: FuturesPosition) => {
    setPositions(prev => { const next = [...prev, p]; persist(next); return next; });
  }, []);

  const removePosition = useCallback((id: string) => {
    setPositions(prev => { const next = prev.filter(p => p.id !== id); persist(next); return next; });
  }, []);

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
