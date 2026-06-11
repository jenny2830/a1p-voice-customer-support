"use client";

import { useEffect, useRef } from "react";

export type VisualizerState = "idle" | "listening" | "speaking" | "processing";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface VisualizerProps {
  state: VisualizerState;
  getFrequencyData?: () => Uint8Array | null;
}

const BAR_COUNT = 80;
const PARTICLE_COUNT = 60;
const CLUSTER_SIZE = 9;

function getCircleRadiusScale(width: number): number {
  if (width < 768) return 0.22;
  if (width < 1024) return 0.25;
  return 0.28;
}

function initParticles(width: number, height: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    radius: 1 + Math.random(),
  }));
}

function getBarRegion(barIndex: number): "bass" | "mid" | "treble" {
  if (barIndex <= 15 || barIndex >= 65) return "bass";
  if (barIndex <= 39) return "mid";
  return "treble";
}

function getPurpleColor(barIndex: number): string {
  const region = getBarRegion(barIndex);
  if (region === "bass") return "#aa64ff";
  if (region === "treble") return "#64aaff";
  return "#8a64ff";
}

function mapFrequencyToBar(
  frequencyData: Uint8Array,
  barIndex: number,
  scale: number
): number {
  const idx = Math.floor((barIndex / BAR_COUNT) * frequencyData.length);
  let amp = (frequencyData[idx] ?? 0) / 255;

  if (barIndex <= 15 || barIndex >= 65) {
    amp *= 1.35;
  } else if (barIndex >= 16 && barIndex <= 39) {
    amp *= 1.15;
  }

  return Math.min(1, amp * scale);
}

function getRawAmplitudes(
  state: VisualizerState,
  time: number,
  frequencyData: Uint8Array | null
): number[] {
  const amps = new Array<number>(BAR_COUNT).fill(0);

  if (state === "speaking" && frequencyData) {
    for (let i = 0; i < BAR_COUNT; i++) {
      amps[i] = mapFrequencyToBar(frequencyData, i, 1);
    }
    return amps;
  }

  if (state === "listening" && frequencyData) {
    for (let i = 0; i < BAR_COUNT; i++) {
      amps[i] = mapFrequencyToBar(frequencyData, i, 0.6);
    }
    return amps;
  }

  if (state === "idle") {
    for (let i = 0; i < BAR_COUNT; i++) {
      amps[i] =
        0.05 +
        0.04 * Math.sin(time * 0.8 + i * 0.15) +
        0.03 * Math.sin(time * 1.3 + i * 0.25) +
        0.02 * Math.sin(time * 0.5 + i * 0.4);
    }
    return amps;
  }

  if (state === "processing") {
    const clusterPos = (time * 0.3) % BAR_COUNT;
    for (let i = 0; i < BAR_COUNT; i++) {
      const dist = Math.min(
        Math.abs(i - clusterPos),
        BAR_COUNT - Math.abs(i - clusterPos)
      );
      amps[i] = dist < CLUSTER_SIZE / 2 ? 0.6 : 0.03;
    }
    return amps;
  }

  return amps;
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  width: number,
  height: number
) {
  const connectionDist = width * 0.15;

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;

    if (p.x > width) p.x = 0;
    else if (p.x < 0) p.x = width;
    if (p.y > height) p.y = 0;
    else if (p.y < 0) p.y = height;
  }

  ctx.fillStyle = "rgba(138,100,255,0.5)";
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(100,80,200,0.2)";
  ctx.lineWidth = 0.4;
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < connectionDist) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  edgeX: number,
  edgeY: number,
  cos: number,
  sin: number,
  amp: number,
  outerMaxLength: number,
  innerMaxLength: number,
  barIndex: number,
  state: VisualizerState,
  bloom: boolean
) {
  const purpleHex = getPurpleColor(barIndex);
  const [pr, pg, pb] = hexToRgb(purpleHex);

  const isListening = state === "listening";
  const purpleScale = isListening ? 0.4 : 1;
  const cyanScale = isListening ? 1 : 0.55;

  const purpleOpacity = Math.min(1, 0.55 + amp * 0.45) * purpleScale;
  const cyanOpacity = Math.min(1, 0.55 + amp * 0.45) * cyanScale;

  const barWidth = state === "speaking" ? 2.2 + amp * 2.5 : 2.2;
  const outerLen = amp * outerMaxLength * purpleScale;
  const innerLen = amp * innerMaxLength * cyanScale;

  const drawStroke = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: number,
    g: number,
    b: number,
    opacity: number,
    width: number
  ) => {
    ctx.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  if (outerLen > 0.5) {
    drawStroke(
      edgeX,
      edgeY,
      edgeX + cos * outerLen,
      edgeY + sin * outerLen,
      pr,
      pg,
      pb,
      purpleOpacity,
      barWidth
    );

    if (bloom) {
      drawStroke(
        edgeX,
        edgeY,
        edgeX + cos * outerLen,
        edgeY + sin * outerLen,
        pr,
        pg,
        pb,
        purpleOpacity * 0.3,
        barWidth * 3
      );
    }
  }

  if (innerLen > 0.5) {
    drawStroke(
      edgeX,
      edgeY,
      edgeX - cos * innerLen,
      edgeY - sin * innerLen,
      34,
      211,
      238,
      cyanOpacity,
      barWidth
    );

    if (bloom) {
      drawStroke(
        edgeX,
        edgeY,
        edgeX - cos * innerLen,
        edgeY - sin * innerLen,
        34,
        211,
        238,
        cyanOpacity * 0.3,
        barWidth * 3
      );
    }
  }
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: VisualizerState,
  time: number,
  frequencyData: Uint8Array | null,
  smoothedAmps: number[]
) {
  const cx = width / 2;
  const cy = height / 2;
  const circleRadius = Math.min(width, height) * getCircleRadiusScale(width);
  const outerMaxLength = circleRadius * 0.85;
  const innerMaxLength = circleRadius * 0.38;

  const glowGradient = ctx.createRadialGradient(
    cx,
    cy,
    0,
    cx,
    cy,
    circleRadius
  );
  glowGradient.addColorStop(0, "rgba(138,100,255,0.04)");
  glowGradient.addColorStop(1, "transparent");
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
  ctx.fill();

  const ringOpacity = 0.04 + 0.04 * Math.sin(time * 1.5);
  ctx.strokeStyle = `rgba(138,100,255,${ringOpacity})`;
  ctx.lineWidth = 1;
  for (const scale of [0.92, 1.08]) {
    ctx.beginPath();
    ctx.arc(cx, cy, circleRadius * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  const rawAmps = getRawAmplitudes(state, time, frequencyData);
  let overallVolume = 0;

  for (let i = 0; i < BAR_COUNT; i++) {
    smoothedAmps[i] = smoothedAmps[i] * 0.75 + rawAmps[i] * 0.25;
    overallVolume += smoothedAmps[i];
  }

  overallVolume /= BAR_COUNT;
  const bloom = state === "speaking" && overallVolume > 0.25;

  for (let i = 0; i < BAR_COUNT; i++) {
    const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const edgeX = cx + cos * circleRadius;
    const edgeY = cy + sin * circleRadius;
    const amp = smoothedAmps[i];

    drawBar(
      ctx,
      edgeX,
      edgeY,
      cos,
      sin,
      amp,
      outerMaxLength,
      innerMaxLength,
      i,
      state,
      bloom
    );
  }
}

export default function Visualizer({ state, getFrequencyData }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const smoothedAmpsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const timeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const stateRef = useRef(state);
  const getFrequencyDataRef = useRef(getFrequencyData);

  useEffect(() => {
    stateRef.current = state;
    if (state === "idle" || state === "processing") {
      smoothedAmpsRef.current = new Array(BAR_COUNT).fill(0);
    }
  }, [state]);

  useEffect(() => {
    getFrequencyDataRef.current = getFrequencyData;
  }, [getFrequencyData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      const prev = dimensionsRef.current;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dimensionsRef.current = { width, height };

      if (particlesRef.current.length === 0) {
        particlesRef.current = initParticles(width, height);
      } else if (prev.width > 0 && prev.height > 0) {
        const scaleX = width / prev.width;
        const scaleY = height / prev.height;
        for (const p of particlesRef.current) {
          p.x *= scaleX;
          p.y *= scaleY;
        }
      }
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    const draw = () => {
      const { width, height } = dimensionsRef.current;
      if (width === 0 || height === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const currentState = stateRef.current;

      ctx.clearRect(0, 0, width, height);

      drawParticles(ctx, particlesRef.current, width, height);

      const needsFrequency =
        currentState === "speaking" || currentState === "listening";
      const frequencyData =
        needsFrequency && getFrequencyDataRef.current
          ? getFrequencyDataRef.current()
          : null;

      drawSpectrum(
        ctx,
        width,
        height,
        currentState,
        timeRef.current,
        frequencyData,
        smoothedAmpsRef.current
      );

      timeRef.current += 0.016;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
      }}
    />
  );
}
