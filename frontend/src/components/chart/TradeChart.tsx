import { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart, ColorType, LineStyle,
  AreaSeries, LineSeries, HistogramSeries,
  type IChartApi, type UTCTimestamp,
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

const INTERVAL_SEC = 10;

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
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;
  const PAD = { top: 16, right: 16, bottom: 32, left: 64 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  /* Find price range */
  const bidPrices = bids.map(b => b.price);
  const askPrices = asks.map(a => a.price);
  const allPrices = [...bidPrices, ...askPrices];
  if (allPrices.length === 0) return;
  const minP = allPrices[0];
  const maxP = allPrices[allPrices.length - 1];
  const priceSpan = maxP - minP || 1;

  /* Find max cumulative volume */
  const maxBid = bids.length > 0 ? bids[bids.length - 1].cum : 0;
  const maxAsk = asks.length > 0 ? asks[asks.length - 1].cum : 0;
  const maxCum = Math.max(maxBid, maxAsk) || 1;

  const clampW = plotH / maxCum; /* vertical scale */

  function xPrice(p: number) {
    return PAD.left + ((p - minP) / priceSpan) * plotW;
  }
  function yCum(c: number) {
    return PAD.top + plotH - c * clampW;
  }

  /* Clear */
  ctx.clearRect(0, 0, W, H);

  /* Grid lines */
  ctx.strokeStyle = '#1e2329';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
  }

  /* Draw bids (green area) */
  if (bids.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(xPrice(bids[0].price), H - PAD.bottom);
    for (const b of bids) ctx.lineTo(xPrice(b.price), yCum(b.cum));
    ctx.lineTo(xPrice(bids[bids.length - 1].price), H - PAD.bottom);
    ctx.closePath();
    ctx.fillStyle = 'rgba(38, 166, 154, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#26a69a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < bids.length; i++) {
      const x = xPrice(bids[i].price);
      const y = yCum(bids[i].cum);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* Draw asks (red area) */
  if (asks.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(xPrice(asks[0].price), H - PAD.bottom);
    for (const a of asks) ctx.lineTo(xPrice(a.price), yCum(a.cum));
    ctx.lineTo(xPrice(asks[asks.length - 1].price), H - PAD.bottom);
    ctx.closePath();
    ctx.fillStyle = 'rgba(239, 83, 80, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#ef5350';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < asks.length; i++) {
      const x = xPrice(asks[i].price);
      const y = yCum(asks[i].cum);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* Labels */
  ctx.fillStyle = '#848e9c';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  const labelCount = Math.min(5, allPrices.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((allPrices.length - 1) * (i / (labelCount - 1)));
    const p = allPrices[idx];
    ctx.fillText(p.toFixed(2), xPrice(p), H - 6);
  }

  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = (maxCum / 4) * i;
    const y = PAD.top + plotH - val * clampW;
    const label = val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val.toFixed(1);
    ctx.fillText(label, PAD.left - 8, y + 4);
  }

  /* Crosshair vertical at bid/ask junction */
  if (bids.length > 0 && asks.length > 0) {
    const midPrice = asks[0].price;
    const x = xPrice(midPrice);
    ctx.strokeStyle = '#474d57';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, H - PAD.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function DepthCanvas({ bids, asks }: { bids: { price: number; cum: number }[]; asks: { price: number; cum: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawDepth(canvasRef.current, bids, asks);
  }, [bids, asks]);

  useEffect(() => {
    const onResize = () => {
      if (canvasRef.current) drawDepth(canvasRef.current, bids, asks);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bids, asks]);

  return <canvas ref={canvasRef} className={styles.depthCanvas} />;
}

/* ── Main component ── */

export function TradeChart({ trades, oraclePrice, priceHistory, bids, asks, asset }: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [view, setView] = useState<ChartView>('price');
  const [timeframe, setTimeframe] = useState<'all' | '50' | '20'>('all');

  const tradeData = useMemo(() => {
    let t = trades.slice().reverse();
    if (timeframe !== 'all') {
      const n = parseInt(timeframe);
      t = t.slice(-n);
    }
    const now = Math.floor(Date.now() / 1000);
    return t.map((trade, i) => ({
      time: (now - (t.length - i) * INTERVAL_SEC) as UTCTimestamp,
      value: Number(trade.price) * 1000,
      volume: Number(trade.qty) / 10**5,
    }));
  }, [trades, timeframe]);

  const depthBids = useMemo(() => {
    const out: { price: number; cum: number }[] = [];
    let sum = 0;
    for (const [p, q] of bids) {
      sum += Number(q) / 10**5;
      out.push({ price: Number(p) * 1000, cum: sum });
    }
    return out;
  }, [bids]);

  const depthAsks = useMemo(() => {
    const out: { price: number; cum: number }[] = [];
    let sum = 0;
    for (const [p, q] of asks) {
      sum += Number(q) / 10**5;
      out.push({ price: Number(p) * 1000, cum: sum });
    }
    return out;
  }, [asks]);

  /* ── lightweight-charts: price view only ── */
  useEffect(() => {
    if (!containerRef.current || view !== 'price') return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0e11' },
        textColor: '#848e9c',
      },
      grid: {
        vertLines: { color: '#1e2329' },
        horzLines: { color: '#1e2329' },
      },
      width: containerRef.current.clientWidth,
      height: 360,
      crosshair: { mode: 0 },
      timeScale: {
        borderColor: '#2b2f36',
        timeVisible: false,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: '#2b2f36' },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;

    const priceSeries = chart.addSeries(AreaSeries, {
      lineColor: '#f0b90b',
      topColor: 'rgba(240, 185, 11, 0.3)',
      bottomColor: 'rgba(240, 185, 11, 0.02)',
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    if (tradeData.length > 0) {
      priceSeries.setData(tradeData);
    }

    /* Oracle price line — use history if available, else flat reference */
    const oracleHistoryData = priceHistory
      .map(p => ({
        time: Math.floor(p.ts / 1000) as UTCTimestamp,
        value: (p[asset as keyof PricePoint] as number | null) ?? 0,
      }))
      .filter(d => d.value > 0);

    if (oracleHistoryData.length >= 2) {
      const oLine = chart.addSeries(LineSeries, {
        color: '#2196f3',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: true,
        priceLineVisible: false,
        title: 'Oracle',
      });
      oLine.setData(oracleHistoryData);
    } else if (oraclePrice > 0 && tradeData.length > 0) {
      const oLine = chart.addSeries(LineSeries, {
        color: '#474d57',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      oLine.setData(tradeData.map(d => ({ time: d.time, value: oraclePrice })));
    }

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    if (tradeData.length > 0) {
      volSeries.setData(
        tradeData.map((d, i) => ({
          time: d.time,
          value: d.volume,
          color: i > 0 && d.value >= tradeData[i - 1].value
            ? 'rgba(38, 166, 154, 0.5)'
            : 'rgba(239, 83, 80, 0.5)',
        }))
      );
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [tradeData, oraclePrice, priceHistory, asset, view]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.viewTabs}>
          <button
            className={view === 'price' ? styles.activeTab : ''}
            onClick={() => setView('price')}
          >
            Price
          </button>
          <button
            className={view === 'depth' ? styles.activeTab : ''}
            onClick={() => setView('depth')}
          >
            Depth
          </button>
        </div>
        {view === 'price' && (
          <div className={styles.timeframeTabs}>
            {(['all', '50', '20'] as const).map(t => (
              <button
                key={t}
                className={timeframe === t ? styles.activeTab : ''}
                onClick={() => setTimeframe(t)}
              >
                {t === 'all' ? 'All' : t}
              </button>
            ))}
          </div>
        )}
      </div>
      {view === 'price' ? (
        <div ref={containerRef} className={styles.chartContainer} />
      ) : (
        <DepthCanvas bids={depthBids} asks={depthAsks} />
      )}
    </div>
  );
}
