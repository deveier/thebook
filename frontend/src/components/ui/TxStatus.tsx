import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { TransactionBuilder } from 'sails-js';
import { web3FromSource } from '@polkadot/extension-dapp';
import { Loader2, CheckCircle2, XCircle, ArrowRight, Wallet, SendHorizonal, Clock } from 'lucide-react';
import styles from './TxStatus.module.css';

type TxStage = 'idle' | 'signing' | 'broadcasting' | 'confirming' | 'confirmed' | 'failed';

interface TxStep {
  stage: TxStage;
  label: string;
  icon: ReactNode;
}

const STEPS: TxStep[] = [
  { stage: 'signing', label: 'Signing transaction', icon: <Wallet size={18} /> },
  { stage: 'broadcasting', label: 'Broadcasting to network', icon: <SendHorizonal size={18} /> },
  { stage: 'confirming', label: 'Waiting for confirmation', icon: <Clock size={18} /> },
  { stage: 'confirmed', label: 'Transaction confirmed', icon: <CheckCircle2 size={18} /> },
];

interface TxState {
  visible: boolean;
  stage: TxStage;
  message: string;
  errorMsg: string;
}

interface UseTxStatusReturn {
  txState: TxState;
  executeTx: (
    buildTx: () => TransactionBuilder<unknown>,
    account: { address: string; meta: { source: string } },
    onSuccess?: () => void,
  ) => Promise<boolean>;
  resetTx: () => void;
}

export function useTxStatus(): UseTxStatusReturn {
  const [txState, setTxState] = useState<TxState>({
    visible: false,
    stage: 'idle',
    message: '',
    errorMsg: '',
  });
  const stageRef = useRef<TxStage>('idle');

  const updateStage = useCallback((stage: TxStage, message?: string) => {
    stageRef.current = stage;
    setTxState(prev => ({
      ...prev,
      visible: true,
      stage,
      message: message || STEPS.find(s => s.stage === stage)?.label || '',
      errorMsg: stage === 'failed' ? (message || '') : '',
    }));
  }, []);

  const executeTx = useCallback(async (
    buildTx: () => TransactionBuilder<unknown>,
    account: { address: string; meta: { source: string } },
    onSuccess?: () => void,
  ): Promise<boolean> => {
    try {
      updateStage('signing');
      const { signer } = await web3FromSource(account.meta.source);

      updateStage('broadcasting');
      const transaction = buildTx();
      await transaction.withAccount(account.address, { signer }).calculateGas();

      updateStage('confirming');
      const { response } = await transaction.signAndSend();
      await response();

      updateStage('confirmed', 'Transaction confirmed successfully');
      onSuccess?.();
      return true;
    } catch (e: any) {
      const msg = e?.message || String(e);
      updateStage('failed', msg.length > 100 ? 'Transaction failed' : msg);
      return false;
    }
  }, [updateStage]);

  const resetTx = useCallback(() => {
    stageRef.current = 'idle';
    setTxState({ visible: false, stage: 'idle', message: '', errorMsg: '' });
  }, []);

  return { txState, executeTx, resetTx };
}

export function TxStatusOverlay({ state, onClose }: { state: TxState; onClose: () => void }) {
  if (!state.visible || state.stage === 'idle') return null;

  const confirmed = state.stage === 'confirmed';
  const failed = state.stage === 'failed';
  const activeStepIndex = STEPS.findIndex(s => s.stage === state.stage);

  return (
    <div className={styles.overlay} onClick={failed || confirmed ? onClose : undefined}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        {confirmed && <div className={styles.successIcon}><CheckCircle2 size={48} /></div>}
        {failed && <div className={styles.failIcon}><XCircle size={48} /></div>}
        {!confirmed && !failed && (
          <div className={styles.spinner}><Loader2 size={48} /></div>
        )}

        <h3 className={styles.title}>
          {confirmed ? 'Success!' : failed ? 'Transaction Failed' : 'Processing Transaction'}
        </h3>

        <div className={styles.steps}>
          {STEPS.map((step, i) => {
            const isActive = i === activeStepIndex && !confirmed && !failed;
            const isPast = i < (confirmed ? STEPS.length : activeStepIndex);
            const isPending = i > activeStepIndex || (failed && i === activeStepIndex);
            return (
              <div key={step.stage} className={`${styles.step} ${isActive ? styles.active : ''} ${isPast ? styles.past : ''} ${isPending ? styles.pending : ''}`}>
                <div className={styles.stepIcon}>
                  {isPast ? <CheckCircle2 size={16} /> : (isActive ? <Loader2 size={16} className={styles.pulse} /> : step.icon)}
                </div>
                <span className={styles.stepLabel}>{step.label}</span>
                {i < STEPS.length - 1 && <ArrowRight size={14} className={styles.arrow} />}
              </div>
            );
          })}
        </div>

        {failed && (
          <div className={styles.errorBox}>
            {state.errorMsg || 'An unexpected error occurred. Please try again.'}
          </div>
        )}

        {(confirmed || failed) && (
          <button onClick={onClose} className={styles.closeBtn}>
            {confirmed ? 'Done' : 'Dismiss'}
          </button>
        )}
      </div>
    </div>
  );
}
