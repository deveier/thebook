import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'thebookdex_onboarding_done';

export function useOnboarding() {
  const [showWizard, setShowWizard] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      setShowWizard(true);
    }
    setInitialized(true);
  }, []);

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShowWizard(false);
  }, []);

  const dismissWizard = useCallback(() => {
    setShowWizard(false);
  }, []);

  return {
    showWizard: initialized && showWizard,
    completeOnboarding,
    dismissWizard,
  };
}
