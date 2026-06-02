import { Card } from '../components/ui/Card';
import styles from './TradeView.module.css';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import { usePositions } from '../hooks/usePositions';
import { useSails } from '../hooks/useSails';
import { TrendingUp, TrendingDown, BarChart3, BookOpen, ListOrdered, ShoppingCart, RefreshCw, Zap, Layers } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { parseContractError } from '../lib/errors';
import { useViewport } from '../hooks/useViewport';
import { useTxStatus, TxStatusOverlay } from '../components/ui/TxStatus';
import { EmptyState } from '../components/ui/EmptyState';
import { useMarketData } from '../providers/MarketDataProvider';
import { TradeChart } from '../components/chart/TradeChart';
import { web3FromSource } from '@polkadot/extension-dapp';

type PanelId = 'chart' | 'depth' | 'executions' | 'entry' | 'positions';

const mobilePanels: { id: PanelId; label: string; icon: React.ElementType }[] = [
  { id: 'chart',      label: 'Chart',      icon: BarChart3 },
  { id: 'depth',      label: 'Depth',      icon: BookOpen },
  { id: 'executions', label: 'Trades',     icon: ListOrdered },
  { id: 'entry',      label: 'Trade',      icon: ShoppingCart },
  { id: 'positions',  label: 'Positions',  icon: Layers },
];

const LEVERAGE_OPTIONS = [1, 2, 5, 10, 25];

function fmt(n: number, decimals = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function TradeView() {
  const [asset, setAsset]         = useState<Asset>('BTC');
  const [orderType, setOrderType] = useState<'Limit' | 'Market'>('Market');
  const [direction, setDirection] = useState<'Long' | 'Short'>('Long');
  const [leverage, setLeverage]   = useState(1);
  const [usdAmount, setUsdAmount] = useState('');
  const [price, setPrice]         = useState('');
  const [mobilePanel, setMobilePanel] = useState<PanelId>('chart');
  const [myOrders, setMyOrders]   = useState<any[]>([]);
  const [cancellingOid, setCancellingOid] = useState<number | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const { isMobile } = useViewport();

  const priceAutoRef = useRef(false);

  const { prices, orderbooks, trades, loading: marketLoading, pricesStalePer, pricesLoading, priceHistory, fetchPrice, refreshAll, tickMarket, tickLoading } = useMarketData();
  const { portfolio, refresh: refreshPortfolio } = usePortfolio();
  const { positions, addPosition, removePosition, unrealizedPnl, liqPrice } = usePositions();
  const { program, account } = useSails();
  const { success, error } = useToast();
  const { txState, executeTx, resetTx } = useTxStatus();

  const orderbook  = orderbooks[asset] || { bids: [], asks: [] };
  const tradesList = trades[asset] || [];
  const oracleData = prices[asset];
  const markPrice  = oracleData ? Number(oracleData.price_usd_micro) / 1_000_000 : 0;
  const change24h  = oracleData ? Number(oracleData.change_24h_bps) / 100 : 0;
  const lastExecPrice = tradesList.length > 0 ? tradesList[0].price : 0n;

  /* ── Auto-fill price from mark price ── */
  useEffect(() => {
    priceAutoRef.current = false;
    if (markPrice > 0) { setPrice(markPrice.toFixed(2)); priceAutoRef.current = true; }
    else setPrice('');
  }, [asset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (markPrice > 0 && !priceAutoRef.current) {
      setPrice(markPrice.toFixed(2)); priceAutoRef.current = true;
    }
  }, [markPrice]);

  /* ── Derived order values ── */
  const entryPrice = useMemo(() => {
    if (orderType === 'Market') return markPrice;
    const p = parseFloat(price);
    return isNaN(p) || p <= 0 ? markPrice : p;
  }, [orderType, price, markPrice]);

  const notional = useMemo(() => {
    const a = parseFloat(usdAmount);
    return isNaN(a) || a <= 0 ? 0 : a * leverage;
  }, [usdAmount, leverage]);

  const assetQty = entryPrice > 0 ? notional / entryPrice : 0;
  const contractQty = BigInt(Math.round(assetQty * 1e5));
  const contractPrice = BigInt(Math.max(1, Math.round(entryPrice / 1000)));

  const estimatedLiqPrice = useMemo(() => {
    if (!entryPrice || !leverage) return 0;
    const m = 0.9 / leverage;
    return direction === 'Long' ? entryPrice * (1 - m) : entryPrice * (1 + m);
  }, [entryPrice, leverage, direction]);

  /* ── My open orders ── */
  const fetchMyOrders = useCallback(async () => {
    if (!program || !account) return;
    try {
      const result = await program.orderbook.getMyOrders().withAddress(account.decodedAddress).call();
      if (result && Array.isArray(result))
        setMyOrders(result.filter((o: any) => o[6] === 'Open' || o[6] === 'Partial'));
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
        error(parseContractError(JSON.stringify((result as any).err)));
      } else {
        success('Order cancelled');
        setMyOrders(prev => prev.filter((o: any) => Number(o[0]) !== Number(oid)));
        refreshPortfolio(); refreshAll();
        setTimeout(() => { refreshPortfolio(); fetchMyOrders(); }, 2000);
      }
    } catch (e: any) { error(parseContractError(e?.message || String(e))); }
    finally { setCancellingOid(null); }
  }, [program, account, cancellingOid, error, success, refreshPortfolio, refreshAll, fetchMyOrders]);

  /* ── Close a position (place reverse order) ── */
  const handleClosePosition = useCallback(async (pos: ReturnType<typeof usePositions>['positions'][0]) => {
    if (!program || !account) return;
    const side = pos.direction === 'Long' ? 'Sell' : 'Buy';
    const q = BigInt(pos.sizeQty);
    const p = BigInt(Math.max(1, Math.round(markPrice / 1000)));
    const err = await executeTx(
      () => program!.orderbook.placeLimit(side as Side, pos.asset as Asset, p, q),
      account,
      () => {
        removePosition(pos.id);
        refreshPortfolio(); refreshAll();
        success(`Position closed`);
        setTimeout(() => { refreshPortfolio(); refreshAll(); }, 2500);
      }
    );
    if (err) error(parseContractError(err));
  }, [program, account, markPrice, executeTx, removePosition, refreshPortfolio, refreshAll, success, error]);

  /* ── Place order ── */
  const handlePlaceOrder = async () => {
    if (!program || !account) return;
    const margin = parseFloat(usdAmount);
    if (isNaN(margin) || margin <= 0) { error('Enter a margin amount'); return; }
    if (assetQty <= 0) { error('Invalid amount'); return; }
    if (orderType === 'Limit') {
      const p = parseFloat(price);
      if (isNaN(p) || p <= 0) { error('Enter a valid entry price'); return; }
    }
    if (pricesStalePer[asset] && !pricesLoading) await fetchPrice(asset);

    const side: Side = direction === 'Long' ? 'Buy' : 'Sell';
    const err = await executeTx(
      () => orderType === 'Market'
        ? (side === 'Buy'
            ? program!.orderbook.marketBuy(asset, contractQty)
            : program!.orderbook.marketSell(asset, contractQty))
        : program!.orderbook.placeLimit(side, asset, contractPrice, contractQty),
      account,
      () => {
        addPosition({
          id: `${Date.now()}-${asset}`,
          asset,
          direction,
          entryPrice,
          sizeQty: Number(contractQty),
          leverage,
          margin,
          openedAt: new Date().toLocaleTimeString(),
        });
        setUsdAmount('');
        refreshPortfolio(); refreshAll(); fetchMyOrders();
        success(`${direction} opened · ${fmt(assetQty, 5)} ${asset} @ $${fmt(entryPrice)}`);
        setTimeout(() => { refreshPortfolio(); refreshAll(); fetchMyOrders(); }, 2500);
      }
    );
    if (err) {
      const msg = parseContractError(err);
      error(err.includes('NoLiquidity') || err.includes('NoBuyers')
        ? `${msg} Use Limit order or Quick Demo to seed the book.`
        : msg);
    }
  };

  /* ── Quick Demo Trade ── */
  const executeDemoTrade = useCallback(async () => {
    if (!program || !account || !markPrice || demoLoading) return;
    setDemoLoading(true);
    try {
      const { signer } = await web3FromSource(account.meta.source);
      const demoAmt = asset === 'BTC' ? 0.001 : asset === 'ETH' ? 0.01 : 100;
      const q = BigInt(Math.round(demoAmt * 1e5));
      const p = BigInt(Math.max(1, Math.round(markPrice / 1000)));

      const st = program.orderbook.placeLimit('Sell', asset, p, q);
      await st.withAccount(account.address, { signer }).calculateGas();
      const { response: sr } = await st.signAndSend();
      const sResult = await sr();
      if (sResult && typeof sResult === 'object' && 'err' in sResult) throw new Error(JSON.stringify((sResult as any).err));

      const bt = program.orderbook.placeLimit('Buy', asset, p, q);
      await bt.withAccount(account.address, { signer }).calculateGas();
      const { response: br } = await bt.signAndSend();
      const bResult = await br();
      if (bResult && typeof bResult === 'object' && 'err' in bResult) throw new Error(JSON.stringify((bResult as any).err));

      success(`Demo execution: ${demoAmt} ${asset} @ $${fmt(markPrice)}`);
      refreshPortfolio(); refreshAll(); fetchMyOrders();
    } catch (e: any) { error(`Demo failed: ${parseContractError(e?.message || String(e))}`); }
    finally { setDemoLoading(false); }
  }, [program, account, markPrice, asset, demoLoading, success, error, refreshPortfolio, refreshAll, fetchMyOrders]);

  const maxQty = useMemo(() => {
    let m = 0n;
    for (const [, q] of [...orderbook.asks, ...orderbook.bids]) {
      const n = typeof q === 'bigint' ? q : BigInt(String(q));
      if (n > m) m = n;
    }
    return m;
  }, [orderbook]);

  const orderbookEmpty = orderbook.bids.length === 0 && orderbook.asks.length === 0;

  const fmtMark = (v: number) => v > 0 ? `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---';

  /* ────────────────── PANELS ────────────────── */

  const chartPanel = (
    <Card title={`${asset}-PERP`} className={styles.fullHeight}>
      <div className={styles.headerStats}>
        <div className={styles.assetSelector}>
          {(['BTC', 'ETH', 'VARA'] as Asset[]).map(a => (
            <button key={a} className={asset === a ? styles.activeAsset : ''} onClick={() => setAsset(a)}>{a}-PERP</button>
          ))}
        </div>
        <div className={styles.marketStats}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Mark Price</span>
            <span className={`${styles.statValue} ${change24h >= 0 ? styles.positive : styles.negative}`}>
              {fmtMark(markPrice)}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>24h Change</span>
            <span className={`${styles.statValue} ${change24h >= 0 ? styles.positive : styles.negative}`}>
              {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Funding Rate</span>
            <span className={`${styles.statValue} ${styles.positive}`}>+0.0100%</span>
          </div>
          {lastExecPrice > 0n && (
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Last Fill</span>
              <span className={styles.statValue}>${fmt(Number(lastExecPrice) * 1000)}</span>
            </div>
          )}
          <button className={styles.stalePriceBtn} onClick={() => fetchPrice(asset)} disabled={pricesLoading}
            title="Refresh mark price">
            <RefreshCw size={12} className={pricesLoading ? styles.spin : ''} />
          </button>
        </div>
      </div>
      <TradeChart trades={tradesList} oraclePrice={markPrice} priceHistory={priceHistory}
        bids={orderbook.bids} asks={orderbook.asks} asset={asset} />
    </Card>
  );

  const depthPanel = (
    <Card title="Order Depth" className={styles.fullHeight}>
      <div className={styles.obHeader}><span>Price</span><span>Size</span><span>Total</span></div>
      <div className={styles.obList}>
        {orderbookEmpty ? (
          <div className={styles.emptyBookWrap}>
            <EmptyState title={marketLoading ? 'Loading...' : 'Empty Book'}
              description={marketLoading ? '' : 'Place limit orders to seed the depth.'} />
            {!marketLoading && account && portfolio && (
              <div className={styles.seedActions}>
                {markPrice > 0 && (
                  <button className={styles.demoBtn} onClick={executeDemoTrade} disabled={demoLoading}>
                    <Zap size={13} />{demoLoading ? 'Executing...' : 'Quick Demo Execution'}
                  </button>
                )}
                <button className={styles.seedBtn} onClick={tickMarket} disabled={tickLoading}>
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
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPrice((Number(p)*1000).toString()); priceAutoRef.current = false; } }}>
                <span>{(Number(p)*1000).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
                <span>{(Number(q)/1e5).toFixed(5)}</span>
                <span>{((Number(p)*Number(q))/100).toFixed(2)}</span>
              </div>
            ))}
            <div className={styles.spread}>
              <span className={styles.lastPrice}>{lastExecPrice ? (Number(lastExecPrice)*1000).toLocaleString(undefined,{maximumFractionDigits:2}) : '---'}</span>
              <span className={styles.spreadLabel}>Last Fill</span>
            </div>
            {orderbook.bids.slice(0, 10).map(([p, q], i) => (
              <div key={i} className={`${styles.obRow} ${styles.bid}`}
                style={{ '--depth': maxQty > 0n ? `${(Number(q) / Number(maxQty) * 100).toFixed(1)}%` : '0%' } as React.CSSProperties}
                onClick={() => { setPrice((Number(p)*1000).toString()); priceAutoRef.current = false; }}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPrice((Number(p)*1000).toString()); priceAutoRef.current = false; } }}>
                <span>{(Number(p)*1000).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
                <span>{(Number(q)/1e5).toFixed(5)}</span>
                <span>{((Number(p)*Number(q))/100).toFixed(2)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </Card>
  );

  /* ── Entry Panel ── */
  const maxMargin = portfolio ? Number(portfolio.usd) / 100 : 0;

  const entryPanel = (
    <Card title="Open Position">
      {/* Direction */}
      <div className={styles.directionBtns}>
        <button className={`${styles.longBtn} ${direction === 'Long' ? '' : styles.inactive}`}
          onClick={() => setDirection('Long')}>
          <TrendingUp size={15} /> Long
        </button>
        <button className={`${styles.shortBtn} ${direction === 'Short' ? '' : styles.inactive}`}
          onClick={() => setDirection('Short')}>
          <TrendingDown size={15} /> Short
        </button>
      </div>

      {/* Order type */}
      <div className={styles.orderTypeTabs}>
        <button className={orderType === 'Market' ? styles.activeType : ''} onClick={() => setOrderType('Market')}>Market</button>
        <button className={orderType === 'Limit' ? styles.activeType : ''} onClick={() => setOrderType('Limit')}>Limit</button>
      </div>

      {/* Leverage */}
      <div className={styles.leverageRow}>
        <span className={styles.leverageLabel}>Leverage</span>
        <div className={styles.leverageBtns}>
          {LEVERAGE_OPTIONS.map(lev => (
            <button key={lev} className={`${styles.leverageBtn} ${leverage === lev ? styles.leverageActive : ''}`}
              onClick={() => setLeverage(lev)}>{lev}x</button>
          ))}
        </div>
      </div>

      {/* Limit price */}
      {orderType === 'Limit' && (
        <div className={styles.formGroup}>
          <label>Entry Price (USD)</label>
          <input type="number" value={price}
            onChange={e => { setPrice(e.target.value); priceAutoRef.current = false; }} placeholder="0.00" />
          {markPrice > 0 && (
            <div className={styles.inputHint}
              onClick={() => { setPrice(markPrice.toFixed(2)); priceAutoRef.current = true; }}>
              Mark: {fmtMark(markPrice)}
            </div>
          )}
        </div>
      )}

      {/* Margin amount */}
      <div className={styles.formGroup}>
        <label>Margin (USD)</label>
        <input type="number" value={usdAmount} onChange={e => setUsdAmount(e.target.value)} placeholder="100" />
        {account && portfolio && maxMargin > 0 && (
          <div className={styles.balanceTag} onClick={() => setUsdAmount(maxMargin.toFixed(2))}>
            Available: ${fmt(maxMargin)}
          </div>
        )}
        {account && portfolio && maxMargin > 0 && (
          <div className={styles.presets}>
            {[25, 50, 75, 100].map(pct => (
              <button key={pct} className={styles.presetBtn}
                onClick={() => setUsdAmount(((maxMargin * pct) / 100).toFixed(2))}>{pct}%</button>
            ))}
          </div>
        )}
      </div>

      {/* Position preview */}
      {notional > 0 && entryPrice > 0 && (
        <div className={styles.positionPreview}>
          <div className={styles.previewRow}>
            <span>Notional</span>
            <span>${fmt(notional)}</span>
          </div>
          <div className={styles.previewRow}>
            <span>Size</span>
            <span>{fmt(assetQty, 5)} {asset}</span>
          </div>
          <div className={styles.previewRow}>
            <span>Mark Price</span>
            <span>{fmtMark(markPrice)}</span>
          </div>
          <div className={styles.previewRow}>
            <span>Liq. Price</span>
            <span className={styles.negative}>{fmtMark(estimatedLiqPrice)}</span>
          </div>
          <div className={styles.previewRow}>
            <span>Required Margin</span>
            <span>${fmt(parseFloat(usdAmount) || 0)}</span>
          </div>
        </div>
      )}

      <button
        className={direction === 'Long' ? styles.submitLong : styles.submitShort}
        onClick={handlePlaceOrder}
        disabled={txState.visible && txState.stage !== 'failed' && txState.stage !== 'confirmed'}
      >
        {txState.stage === 'broadcasting' || txState.stage === 'confirming'
          ? 'Processing...'
          : `Open ${direction} ${leverage > 1 ? `${leverage}x ` : ''}${asset}`}
      </button>
      {!account && <div className={styles.connectWarn}>Connect wallet to trade</div>}

      {/* My open orders */}
      {account && myOrders.length > 0 && (
        <div className={styles.myOrders}>
          <div className={styles.myOrdersHeader}>Pending Orders ({myOrders.length})</div>
          {myOrders.slice(0, 5).map((o: any, i: number) => (
            <div key={i} className={styles.myOrderRow}>
              <span className={o[1] === 'Buy' ? styles.buyText : styles.askText}>{String(o[1])} {String(o[2])}</span>
              <span className={styles.myOrderPrice}>${(Number(o[3])*1000).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
              <span className={styles.myOrderQty}>{(Number(o[4])/1e5).toFixed(4)}</span>
              <button className={styles.cancelSmBtn} onClick={() => handleCancelOrder(o[0])}
                disabled={cancellingOid === Number(o[0])}>
                {cancellingOid === Number(o[0]) ? '…' : '✕'}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  /* ── Positions Panel ── */
  const positionsPanel = (
    <Card title="My Positions" className={styles.fullHeight}>
      {positions.length === 0 ? (
        <EmptyState title="No Open Positions" description="Open a Long or Short to see it here." />
      ) : (
        <div className={styles.positionsList}>
          {positions.map(pos => {
            const pnl = unrealizedPnl(pos, markPrice);
            const liq = liqPrice(pos);
            const pnlPct = pos.margin > 0 ? (pnl / pos.margin) * 100 : 0;
            return (
              <div key={pos.id} className={styles.positionCard}>
                <div className={styles.positionHeader}>
                  <span className={pos.direction === 'Long' ? styles.longTag : styles.shortTag}>
                    {pos.direction === 'Long' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {pos.asset} {pos.direction} {pos.leverage > 1 ? `${pos.leverage}x` : ''}
                  </span>
                  <button className={styles.closePositionBtn}
                    onClick={() => handleClosePosition(pos)}
                    disabled={txState.visible && txState.stage !== 'failed' && txState.stage !== 'confirmed'}>
                    Close
                  </button>
                </div>
                <div className={styles.positionGrid}>
                  <div><span className={styles.posLabel}>Entry</span><span>${fmt(pos.entryPrice)}</span></div>
                  <div><span className={styles.posLabel}>Mark</span><span>{fmtMark(markPrice)}</span></div>
                  <div><span className={styles.posLabel}>Liq.</span><span className={styles.negative}>${fmt(liq)}</span></div>
                  <div><span className={styles.posLabel}>Size</span><span>{(pos.sizeQty/1e5).toFixed(4)} {pos.asset}</span></div>
                  <div><span className={styles.posLabel}>PnL</span>
                    <span className={pnl >= 0 ? styles.positive : styles.negative}>
                      {pnl >= 0 ? '+' : ''}${fmt(Math.abs(pnl))} ({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                    </span>
                  </div>
                  <div><span className={styles.posLabel}>Since</span><span>{pos.openedAt}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );

  const executionsPanel = (
    <Card title="Executions" className={styles.fullHeight}>
      <div className={styles.obHeader}><span>Price</span><span>Size</span><span>Time</span></div>
      <div className={styles.obList}>
        {tradesList.length === 0 && (
          <EmptyState title={marketLoading ? 'Loading...' : 'No Executions'}
            description={marketLoading ? '' : 'Filled orders appear here.'} />
        )}
        {tradesList.map((t, i) => (
          <div key={i} className={styles.obRow}>
            <span className={styles.buyText}>{(Number(t.price)*1000).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
            <span>{(Number(t.qty)/1e5).toFixed(5)}</span>
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
            const hasBadge = p.id === 'positions' && positions.length > 0;
            return (
              <button key={p.id}
                className={`${styles.mobileTab} ${mobilePanel === p.id ? styles.mobileTabActive : ''}`}
                onClick={() => setMobilePanel(p.id)}>
                <Icon size={16} />
                <span>{p.label}</span>
                {hasBadge && <span className={styles.badge}>{positions.length}</span>}
              </button>
            );
          })}
        </div>
        <div className={`${styles.mobilePanel} ${mobilePanel !== 'entry' && mobilePanel !== 'positions' ? styles.mobilePanelFill : ''}`}>
          {mobilePanel === 'chart'      && chartPanel}
          {mobilePanel === 'depth'      && depthPanel}
          {mobilePanel === 'executions' && executionsPanel}
          {mobilePanel === 'entry'      && entryPanel}
          {mobilePanel === 'positions'  && positionsPanel}
        </div>
        <TxStatusOverlay state={txState} onClose={resetTx} />
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      <div className={styles.chartArea}>{chartPanel}</div>
      <div className={styles.orderbookArea}>{depthPanel}</div>
      <div className={styles.entryArea}>{entryPanel}</div>
      <div className={styles.tradesArea}>{executionsPanel}</div>
      <div className={styles.positionsArea}>{positionsPanel}</div>
      <TxStatusOverlay state={txState} onClose={resetTx} />
    </div>
  );
}
