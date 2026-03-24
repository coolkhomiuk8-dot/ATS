/**
 * Singleton tick — один setInterval на весь додаток.
 * Скільки б карток не було — інтервал завжди один.
 */

const listeners = new Set();
let intervalId = null;

function startIfNeeded() {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    listeners.forEach((fn) => fn());
  }, 30_000);
}

function stopIfEmpty() {
  if (listeners.size > 0) return;
  clearInterval(intervalId);
  intervalId = null;
}

import { useEffect, useState } from "react";

export function useTick() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const update = () => setTick((t) => t + 1);
    listeners.add(update);
    startIfNeeded();
    return () => {
      listeners.delete(update);
      stopIfEmpty();
    };
  }, []);
}
