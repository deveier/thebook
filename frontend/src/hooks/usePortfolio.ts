import { useEffect, useState, useCallback } from 'react';
import { useSails } from './useSails';
import { web3FromSource } from '@polkadot/extension-dapp';

export interface Portfolio {
  usd: bigint;
  btc: bigint;
  eth: bigint;
  vara: bigint;
}

export function usePortfolio() {
  const { program, account, isReady } = useSails();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    if (!program || !account) return;

    try {
      /* decodedAddress is hex (0x...) — required by sails-js QueryBuilder */
      const result = await program.orderbook.getPortfolio().withAddress(account.decodedAddress).call();

      if (result && Array.isArray(result)) {
        const usd  = BigInt(result[0]?.toString() || '0');
        const btc  = BigInt(result[1]?.toString() || '0');
        const eth  = BigInt(result[2]?.toString() || '0');
        const vara = BigInt(result[3]?.toString() || '0');
        /* Keep null (→ show Join DEX) if the account hasn't joined yet */
        if (usd === 0n && btc === 0n && eth === 0n && vara === 0n) {
          setPortfolio(null);
        } else {
          setPortfolio({ usd, btc, eth, vara });
        }
      }
    } catch (e) {
      console.error('Failed to fetch portfolio:', e);
    }
  }, [program, account]);

  useEffect(() => {
    if (isReady && account) {
      fetchPortfolio();
    }
  }, [isReady, account, fetchPortfolio]);

  const join = async () => {
    if (!program || !account) return;
    setLoading(true);
    try {
      const { signer } = await web3FromSource(account.meta.source);
      const transaction = program.orderbook.join();
      await transaction.withAccount(account.address, { signer }).calculateGas();
      const { response } = await transaction.signAndSend();
      const result = await response();
      console.log('Joined successfully:', result);
      await fetchPortfolio();
    } catch (e) {
      console.error('Join failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return {
    portfolio,
    join,
    loading,
    refresh: fetchPortfolio,
  };
}
