import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { formatNumber } from '../lib/format';

export function AnimatedNumber({
  value,
  digits = 0,
  suffix = ''
}: {
  value: number;
  digits?: number;
  suffix?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    const start = displayValue;
    const delta = value - start;
    const startedAt = performance.now();
    const duration = 650;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(start + delta * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className="font-mono tabular-nums">
      {formatNumber(displayValue, digits)}
      {suffix}
    </span>
  );
}
