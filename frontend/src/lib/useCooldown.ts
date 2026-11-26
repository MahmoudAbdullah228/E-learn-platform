import { useCallback, useEffect, useState } from 'react';

export function useCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [secondsLeft]);

  const startCooldown = useCallback((seconds: number | null | undefined) => {
    if (seconds && seconds > 0) {
      setSecondsLeft(Math.ceil(seconds));
    }
  }, []);

  return {
    secondsLeft,
    isCoolingDown: secondsLeft > 0,
    startCooldown,
  };
}
