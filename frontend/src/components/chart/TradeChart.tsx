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

const CHART_BG = '#0d1117';
const INTERVAL_SEC = 30;

/* ── helpers ── */

function buildTradeData(
  trades: { price: bigint; qty: bigint }[],
  timeframe: 'all' | '50' | '20',
) {
  let t = trades.slice().reverse();
  if (timeframe !== 'all') t = t.slice(-parseInt(timeframe));
  const now = Math.floor(Date.now() / 1000);
  return t.map((tr, i) => ({
    time: (now - (t.length - i) * INTERVAL_SEC) as UTCTimestamp,
    value: Number(tr.price) * 1000,
    volume: Number(tr.qty) / 10 ** 5,
  }));
}

function buildOracleData(priceHistory: PricePoint[], asset: string) {
  const seen = new Set<number>();
  return priceHistory
    .map(p => ({
      time: Math.floor(p.ts / 1000) as UTCTimestamp,
      value: (p[asset as keyof PricePoint] as number | null) ?? 0,
    }))
    .filter(d => {
      if (d.value <= 0 || seen.has(d.time)) return false;
      seen.add(d.time);
      return true;
    });
}

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
  const W = rect.width, H = rect.height;
  const PAD = { top: 24, right: 16, bottom: 36, left: 68 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = CHART_BG;
  ctx.fillRect(0, 0, W, H);

  const allPrices = [...bids.map(b => b.price), ...asks.map(a => a.price)];
  if (allPrices.length === 0) {
    ctx.fillStyle = '#848e9c';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No open orders yet', W / 2, H / 2);
    return;
  }

  const minP = allPrices[0], maxP = allPrices[allPrices.length - 1];
  const priceSpan = maxP - minP || 1;
  const maxCum = Math.max(
    bids.length ? bids[bids.length - 1].cum : 0,
    asks.length ? asks[asks.length - 1].cum : 0,
  ) || 1;
  const vScale = plotH / maxCum;

  const xP = (p: number) => PAD.left + ((p - minP) / priceSpan) * plotW;
  const yC = (c: number) => PAD.top + plotH - c * vScale;

  /* grid */
  ctx.strokeStyle = '#1e2329'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
  }

  const drawArea = (pts: typeof bids, fill: string, stroke: string) => {
    if (pts.length < 1) return;
    ctx.beginPath();
    ctx.moveTo(xP(pts[0].price), PAD.top + plotH);
    for (const p of pts) ctx.lineTo(xP(p.price), yC(p.cum));
    ctx.lineTo(xP(pts[pts.length - 1].price), PAD.top + plotH);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(xP(p.price), yC(p.cum)) : ctx.lineTo(xP(p.price), yC(p.cum)));
    ctx.stroke();
  };

  drawArea(bids, 'rgba(38,166,154,0.18)', '#26a69a');
  drawArea(asks, 'rgba(239,83,80,0.18)', '#ef5350');

  /* mid-price */
  if (bids.length && asks.length) {
    const mid = asks[0].price;
    ctx.strokeStyle = 'rgba(240,185,11,0.6)'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(xP(mid), PAD.top); ctx.lineTo(xP(mid), PAD.top + plotH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0b90b'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`$${mid.toFixed(0)}`, xP(mid), PAD.top - 6);
  }

  /* price axis */
  ctx.fillStyle = '#848e9c'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  const lc = Math.min(5, allPrices.length);
  for (let i = 0; i < lc; i++) {
    const p = allPrices[Math.floor((allPrices.length - 1) * (i / Math.max(lc - 1, 1)))];
    ctx.fillText(`$${p.toFixed(0)}`, xP(p), H - 8);
  }
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = (maxCum / 4) * i;
    ctx.fillText(v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(2), PAD.left - 6, PAD.top + plotH - v * vScale + 4);
  }

  /* legend */
  ctx.textAlign = 'left';
  ctx.fillStyle = '#26a69a'; ctx.fillText('▬ Bids', PAD.left + 4, PAD.top - 8);
  ctx.fillStyle = '#ef5350'; ctx.fillText('▬ Asks', PAD.left + 56, PAD.top - 8);
}

function DepthCanvas({ bids, asks }: { bids: { price: number; cum: number }[]; asks: { price: number; cum: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = () => { if (ref.current) drawDepth(ref.current, bids, asks); };
  useEffect(draw, [bids, asks]);
  useEffect(() => {
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bids, asks]);
  return <canvas ref={ref} className={styles.depthCanvas} />;
}

/* ── Price chart ── */

export function TradeChart({ trades, oraclePrice, priceHistory, bids, asks, asset }: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const priceRef     = useRef<ISeriesApi<'Area'> | null>(null);
  const oracleRef    = useRef<ISeriesApi<'Line'> | null>(null);
  const volRef       = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [view, setView] = useState<ChartView>('price');
  const [timeframe, setTimeframe] = useState<'all' | '50' | '20'>('all');

  const tradeData    = useMemo(() => buildTradeData(trades, timeframe), [trades, timeframe]);
  const oracleData   = useMemo(() => buildOracleData(priceHistory, asset), [priceHistory, asset]);

  const depthBids = useMemo(() => {
    let s = 0;
    return bids.map(([p, q]) => { s += Number(q) / 1e5; return { price: Number(p) * 1000, cum: s }; });
  }, [bids]);
  const depthAsks = useMemo(() => {
    let s = 0;
    return asks.map(([p, q]) => { s += Number(q) / 1e5; return { price: Number(p) * 1000, cum: s }; });
  }, [asks]);

  /* ── Sync chart data (runs whenever deps change OR chart is recreated) ── */
  const syncData = (
    price: ISeriesApi<'Area'>,
    oracle: ISeriesApi<'Line'>,
    vol: ISeriesApi<'Histogram'>,
    chart: IChartApi,
    td: typeof tradeData,
    od: typeof oracleData,
    op: number,
  ) => {
    if (td.length > 0) {
      price.setData(td);
      vol.setData(td.map((d, i) => ({
        time: d.time, value: d.volume,
        color: i > 0 && d.value >= td[i - 1].value ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
      })));
    } else {
      price.setData([]); vol.setData([]);
    }

    if (od.length >= 2) {
      oracle.setData(od);
    } else if (op > 0 && td.length > 0) {
      oracle.setData(td.map(d => ({ time: d.time, value: op })));
    } else {
      oracle.setData([]);
    }

    if (td.length > 0 || od.length > 0) chart.timeScale().fitContent();
  };

  /* ── Create chart once per view-switch ── */
  useEffect(() => {
    if (view !== 'price' || !containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 340,
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: '#848e9c',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a1f26' },
        horzLines: { color: '#1a1f26' },
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
      rightPriceScale: { borderColor: '#2b2f36', minimumWidth: 72 },
      handleScroll: true,
      handleScale: true,
    });

    const priceSeries = chart.addSeries(AreaSeries, {
      lineColor: '#f0b90b',
      topColor: 'rgba(240,185,11,0.22)',
      bottomColor: 'rgba(240,185,11,0.01)',
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: true,
      title: 'DEX',
    });

    const oracleSeries = chart.addSeries(LineSeries, {
      color: '#2196f3',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: true,
      priceLineVisible: false,
      title: 'Oracle',
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    chartRef.current   = chart;
    priceRef.current   = priceSeries;
    oracleRef.current  = oracleSeries;
    volRef.current     = volSeries;

    /* Load initial data immediately */
    syncData(priceSeries, oracleSeries, volSeries, chart, tradeData, oracleData, oraclePrice);

    /* Resize handler */
    const onResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 340,
        });
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null; priceRef.current = null; oracleRef.current = null; volRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /* ── Update data when it changes ── */
  useEffect(() => {
    if (!chartRef.current || !priceRef.current || !oracleRef.current || !volRef.current) return;
    syncData(priceRef.current, oracleRef.current, volRef.current, chartRef.current, tradeData, oracleData, oraclePrice);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeData, oracleData, oraclePrice]);

  const noData = tradeData.length === 0 && oracleData.length < 2;

  return (
    <div className={styles.wrapper}>
      {/* ── toolbar ── */}
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

      {/* ── chart area ── */}
      <div className={styles.chartWrap}>
        {view === 'price' ? (
          <>
            <div
              ref={containerRef}
              className={styles.chartContainer}
              style={{ visibility: noData ? 'hidden' : 'visible' }}
            />
            {noData && (
              <div className={styles.emptyOverlay}>
                {oraclePrice > 0 ? (
                  <>
                    <div className={styles.emptyOraclePrice}>
                      ${oraclePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className={styles.emptyAsset}>{asset} / USD · Oracle Reference</div>
                    <div className={styles.emptyHint}>Place an order to start the DEX price feed</div>
                  </>
                ) : (
                  <>
                    <div className={styles.emptyTitle}>Waiting for price data</div>
                    <div className={styles.emptyHint}>Connect wallet and tap a price in the header to refresh</div>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <DepthCanvas bids={depthBids} asks={depthAsks} />
        )}
      </div>
    </div>
  );
}
