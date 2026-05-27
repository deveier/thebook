import { Card } from '../components/ui/Card';
import styles from './TradeView.module.css';
import { useState, useMemo } from 'react';
import { useOrderbook } from '../hooks/useOrderbook';
import { usePortfolio } from '../hooks/usePortfolio';
import { useOracle } from '../hooks/useOracle';
import { useSails } from '../hooks/useSails';
import { web3FromSource } from '@polkadot/extension-dapp';
import { TrendingUp, TrendingDown } from 'lucide-react';

export function TradeView() {
  const [asset, setAsset] = useState<Asset>('BTC');
  const [side, setSide] = useState<Side>('Buy');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');

  const { orderbook, trades, refresh: refreshOb } = useOrderbook(asset);
  const { refresh: refreshPortfolio } = usePortfolio();
  const { priceData: oracleData } = useOracle(asset);
  const { program, account } = useSails();
  const [txLoading, setTxLoading] = useState(false);

  const handlePlaceOrder = async () => {
    if (!program || !account || !price || !qty) return;
    const parsedPrice = parseFloat(price);
    const parsedQty = parseFloat(qty);
    if (isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedQty) || parsedQty <= 0) {
      alert('Invalid price or quantity');
      return;
    }
    setTxLoading(true);
    try {
      const { signer } = await web3FromSource(account.meta.source);
      const p = BigInt(Math.round(parsedPrice * 100));
      const q = BigInt(Math.round(parsedQty * 10**8));

      const transaction = program.orderbook.placeLimit(side, asset, p, q);
      await transaction.withAccount(account.address, { signer }).calculateGas();

      const { response } = await transaction.signAndSend();
      await response();

      alert('Order placed successfully!');
      setPrice('');
      setQty('');
      refreshOb();
      refreshPortfolio();
    } catch (e) {
      console.error('Order placement failed:', e);
      alert('Failed to place order.');
    } finally {
      setTxLoading(false);
    }
  };

  const lastPrice = trades.length > 0 ? trades[0].price : 0n;
  const oraclePriceMicro = oracleData ? BigInt(oracleData.price_usd_micro) : 0n;
  const oraclePriceCents = oraclePriceMicro / 10000n;
  
  const priceDiff = useMemo(() => {
    if (!lastPrice || !oraclePriceCents) return null;
    const diff = Number(lastPrice - oraclePriceCents) / Number(oraclePriceCents) * 100;
    return diff;
  }, [lastPrice, oraclePriceCents]);

  return (
    <div className={styles.grid}>
      <div className={styles.chartArea}>
        <Card title={`${asset} / USD Chart`} className={styles.fullHeight}>
          <div className={styles.headerStats}>
             <div className={styles.assetSelector}>
                {['BTC', 'ETH', 'VARA'].map(a => (
                  <button
                    key={a}
                    className={asset === a ? styles.activeAsset : ''}
                    onClick={() => setAsset(a as Asset)}
                  >
                    {a}
                  </button>
                ))}
             </div>
             <div className={styles.marketStats}>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>DEX Price</span>
                    <span className={styles.statValue}>${lastPrice ? (Number(lastPrice)/100).toFixed(2) : trades.length === 0 ? 'No trades yet' : '---'}</span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>Oracle Price</span>
                    <span className={styles.statValue}>{account ? (oraclePriceMicro ? '$' + (Number(oraclePriceMicro)/1_000_000).toFixed(2) : 'Loading...') : 'Connect wallet'}</span>
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
          <div className={styles.placeholder}>
             Chart Visualization (Coming Soon)
          </div>
        </Card>
      </div>

      <div className={styles.orderbookArea}>
        <Card title="Orderbook" className={styles.fullHeight}>
          <div className={styles.obHeader}>
            <span>Price</span>
            <span>Qty</span>
            <span>Total</span>
          </div>
          <div className={styles.obList}>
            {orderbook.asks.length === 0 && <div className={styles.emptyOb}>No Asks</div>}
            {orderbook.asks.slice(0, 10).reverse().map(([p, q], i) => (
              <div key={i} className={`${styles.obRow} ${styles.ask}`} onClick={() => setPrice((Number(p)/100).toString())}>
                <span>{(Number(p)/100).toFixed(2)}</span>
                <span>{(Number(q)/10**8).toFixed(4)}</span>
                <span>{((Number(p)*Number(q))/10**10).toFixed(2)}</span>
              </div>
            ))}
            <div className={styles.spread}>
              <span className={styles.lastPrice}>{lastPrice ? (Number(lastPrice)/100).toFixed(2) : '---'}</span>
              <span className={styles.spreadLabel}>Last Price</span>
            </div>
            {orderbook.bids.length === 0 && <div className={styles.emptyOb}>No Bids</div>}
            {orderbook.bids.slice(0, 10).map(([p, q], i) => (
              <div key={i} className={`${styles.obRow} ${styles.bid}`} onClick={() => setPrice((Number(p)/100).toString())}>
                <span>{(Number(p)/100).toFixed(2)}</span>
                <span>{(Number(q)/10**8).toFixed(4)}</span>
                <span>{((Number(p)*Number(q))/10**10).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className={styles.entryArea}>
        <Card title="Place Order">
          <div className={styles.sideButtons}>
            <button
              className={`${styles.buyBtn} ${side === 'Buy' ? '' : styles.inactive}`}
              onClick={() => setSide('Buy')}
            >
              Buy
            </button>
            <button
              className={`${styles.sellBtn} ${side === 'Sell' ? '' : styles.inactive}`}
              onClick={() => setSide('Sell')}
            >
              Sell
            </button>
          </div>
          <div className={styles.formGroup}>
            <label>Price (USD)</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
            {oraclePriceMicro > 0n && (
                <div className={styles.inputHint} onClick={() => setPrice((Number(oraclePriceMicro)/1_000_000).toString())}>
                    Oracle: ${(Number(oraclePriceMicro)/1_000_000).toFixed(2)}
                </div>
            )}
          </div>
          <div className={styles.formGroup}>
            <label>Quantity ({asset})</label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0.00" />
          </div>
          <div className={styles.totalInfo}>
            <span>Est. Total:</span>
            <span>${((parseFloat(price || '0') * parseFloat(qty || '0')) || 0).toFixed(2)}</span>
          </div>
          <button
            className={side === 'Buy' ? styles.submitBuy : styles.submitSell}
            onClick={handlePlaceOrder}
            disabled={txLoading || !account}
          >
            {txLoading ? 'Processing...' : `${side} ${asset}`}
          </button>
          {!account && <div className={styles.connectWarn}>Connect wallet to trade</div>}
        </Card>
      </div>

      <div className={styles.tradesArea}>
        <Card title="Recent Trades" className={styles.fullHeight}>
           <div className={styles.obHeader}>
            <span>Price</span>
            <span>Qty</span>
            <span>Time</span>
          </div>
          <div className={styles.obList}>
            {trades.length === 0 && <div className={styles.emptyOb}>No recent trades</div>}
            {trades.map((t, i) => (
              <div key={i} className={styles.obRow}>
                <span className={styles.buyText}>{(Number(t.price)/100).toFixed(2)}</span>
                <span>{(Number(t.qty)/10**8).toFixed(4)}</span>
                <span>{t.time}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
