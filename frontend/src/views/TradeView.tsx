import { Card } from '../components/ui/Card';
import styles from './TradeView.module.css';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { useSails } from '../hooks/useSails';
import { TrendingUp, TrendingDown, BarChart3, BookOpen, ListOrdered, ShoppingCart, RefreshCw, Zap } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { parseContractError } from '../lib/errors';
import { useViewport } from '../hooks/useViewport';
import { useTxStatus, TxStatusOverlay } from '../components/ui/TxStatus';
import { EmptyState } from '../components/ui/EmptyState';
import { useMarketData } from '../providers/MarketDataProvider';
import { TradeChart } from '../components/chart/TradeChart';
import { web3FromSource } from '@polkadot/extension-dapp';

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
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [mobilePanel, setMobilePanel] = useState<PanelId>('chart');
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [cancellingOid, setCancellingOid] = useState<number | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const { isMobile } = useViewport();

  /* Track whether price was auto-filled so we don't clobber user input */
  const priceAutoRef = useRef(false);

  const { prices, orderbooks, trades, loading: marketLoading, lastFetched, pricesStalePer, pricesLoading, priceHistory, fetchPrice, refreshAll, tickMarket, tickLoading } = useMarketData();
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
    const lp = Number(lastPrice) * 1000;
    if (!lp || !oraclePrice) return null;
    return (lp - oraclePrice) / oraclePrice * 100;
  }, [lastPrice, oraclePrice]);

  /* ── Auto-fill price from oracle ── */
  /* Reset auto-fill flag when asset changes */
  useEffect(() => {
    priceAutoRef.current = false;
    if (oraclePrice > 0) {
      setPrice(oraclePrice.toFixed(2));
      priceAutoRef.current = true;
    } else {
      setPrice('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  /* Fill price when oracle first arrives (e.g. on page load) */
  useEffect(() => {
    if (oraclePrice > 0 && !priceAutoRef.current) {
      setPrice(oraclePrice.toFixed(2));
      priceAutoRef.current = true;
    }
  }, [oraclePrice]);

  /* ── My Open Orders ── */
  const fetchMyOrders = useCallback(async () => {
    if (!program || !account) return;
    try {
      const result = await program.orderbook.getMyOrders().withAddress(account.decodedAddress).call();
      if (result && Array.isArray(result)) {
        setMyOrders(result.filter((o: any) => o[6] === 'Open' || o[6] === 'Partial'));
      }
    } catch {}
  }, [program, account]);

  useEffect(() => { fetchMyOrders(); }, [fetchMyOrders, portfolio]);

  const handleCancelOrder = useCallback(async (oid: any) => {
    if (!program || !account || cancellingOid !== null) return;
    setCancellingOid(Number(oid));
    try {
      const { signer } = await web3FromSource(account.meta.source);
      const tx = program.orderbook.cancelOrder(oid);
      await tx.withAccount(account.address, { signer }).calculateGas();
      const { response } = await tx.signAndSend();
      const result = await response();
      if (result && typeof result === 'object' && 'err' in result) {
        const err = (result as any).err;
        error(parseContractError(typeof err === 'string' ? err : JSON.stringify(err)));
      } else {
        success('Order cancelled');
        setMyOrders(prev => prev.filter((o: any) => Number(o[0]) !== Number(oid)));
        refreshPortfolio();
        refreshAll();
        setTimeout(() => { refreshPortfolio(); fetchMyOrders(); }, 2000);
      }
    } catch (e: any) {
      error(parseContractError(e?.message || String(e)));
    } finally {
      setCancellingOid(null);
    }
  }, [program, account, cancellingOid, error, success, refreshPortfolio, refreshAll, fetchMyOrders]);

  /* ── Quick Demo Trade: self-matched buy+sell at oracle price ── */
  const executeDemoTrade = useCallback(async () => {
    if (!program || !account || !oraclePrice || demoLoading) return;
    setDemoLoading(true);
    try {
      const { signer } = await web3FromSource(account.meta.source);
      const demoQty = asset === 'BTC' ? 0.001 : asset === 'ETH' ? 0.01 : 100;
      const q = BigInt(Math.round(demoQty * 10 ** 5));
      const p = BigInt(Math.max(1, Math.round(oraclePrice / 1000)));

      /* Step 1 — Place sell limit at oracle price */
      const sellTx = program.orderbook.placeLimit('Sell', asset, p, q);
      await sellTx.withAccount(account.address, { signer }).calculateGas();
      const { response: sellResp } = await sellTx.signAndSend();
      const sellResult = await sellResp();
      if (sellResult && typeof sellResult === 'object' && 'err' in sellResult) {
        throw new Error(JSON.stringify((sellResult as any).err));
      }

      /* Step 2 — Place buy limit at same price → instant match → trade */
      const buyTx = program.orderbook.placeLimit('Buy', asset, p, q);
      await buyTx.withAccount(account.address, { signer }).calculateGas();
      const { response: buyResp } = await buyTx.signAndSend();
      const buyResult = await buyResp();
      if (buyResult && typeof buyResult === 'object' && 'err' in buyResult) {
        throw new Error(JSON.stringify((buyResult as any).err));
      }

      success(`Demo trade executed! ${demoQty} ${asset} @ $${oraclePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
      refreshPortfolio();
      refreshAll();
      fetchMyOrders();
    } catch (e: any) {
      error(`Demo trade failed: ${parseContractError(e?.message || String(e))}`);
    } finally {
      setDemoLoading(false);
    }
  }, [program, account, oraclePrice, asset, demoLoading, success, error, refreshPortfolio, refreshAll, fetchMyOrders]);

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
      const formatted = (Number(amt) / 10 ** 5).toLocaleString(undefined, { maximumFractionDigits: 5 });
      return { value: amt, label: formatted, decimals: 5 };
    }
    return { value: portfolio.usd, label: `$${(Number(portfolio.usd) / 100).toLocaleString()}`, decimals: 2 };
  }, [portfolio, side, orderType, asset]);

  const applyPreset = (pct: number) => {
    if (!portfolio) return;
    const maxVal = availableBalance.value;
    const divisor = 10 ** availableBalance.decimals;
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
    if (n >= 1) return 3;
    if (n >= 0.01) return 4;
    return 5;
  }

  const handleAssetChange = (a: Asset) => {
    setAsset(a);
    /* Fix: use new asset `a`, not the stale closure `asset` */
    if (pricesStalePer[a] && account && !pricesLoading) {
      fetchPrice(a);
    }
  };

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

    const q = BigInt(Math.round(parsedQty * 10 ** 5));

    const err = await executeTx(
      () => {
        if (orderType === 'Market') {
          if (side === 'Buy') return program!.orderbook.marketBuy(asset, q);
          return program!.orderbook.marketSell(asset, q);
        }
        const p = BigInt(Math.max(1, Math.round(parseFloat(price) / 1000)));
        return program!.orderbook.placeLimit(side, asset, p, q);
      },
      account,
      () => {
        setQty('');
        refreshPortfolio();
        refreshAll();
        fetchMyOrders();
        const verb = orderType === 'Market' ? 'executed' : 'placed';
        success(`Order ${verb} successfully!`);
        setTimeout(() => { refreshPortfolio(); refreshAll(); fetchMyOrders(); }, 2500);
      }
    );

    if (err) {
      const msg = parseContractError(err);
      if (err.includes('NoLiquidity') || err.includes('NoBuyers')) {
        error(`${msg} Try placing a Limit order instead, or use the Quick Demo to seed the orderbook.`);
      } else {
        error(msg);
      }
    }
  };

  const renderPrice = () => {
    const isStale = oraclePrice > 0 && lastFetched !== null && pricesStale;
    if (oraclePrice > 0) {
      if (!account) {
        return (
          <span className={styles.priceWithHint}>
            <span>${oraclePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            {isStale && <span className={styles.staleHint}>(outdated · connect wallet to refresh)</span>}
          </span>
        );
      }
      const staleTitle = lastFetched ? `Price is stale (${fmtTimeAgo(lastFetched)}). Click to sign a tx & refresh.` : 'Click to refresh price';
      return (
        <button className={styles.stalePriceBtn} onClick={() => fetchPrice(asset)} disabled={pricesLoading} title={staleTitle}>
          <span className={styles.priceWithHint}>
            <span>${oraclePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} <RefreshCw size={12} className={pricesLoading ? styles.spin : ''} /></span>
            {isStale && <span className={styles.staleHint}>outdated · tap to refresh</span>}
          </span>
        </button>
      );
    }
    if (!account) return '---';
    return (
      <button className={styles.stalePriceBtn} onClick={() => fetchPrice(asset)} disabled={pricesLoading}
        title="Click to sign a tx & fetch oracle price">
        {pricesLoading ? <><RefreshCw size={12} className={styles.spin} /> Loading...</> : '--- (tap to fetch)'}
      </button>
    );
  };

  const handleObKeyDown = useCallback((e: React.KeyboardEvent, priceVal: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPrice(priceVal);
      priceAutoRef.current = false;
    }
  }, []);

  const orderbookEmpty = orderbook.bids.length === 0 && orderbook.asks.length === 0;

  const chartPanel = (
    <Card title={`${asset} / USD Chart`} className={styles.fullHeight}>
      <div className={styles.headerStats}>
         <div className={styles.assetSelector}>
            {(['BTC', 'ETH', 'VARA'] as Asset[]).map(a => (
              <button
                key={a}
                className={asset === a ? styles.activeAsset : ''}
                onClick={() => handleAssetChange(a)}
              >
                {a}
              </button>
            ))}
         </div>
         <div className={styles.marketStats}>
            <div className={styles.statItem}>
                <span className={styles.statLabel}>DEX Price</span>
                <span className={styles.statValue}>
                  {lastPrice ? `$${(Number(lastPrice) * 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '---'}
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
        {orderbookEmpty ? (
          <div className={styles.emptyBookWrap}>
            <EmptyState
              title={marketLoading ? 'Loading...' : 'No Orders Yet'}
              description={marketLoading ? '' : 'Place matching Buy & Sell limit orders at the same price to execute a trade.'}
            />
            {!marketLoading && account && portfolio && (
              <div className={styles.seedActions}>
                {oraclePrice > 0 && (
                  <button
                    className={styles.demoBtn}
                    onClick={executeDemoTrade}
                    disabled={demoLoading}
                    title={`Places a self-matched buy+sell of ${asset} at oracle price to demonstrate the trading flow`}
                  >
                    <Zap size={13} />
                    {demoLoading ? 'Executing...' : `Quick Demo Trade`}
                  </button>
                )}
                <button
                  className={styles.seedBtn}
                  onClick={tickMarket}
                  disabled={tickLoading}
                  title="Call Tick() to ask the market maker to seed the orderbook"
                >
                  <RefreshCw size={13} className={tickLoading ? styles.spin : ''} />
                  {tickLoading ? 'Activating...' : 'Activate Market Maker'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {orderbook.asks.slice(0, 10).reverse().map(([p, q], i) => (
              <div key={i} className={`${styles.obRow} ${styles.ask}`}
                style={{ '--depth': maxQty > 0n ? `${(Number(q) / Number(maxQty) * 100).toFixed(1)}%` : '0%' } as React.CSSProperties}
                onClick={() => { setPrice((Number(p) * 1000).toString()); priceAutoRef.current = false; }}
                role="button" tabIndex={0}
                onKeyDown={e => handleObKeyDown(e, (Number(p) * 1000).toString())}
                aria-label={`Ask price ${(Number(p) * 1000).toFixed(2)}, quantity ${(Number(q) / 10 ** 5).toFixed(5)}`}>
                <span>{(Number(p) * 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span>{(Number(q) / 10 ** 5).toFixed(5)}</span>
                <span>{((Number(p) * Number(q)) / 100).toFixed(2)}</span>
              </div>
            ))}
            <div className={styles.spread}>
              <span className={styles.lastPrice}>{lastPrice ? (Number(lastPrice) * 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '---'}</span>
              <span className={styles.spreadLabel}>Last Price</span>
            </div>
            {orderbook.bids.slice(0, 10).map(([p, q], i) => (
              <div key={i} className={`${styles.obRow} ${styles.bid}`}
                style={{ '--depth': maxQty > 0n ? `${(Number(q) / Number(maxQty) * 100).toFixed(1)}%` : '0%' } as React.CSSProperties}
                onClick={() => { setPrice((Number(p) * 1000).toString()); priceAutoRef.current = false; }}
                role="button" tabIndex={0}
                onKeyDown={e => handleObKeyDown(e, (Number(p) * 1000).toString())}
                aria-label={`Bid price ${(Number(p) * 1000).toFixed(2)}, quantity ${(Number(q) / 10 ** 5).toFixed(5)}`}>
                <span>{(Number(p) * 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span>{(Number(q) / 10 ** 5).toFixed(5)}</span>
                <span>{((Number(p) * Number(q)) / 100).toFixed(2)}</span>
              </div>
            ))}
          </>
        )}
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
          <input
            type="number"
            value={price}
            onChange={e => { setPrice(e.target.value); priceAutoRef.current = false; }}
            placeholder="0.00"
          />
          {oraclePrice > 0 && (
            <div className={styles.inputHint} onClick={() => { setPrice(oraclePrice.toFixed(2)); priceAutoRef.current = true; }}>
              Oracle: ${oraclePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
              Bal: {availableBalance.label}
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
        {txState.stage === 'broadcasting' || txState.stage === 'confirming'
          ? 'Processing...'
          : orderType === 'Market'
            ? `Market ${side} ${asset}`
            : `${side} ${asset}`}
      </button>
      {!account && <div className={styles.connectWarn}>Connect wallet to trade</div>}

      {/* ── My Open Orders (inline) ── */}
      {account && myOrders.length > 0 && (
        <div className={styles.myOrders}>
          <div className={styles.myOrdersHeader}>My Open Orders ({myOrders.length})</div>
          {myOrders.slice(0, 6).map((o: any, i: number) => (
            <div key={i} className={styles.myOrderRow}>
              <span className={o[1] === 'Buy' ? styles.buyText : styles.askText}>
                {String(o[1])} {String(o[2])}
              </span>
              <span className={styles.myOrderPrice}>
                ${(Number(o[3]) * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className={styles.myOrderQty}>
                {(Number(o[4]) / 10 ** 5).toFixed(4)}
              </span>
              <button
                className={styles.cancelSmBtn}
                onClick={() => handleCancelOrder(o[0])}
                disabled={cancellingOid === Number(o[0])}
                title="Cancel order"
              >
                {cancellingOid === Number(o[0]) ? '…' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}
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
            description={marketLoading ? 'Fetching trade history...' : 'Trades appear here once orders are matched.'}
          />
        )}
        {tradesList.map((t, i) => (
          <div key={i} className={styles.obRow}>
            <span className={styles.buyText}>{(Number(t.price) * 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span>{(Number(t.qty) / 10 ** 5).toFixed(5)}</span>
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
