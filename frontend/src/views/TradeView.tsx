import { Card } from '../components/ui/Card';
import styles from './TradeView.module.css';
import { useState, useMemo, useCallback } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { useSails } from '../hooks/useSails';
import { TrendingUp, TrendingDown, BarChart3, BookOpen, ListOrdered, ShoppingCart, RefreshCw } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { parseContractError } from '../lib/errors';
import { useViewport } from '../hooks/useViewport';
import { useTxStatus, TxStatusOverlay } from '../components/ui/TxStatus';
import { EmptyState } from '../components/ui/EmptyState';
import { useMarketData } from '../providers/MarketDataProvider';
import { TradeChart } from '../components/chart/TradeChart';

type PanelId = 'chart' | 'orderbook' | 'trades' | 'entry';

const mobilePanels: { id: PanelId; label: string; icon: React.ElementType }[] = [
  { id: 'chart', label: 'Chart', icon: BarChart3 },
  { id: 'orderbook', label: 'Orderbook', icon: BookOpen },
  { id: 'trades', label: 'Trades', icon: ListOrdered },
  { id: 'entry', label: 'Entry', icon: ShoppingCart },
];

function fmtTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (m >= 1) return `${m}m ${s}s ago`;
  return `${s}s ago`;
}

export function TradeView() {
  const [asset, setAsset] = useState<Asset>('BTC');
  const [orderType, setOrderType] = useState<'Limit' | 'Market'>('Limit');
  const [side, setSide] = useState<Side>('Buy');

  const handleAssetChange = (a: Asset) => {
    setAsset(a);
    if (pricesStale && account && !pricesLoading) {
      fetchPrice(asset);
    }
  };
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [mobilePanel, setMobilePanel] = useState<PanelId>('chart');
  const { isMobile } = useViewport();

  const { prices, orderbooks, trades, loading: marketLoading, lastFetched, pricesStalePer, pricesLoading, priceHistory, fetchPrice, refreshAll } = useMarketData();
  const pricesStale = pricesStalePer[asset];
  const { portfolio, refresh: refreshPortfolio } = usePortfolio();
  const { program, account } = useSails();
  const { success, error } = useToast();
  const { txState, executeTx, resetTx } = useTxStatus();

  const orderbook = orderbooks[asset] || { bids: [], asks: [] };
  const tradesList = trades[asset] || [];
  const oracleData = prices[asset];
  const oraclePriceMicro = oracleData ? BigInt(oracleData.price_usd_micro) : 0n;
  const oraclePrice = oraclePriceMicro > 0n ? Number(oraclePriceMicro) / 1_000_000 : 0;

  const lastPrice = tradesList.length > 0 ? tradesList[0].price : 0n;

  const priceDiff = useMemo(() => {
    const lp = Number(lastPrice) / 100;
    if (!lp || !oraclePrice) return null;
    const diff = (lp - oraclePrice) / oraclePrice * 100;
    return diff;
  }, [lastPrice, oraclePrice]);

  const maxQty = useMemo(() => {
    let m = 0n;
    for (const [, q] of [...orderbook.asks, ...orderbook.bids]) {
      const n = typeof q === 'bigint' ? q : BigInt(String(q));
      if (n > m) m = n;
    }
    return m;
  }, [orderbook]);

  const availableBalance = useMemo(() => {
    if (!portfolio) return { value: 0n, label: '$0.00', decimals: 2 };
    if (orderType === 'Market' || side === 'Sell') {
      const amt = asset === 'BTC' ? portfolio.btc : asset === 'ETH' ? portfolio.eth : portfolio.vara;
      const formatted = (Number(amt) / 10**8).toLocaleString(undefined, { maximumFractionDigits: 8 });
      return { value: amt, label: formatted, decimals: 8 };
    }
    return { value: portfolio.usd, label: `$${(Number(portfolio.usd) / 100).toLocaleString()}`, decimals: 2 };
  }, [portfolio, side, orderType, asset]);

  const applyPreset = (pct: number) => {
    if (!portfolio) return;
    let maxVal: bigint;
    let divisor: number;
    if (orderType === 'Market' || side === 'Sell') {
      maxVal = availableBalance.value;
      divisor = 10 ** availableBalance.decimals;
    } else {
      maxVal = portfolio.usd;
      divisor = 100;
    }
    const maxNumber = Number(maxVal) / divisor;
    const preset = (maxNumber * pct) / 100;
    const priceVal = orderType === 'Limit' ? parseFloat(price) : 0;
    if (orderType === 'Limit' && side === 'Buy' && priceVal > 0) {
      setQty((preset / priceVal).toFixed(minDecimals(preset / priceVal)));
    } else {
      setQty(preset.toFixed(minDecimals(preset)));
    }
  };

  function minDecimals(n: number): number {
    if (n >= 1) return 4;
    if (n >= 0.01) return 6;
    return 8;
  }

  const handlePlaceOrder = async () => {
    if (!program || !account || !qty) return;
    if (pricesStale && !pricesLoading) {
      success(`${asset} price is stale — signing a quick refresh. Please approve in your wallet.`);
      await fetchPrice(asset);
    }
    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      error('Invalid quantity');
      return;
    }
    if (orderType === 'Limit') {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        error('Invalid price');
        return;
      }
    }

    const q = BigInt(Math.round(parsedQty * 10**8));

    const err = await executeTx(
      () => {
        if (orderType === 'Market') {
          if (side === 'Buy') {
            return program!.orderbook.marketBuy(asset, q);
          }
          return program!.orderbook.marketSell(asset, q);
        }
        const p = BigInt(Math.round(parseFloat(price) * 100));
        return program!.orderbook.placeLimit(side, asset, p, q);
      },
      account,
      () => {
        setPrice('');
        setQty('');
        refreshPortfolio();
        refreshAll();
        success('Order placed successfully!');
        /* Second refresh after 2s for RPC latency */
        setTimeout(() => { refreshPortfolio(); refreshAll(); }, 2000);
      }
    );

    if (err) {
      error(parseContractError(err));
    }
  };

  const renderPrice = () => {
    const isStale = oraclePrice > 0 && lastFetched !== null && pricesStale;
    if (oraclePrice > 0) {
      if (!account) {
        return (
          <span className={styles.priceWithHint}>
            <span>${oraclePrice.toFixed(2)}</span>
            {isStale && <span className={styles.staleHint}>(outdated · connect wallet to refresh)</span>}
          </span>
        );
      }
      const staleTitle = lastFetched ? `Price is stale (${fmtTimeAgo(lastFetched)}). Click to sign a tx & refresh.` : 'Click to refresh price';
      return (
        <button className={styles.stalePriceBtn} onClick={() => fetchPrice(asset)} disabled={pricesLoading} title={staleTitle}>
          <span className={styles.priceWithHint}>
            <span>${oraclePrice.toFixed(2)} <RefreshCw size={12} className={pricesLoading ? styles.spin : ''} /></span>
            {isStale && <span className={styles.staleHint}>outdated · tap to refresh</span>}
          </span>
        </button>
      );
    }
    if (!account) return '---';
    return (
      <button className={styles.stalePriceBtn} onClick={() => fetchPrice(asset)} disabled={pricesLoading}
        title="Click to sign a tx & fetch oracle price">
        {pricesLoading ? <><RefreshCw size={12} className={styles.spin} /> Loading...</> : '---'}
      </button>
    );
  };

  const handleObKeyDown = useCallback((e: React.KeyboardEvent, priceVal: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPrice(priceVal);
    }
  }, []);

  const chartPanel = (
    <Card title={`${asset} / USD Chart`} className={styles.fullHeight}>
      <div className={styles.headerStats}>
         <div className={styles.assetSelector}>
            {['BTC', 'ETH', 'VARA'].map(a => (
              <button
                key={a}
                className={asset === a ? styles.activeAsset : ''}
                onClick={() => handleAssetChange(a as Asset)}
              >
                {a}
              </button>
            ))}
         </div>
         <div className={styles.marketStats}>
            <div className={styles.statItem}>
                <span className={styles.statLabel}>DEX Price</span>
                <span className={styles.statValue}>
                  ${lastPrice ? (Number(lastPrice)/100).toFixed(2) : '---'}
                </span>
            </div>
            <div className={styles.statItem}>
                <span className={styles.statLabel}>Oracle Price</span>
                <span className={styles.statValue}>
                  {renderPrice()}
                  {oracleData?.change_24h_bps !== undefined && (
                    <span className={Number(oracleData.change_24h_bps) >= 0 ? styles.positive : styles.negative} style={{ fontSize: 12, marginLeft: 4 }}>
                      {Number(oracleData.change_24h_bps) >= 0 ? '+' : ''}{(Number(oracleData.change_24h_bps) / 100).toFixed(2)}%
                    </span>
                  )}
                </span>
            </div>
            {priceDiff !== null && (
                <div className={`${styles.statItem} ${priceDiff > 0 ? styles.positive : styles.negative}`}>
                    <span className={styles.statLabel}>Arb Opportunity</span>
                    <span className={styles.statValue}>
                        {priceDiff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {Math.abs(priceDiff).toFixed(2)}%
                    </span>
                </div>
            )}
         </div>
      </div>
      <TradeChart
        trades={tradesList}
        oraclePrice={oraclePrice}
        priceHistory={priceHistory}
        bids={orderbook.bids}
        asks={orderbook.asks}
        asset={asset}
      />
    </Card>
  );

  const orderbookPanel = (
    <Card title="Orderbook" className={styles.fullHeight}>
      <div className={styles.obHeader}>
        <span>Price</span>
        <span>Qty</span>
        <span>Total</span>
      </div>
      <div className={styles.obList}>
        {orderbook.asks.length === 0 && orderbook.bids.length === 0 && (
          <EmptyState
            title={marketLoading ? 'Loading...' : 'No Orders Yet'}
            description={marketLoading ? 'Fetching orderbook data...' : 'Be the first to place an order! Click a price below to fill the order form.'}
          />
        )}
        {orderbook.asks.slice(0, 10).reverse().map(([p, q], i) => (
          <div key={i} className={`${styles.obRow} ${styles.ask}`}
            style={{ '--depth': maxQty > 0n ? `${(Number(q) / Number(maxQty) * 100).toFixed(1)}%` : '0%' } as React.CSSProperties}
            onClick={() => setPrice((Number(p)/100).toString())}
            role="button" tabIndex={0}
            onKeyDown={e => handleObKeyDown(e, (Number(p)/100).toString())}
            aria-label={`Ask price ${(Number(p)/100).toFixed(2)}, quantity ${(Number(q)/10**8).toFixed(4)}`}>
            <span>{(Number(p)/100).toFixed(2)}</span>
            <span>{(Number(q)/10**8).toFixed(4)}</span>
            <span>{((Number(p)*Number(q))/10**10).toFixed(2)}</span>
          </div>
        ))}
        <div className={styles.spread}>
          <span className={styles.lastPrice}>{lastPrice ? (Number(lastPrice)/100).toFixed(2) : '---'}</span>
          <span className={styles.spreadLabel}>Last Price</span>
        </div>
        {orderbook.bids.slice(0, 10).map(([p, q], i) => (
          <div key={i} className={`${styles.obRow} ${styles.bid}`}
            style={{ '--depth': maxQty > 0n ? `${(Number(q) / Number(maxQty) * 100).toFixed(1)}%` : '0%' } as React.CSSProperties}
            onClick={() => setPrice((Number(p)/100).toString())}
            role="button" tabIndex={0}
            onKeyDown={e => handleObKeyDown(e, (Number(p)/100).toString())}
            aria-label={`Bid price ${(Number(p)/100).toFixed(2)}, quantity ${(Number(q)/10**8).toFixed(4)}`}>
            <span>{(Number(p)/100).toFixed(2)}</span>
            <span>{(Number(q)/10**8).toFixed(4)}</span>
            <span>{((Number(p)*Number(q))/10**10).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </Card>
  );

  const entryPanel = (
    <Card title="Place Order">
      <div className={styles.orderTypeTabs}>
        <button
          className={orderType === 'Limit' ? styles.activeType : ''}
          onClick={() => setOrderType('Limit')}
          aria-pressed={orderType === 'Limit'}
        >
          Limit
        </button>
        <button
          className={orderType === 'Market' ? styles.activeType : ''}
          onClick={() => setOrderType('Market')}
          aria-pressed={orderType === 'Market'}
        >
          Market
        </button>
      </div>
      <div className={styles.sideButtons}>
        <button
          className={`${styles.buyBtn} ${side === 'Buy' ? '' : styles.inactive}`}
          onClick={() => setSide('Buy')}
          aria-pressed={side === 'Buy'}
        >
          Buy
        </button>
        <button
          className={`${styles.sellBtn} ${side === 'Sell' ? '' : styles.inactive}`}
          onClick={() => setSide('Sell')}
          aria-pressed={side === 'Sell'}
        >
          Sell
        </button>
      </div>
      {orderType === 'Limit' && (
        <div className={styles.formGroup}>
          <label>Price (USD)</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
          {oraclePrice > 0 && (
              <div className={styles.inputHint} onClick={() => setPrice(oraclePrice.toFixed(2))}>
                  Oracle: ${oraclePrice.toFixed(2)}
              </div>
          )}
        </div>
      )}
      <div className={styles.formGroup}>
        <label>Quantity ({asset})</label>
        <div className={styles.qtyRow}>
          <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0.00" />
          {account && portfolio && (
            <div className={styles.balanceTag} onClick={() => applyPreset(100)}>
              Balance: {availableBalance.label}
            </div>
          )}
        </div>
        {account && portfolio && Number(availableBalance.value) > 0 && (
          <div className={styles.presets}>
            {[25, 50, 75, 100].map(pct => (
              <button key={pct} className={styles.presetBtn} onClick={() => applyPreset(pct)}>
                {pct}%
              </button>
            ))}
          </div>
        )}
      </div>
      {orderType === 'Limit' && (
        <div className={styles.totalInfo}>
          <span>Est. Total:</span>
          <span>${((parseFloat(price || '0') * parseFloat(qty || '0')) || 0).toFixed(2)}</span>
        </div>
      )}
      <button
        className={side === 'Buy' ? styles.submitBuy : styles.submitSell}
        onClick={handlePlaceOrder}
        disabled={txState.visible && txState.stage !== 'failed' && txState.stage !== 'confirmed'}
      >
        {txState.stage === 'broadcasting' || txState.stage === 'confirming' ? 'Processing...' : orderType === 'Market' ? `Market ${side} ${asset}` : `${side} ${asset}`}
      </button>
      {!account && <div className={styles.connectWarn}>Connect wallet to trade</div>}
    </Card>
  );

  const tradesPanel = (
    <Card title="Recent Trades" className={styles.fullHeight}>
       <div className={styles.obHeader}>
        <span>Price</span>
        <span>Qty</span>
        <span>Time</span>
      </div>
      <div className={styles.obList}>
        {tradesList.length === 0 && (
          <EmptyState
            title={marketLoading ? 'Loading...' : 'No Trades Yet'}
            description={marketLoading ? 'Fetching trade history...' : 'Trades will appear here once orders are matched.'}
          />
        )}
        {tradesList.map((t, i) => (
          <div key={i} className={styles.obRow}>
            <span className={styles.buyText}>{(Number(t.price)/100).toFixed(2)}</span>
            <span>{(Number(t.qty)/10**8).toFixed(4)}</span>
            <span>{t.time}</span>
          </div>
        ))}
      </div>
    </Card>
  );

  if (isMobile) {
    return (
      <div className={styles.mobileContainer}>
        <div className={styles.mobileTabs}>
          {mobilePanels.map(p => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                className={`${styles.mobileTab} ${mobilePanel === p.id ? styles.mobileTabActive : ''}`}
                onClick={() => setMobilePanel(p.id)}
              >
                <Icon size={16} />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
        <div className={styles.mobilePanel}>
          {mobilePanel === 'chart' && chartPanel}
          {mobilePanel === 'orderbook' && orderbookPanel}
          {mobilePanel === 'trades' && tradesPanel}
          {mobilePanel === 'entry' && entryPanel}
        </div>
        <TxStatusOverlay state={txState} onClose={resetTx} />
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      <div className={styles.chartArea}>
        {chartPanel}
      </div>

      <div className={styles.orderbookArea}>
        {orderbookPanel}
      </div>

      <div className={styles.entryArea}>
        {entryPanel}
      </div>

      <div className={styles.tradesArea}>
        {tradesPanel}
      </div>

      <TxStatusOverlay state={txState} onClose={resetTx} />
    </div>
  );
}
