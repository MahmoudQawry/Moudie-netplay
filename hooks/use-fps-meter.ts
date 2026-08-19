import { useEffect, useState } from "react";

/** Measures rendered UI frames; it intentionally reports no value until a full sample window exists. */
export function useFpsMeter() {
  const [fps, setFps] = useState<number | null>(null);
  useEffect(() => {
    let frame = 0;
    let count = 0;
    let windowStartedAt: number | null = null;
    const tick = (now: number) => {
      if (windowStartedAt === null) windowStartedAt = now;
      count += 1;
      const elapsed = now - windowStartedAt;
      if (elapsed >= 1_000) {
        setFps(Math.min(120, Math.round((count * 1_000) / elapsed)));
        windowStartedAt = now;
        count = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return fps;
}
