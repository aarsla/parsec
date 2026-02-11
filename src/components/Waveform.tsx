import { useEffect, useRef } from "react";

interface Props {
  amplitudes: number[];
}

export default function Waveform({ amplitudes }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barWidth = 3;
    const gap = 2;
    const step = barWidth + gap;
    const maxBars = Math.floor(w / step);

    ctx.clearRect(0, 0, w, h);

    const data = amplitudes.slice(-maxBars);
    const centerY = h / 2;

    data.forEach((amp, i) => {
      const normalized = Math.min(amp * 8, 1);
      const barHeight = Math.max(2, normalized * (h * 0.8));

      ctx.fillStyle = `rgba(59, 130, 246, ${0.5 + normalized * 0.5})`;
      ctx.beginPath();
      ctx.roundRect(
        i * step,
        centerY - barHeight / 2,
        barWidth,
        barHeight,
        1
      );
      ctx.fill();
    });
  }, [amplitudes]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-12"
    />
  );
}
