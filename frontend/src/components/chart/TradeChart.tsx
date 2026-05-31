import { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart, ColorType, LineStyle, CrosshairMode,
  AreaSeries, LineSeries, HistogramSeries,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import styles from './TradeChart.module.css';
import type { PricePoint } from '../../providers/MarketDataProvider';

interface TradeChartProps {
  trades: { price: bigint; qty: bigint }[];
  oraclePrice: number;
  priceHistory: PricePoint[];
  bids: [bigint, bigint][];
  asks: [bigint, bigint][];
  asset: string;
}

type ChartView = 'price' | 'depth';

const INTERVAL_SEC = 30;

/* ── Depth canvas ── */

function drawDepth(
  canvas: HTMLCanvasElement,
  bids: { price: number; cum: number }[],
  asks: { price: number; cum: number }[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const PAD = { top: 20, right: 16, bottom: 36, left: 68 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const allPrices = [...bids.map(b => b.price), ...asks.map(a => a.price)];
  if (allPrices.length === 0) {
    ctx.fillStyle = '#848e9c';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No open orders', W / 2, H / 2);
    return;
  }

  const minP = allPrices[0];
  const maxP = allPrices[allPrices.length - 1];
  const priceSpan = maxP - minP || 1;
  const maxBid = bids.length > 0 ? bids[bids.length - 1].cum : 0;
  const maxAsk = asks.length > 0 ? asks[asks.length - 1].cum : 0;
  const maxCum = Math.max(maxBid, maxAsk) || 1;
  const vScale = plotH / maxCum;

  function xP(p: number) { return PAD.left + ((p - minP) / priceSpan) * plotW; }
  function yC(c: number) { return PAD.top + plotH - c * vScale; }

  ctx.clearRect(0, 0, W, H);

  /* subtle grid */
  ctx.strokeStyle = '#1e2329';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
  }

  /* bids */
  if (bids.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(xP(bids[0].price), PAD.top + plotH);
    for (const b of bids) ctx.lineTo(xP(b.price), yC(b.cum));
    ctx.lineTo(xP(bids[bids.length - 1].price), PAD.top + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(38, 166, 154, 0.18)'; ctx.fill();
    ctx.strokeStyle = '#26a69a'; ctx.lineWidth = 2;
    ctx.beginPath();
    bids.forEach((b, i) => i === 0 ? ctx.moveTo(xP(b.price), yC(b.cum)) : ctx.lineTo(xP(b.price), yC(b.cum)));
    ctx.stroke();
  }

  /* asks */
  if (asks.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(xP(asks[0].price), PAD.top + plotH);
    for (const a of asks) ctx.lineTo(xP(a.price), yC(a.cum));
    ctx.lineTo(xP(asks[asks.length - 1].price), PAD.top + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(239, 83, 80, 0.18)'; ctx.fill();
    ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 2;
    ctx.beginPath();
    asks.forEach((a, i) => i === 0 ? ctx.moveTo(xP(a.price), yC(a.cum)) : ctx.lineTo(xP(a.price), yC(a.cum)));
    ctx.stroke();
  }

  /* mid-price line */
  if (bids.length > 0 && asks.length > 0) {
    const mid = asks[0].price;
    ctx.strokeStyle = 'rgba(240,185,11,0.5)'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(xP(mid), PAD.top); ctx.lineTo(xP(mid), PAD.top + plotH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0b90b'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`$${mid.toFixed(0)}`, xP(mid), PAD.top - 5);
  }

  /* axis labels */
  ctx.fillStyle = '#848e9c'; ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  const lcount = Math.min(5, allPrices.length);
  for (let i = 0; i < lcount; i++) {
    const idx = Math.floor((allPrices.length - 1) * (i / Math.max(lcount - 1, 1)));
    const p = allPrices[idx];
    ctx.fillText(`$${p.toFixed(0)}`, xP(p), H - 8);
  }
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = (maxCum / 4) * i;
    const y = PAD.top + plotH - val * vScale;
    ctx.fillText(val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val.toFixed(2), PAD.left - 6, y + 4);
  }

  /* legend */
  ctx.textAlign = 'left';
  ctx.fillStyle = '#26a69a'; ctx.fillText('▬ Bids', PAD.left, PAD.top - 5);
  ctx.fillStyle = '#ef5350'; ctx.fillText('▬ Asks', PAD.left + 50, PAD.top - 5);
}

function DepthCanvas({ bids, asks }: { bids: { price: number; cum: number }[]; asks: { price: number; cum: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawDepth(ref.current, bids, asks); }, [bids, asks]);
  useEffect(() => {
    const fn = () => { if (ref.current) drawDepth(ref.current, bids, asks); };
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bids, asks]);
  return <canvas ref={ref} className={styles.depthCanvas} />;
}

/* ── Price chart ── */

export function TradeChart({ trades, oraclePrice, priceHistory, bids, asks, asset }: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<'Area'> | null>(null);
  const oracleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [view, setView] = useState<ChartView>('price');
  const [timeframe, setTimeframe] = useState<'all' | '50' | '20'>('all');

  const tradeData = useMemo(() => {
    let t = trades.slice().reverse();
    if (timeframe !== 'all') t = t.slice(-parseInt(timeframe));
    const now = Math.floor(Date.now() / 1000);
    return t.map((trade, i) => ({
      time: (now - (t.length - i) * INTERVAL_SEC) as UTCTimestamp,
      value: Number(trade.price) * 1000,
      volume: Number(trade.qty) / 10**5,
    }));
  }, [trades, timeframe]);

  const oracleHistoryData = useMemo(() => {
    const points = priceHistory
      .map(p => ({
        time: Math.floor(p.ts / 1000) as UTCTimestamp,
        value: (p[asset as keyof PricePoint] as number | null) ?? 0,
      }))
      .filter(d => d.value > 0);
    /* ensure unique ascending times */
    const seen = new Set<number>();
    return points.filter(d => {
      if (seen.has(d.time)) return false;
      seen.add(d.time);
      return true;
    });
  }, [priceHistory, asset]);

  const depthBids = useMemo(() => {
    const out: { price: number; cum: number }[] = [];
    let s = 0;
    for (const [p, q] of bids) { s += Number(q) / 10**5; out.push({ price: Number(p) * 1000, cum: s }); }
    return out;
  }, [bids]);

  const depthAsks = useMemo(() => {
    const out: { price: number; cum: number }[] = [];
    let s = 0;
    for (const [p, q] of asks) { s += Number(q) / 10**5; out.push({ price: Number(p) * 1000, cum: s }); }
    return out;
  }, [asks]);

  /* ── Create chart once ── */
  useEffect(() => {
    if (!containerRef.current || view !== 'price') return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#848e9c',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(30,35,41,0.8)' },
        horzLines: { color: 'rgba(30,35,41,0.8)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#474d57', labelBackgroundColor: '#1e2329' },
        horzLine: { color: '#474d57', labelBackgroundColor: '#1e2329' },
      },
      timeScale: {
        borderColor: '#2b2f36',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: { borderColor: '#2b2f36', minimumWidth: 80 },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    priceRef.current = chart.addSeries(AreaSeries, {
      lineColor: '#f0b90b',
      topColor: 'rgba(240,185,11,0.25)',
      bottomColor: 'rgba(240,185,11,0.0)',
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: true,
      title: 'DEX',
    });

    oracleRef.current = chart.addSeries(LineSeries, {
      color: '#2196f3',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: true,
      priceLineVisible: false,
      title: 'Oracle',
    });

    volRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    return () => { chart.remove(); chartRef.current = null; priceRef.current = null; oracleRef.current = null; volRef.current = null; };
  }, [view]);

  /* ── Update data without recreating chart ── */
  useEffect(() => {
    if (!chartRef.current || !priceRef.current || !volRef.current || !oracleRef.current) return;

    if (tradeData.length > 0) {
      priceRef.current.setData(tradeData);
      volRef.current.setData(
        tradeData.map((d, i) => ({
          time: d.time,
          value: d.volume,
          color: i > 0 && d.value >= tradeData[i - 1].value ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
        }))
      );
    } else {
      priceRef.current.setData([]);
      volRef.current.setData([]);
    }

    if (oracleHistoryData.length >= 2) {
      oracleRef.current.setData(oracleHistoryData);
    } else if (oraclePrice > 0 && tradeData.length > 0) {
      oracleRef.current.setData(tradeData.map(d => ({ time: d.time, value: oraclePrice })));
    } else {
      oracleRef.current.setData([]);
    }

    if (tradeData.length > 0 || oracleHistoryData.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [tradeData, oraclePrice, oracleHistoryData]);

  const noData = tradeData.length === 0 && oracleHistoryData.length < 2;

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.viewTabs}>
          <button className={view === 'price' ? styles.activeTab : ''} onClick={() => setView('price')}>Price</button>
          <button className={view === 'depth' ? styles.activeTab : ''} onClick={() => setView('depth')}>Depth</button>
        </div>
        {view === 'price' && (
          <>
            <div className={styles.legend}>
              <span className={styles.legendDex}>▬ DEX</span>
              <span className={styles.legendOracle}>⋯ Oracle</span>
            </div>
            <div className={styles.timeframeTabs}>
              {(['all', '50', '20'] as const).map(t => (
                <button key={t} className={timeframe === t ? styles.activeTab : ''} onClick={() => setTimeframe(t)}>
                  {t === 'all' ? 'All' : t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {view === 'price' ? (
        <div className={styles.chartWrap}>
          <div ref={containerRef} className={styles.chartContainer} />
          {noData && (
            <div className={styles.emptyOverlay}>
              {oraclePrice > 0 ? (
                <>
                  <div className={styles.emptyOraclePrice}>
                    ${oraclePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={styles.emptyAsset}>{asset} / USD · Oracle Price</div>
                  <div className={styles.emptyHint}>Place an order to begin the DEX price feed</div>
                </>
              ) : (
                <>
                  <div className={styles.emptyTitle}>No Price Data Yet</div>
                  <div className={styles.emptyHint}>Connect wallet and refresh price to begin</div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.chartWrap}>
          <DepthCanvas bids={depthBids} asks={depthAsks} />
        </div>
      )}
    </div>
  );
}
