import { useState } from 'react';
import { useAccount } from '@gear-js/react-hooks';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useToast } from './Toast';
import { Wallet, UserPlus, Rocket, ArrowRight, Check, X } from 'lucide-react';
import styles from './OnboardingWizard.module.css';

interface OnboardingWizardProps {
  onComplete: () => void;
  onDismiss: () => void;
  onNavigateToTab: (tab: string) => void;
}

type Step = 'welcome' | 'connect' | 'join' | 'done';

export function OnboardingWizard({ onComplete, onDismiss, onNavigateToTab }: OnboardingWizardProps) {
  const { account } = useAccount();
  const { portfolio, join, loading } = usePortfolio();
  const { success } = useToast();
  const [step, setStep] = useState<Step>('welcome');
  const [joining, setJoining] = useState(false);

  const currentStep = (): Step => {
    if (!account) return step === 'welcome' ? 'welcome' : 'connect';
    if (!portfolio) return 'join';
    return 'done';
  };

  const effectiveStep = currentStep();

  const handleJoin = async () => {
    setJoining(true);
    await join();
    setJoining(false);
    if (portfolio) {
      success('Welcome to thebookdex! You\'re all set.');
    }
  };

  const handleFinish = () => {
    onComplete();
    onNavigateToTab('trade');
  };

  const steps = [
    { key: 'welcome', label: 'Welcome', done: effectiveStep !== 'welcome' },
    { key: 'connect', label: 'Connect Wallet', done: !!account },
    { key: 'join', label: 'Join DEX', done: !!portfolio },
    { key: 'done', label: 'Start Trading', done: false },
  ];

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Welcome to thebookdex">
        <button className={styles.closeBtn} onClick={onDismiss} aria-label="Skip onboarding">
          <X size={20} />
        </button>

        <div className={styles.stepsBar}>
          {steps.map((s, i) => (
            <div key={s.key} className={`${styles.stepDot} ${s.done ? styles.done : ''} ${s.key === effectiveStep ? styles.current : ''}`}>
              <div className={styles.dot}>{s.done ? <Check size={12} /> : i + 1}</div>
              <span className={styles.dotLabel}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className={styles.content}>
          {effectiveStep === 'welcome' && (
            <>
              <div className={styles.iconWrap}>
                <Rocket size={48} className={styles.rocket} />
              </div>
              <h2 className={styles.title}>Welcome to thebookdex</h2>
              <p className={styles.desc}>
                A decentralized exchange on Vara Network with a professional orderbook
                and automated market maker. Trade BTC, ETH, and VARA with confidence.
              </p>
              <button className={styles.primaryBtn} onClick={() => setStep('connect')}>
                Get Started
                <ArrowRight size={18} />
              </button>
            </>
          )}

          {effectiveStep === 'connect' && (
            <>
              <div className={styles.iconWrap}>
                <Wallet size={48} className={styles.iconAccent} />
              </div>
              <h2 className={styles.title}>Connect Your Wallet</h2>
              <p className={styles.desc}>
                You'll need a Polkadot.js or SubWallet browser extension to interact
                with the Vara Network. Click the "Connect Wallet" button in the header
                to get started.
              </p>
              <button className={styles.primaryBtn} onClick={() => setStep('join')}>
                I've Connected
                <ArrowRight size={18} />
              </button>
              <button className={styles.skipBtn} onClick={onDismiss}>
                Skip for now
              </button>
            </>
          )}

          {effectiveStep === 'join' && (
            <>
              <div className={styles.iconWrap}>
                <UserPlus size={48} className={styles.iconAccent} />
              </div>
              <h2 className={styles.title}>Join the DEX</h2>
              <p className={styles.desc}>
                One-time setup to initialize your account on-chain. This is required
                before you can trade, swap, or provide liquidity.
              </p>
              <button
                className={styles.primaryBtn}
                onClick={handleJoin}
                disabled={joining || loading}
              >
                {joining || loading ? 'Joining...' : 'Join DEX Now'}
                {!joining && !loading && <ArrowRight size={18} />}
              </button>
              <button className={styles.skipBtn} onClick={onDismiss}>
                Skip for now
              </button>
            </>
          )}

          {effectiveStep === 'done' && (
            <>
              <div className={styles.iconWrap}>
                <div className={styles.checkCircle}>
                  <Check size={32} />
                </div>
              </div>
              <h2 className={styles.title}>You're All Set!</h2>
              <p className={styles.desc}>
                Your account is ready. Start trading, swapping tokens, or providing
                liquidity to earn fees.
              </p>
              <button className={styles.primaryBtn} onClick={handleFinish}>
                Start Trading
                <ArrowRight size={18} />
              </button>
              <button className={styles.skipBtn} onClick={onDismiss}>
                Explore later
              </button>
            </>
          )}
        </div>

        <p className={styles.footer}>
          {effectiveStep === 'done' ? '' : 'You can close this and come back anytime.'}
        </p>
      </div>
    </div>
  );
}
