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
const CIRCLE_Y_RATIO = 0.38;
const BIN_COUNT = 256;

const barPhaseOffsets = Array.from(
  { length: BAR_COUNT },
  () => Math.random() * Math.PI * 2
);

function getCircleRadiusScale(width: number): number {
  if (width < 768) return 0.22;
  if (width < 1024) return 0.25;
  return 0.28;
}

function getCircleCenterY(height: number): number {
  return height * CIRCLE_Y_RATIO;
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

function logBinIndex(barIndex: number, dataLength: number): number {
  const logMin = Math.log(1);
  const logMax = Math.log(dataLength);
  const t = barIndex / (BAR_COUNT - 1);
  const logPos = logMin + (logMax - logMin) * t;
  return Math.min(dataLength - 1, Math.max(0, Math.floor(Math.exp(logPos))));
}

function mapFrequencyToBar(
  frequencyData: Uint8Array,
  barIndex: number,
  scale: number,
  binOffset = 0,
  useRotation = false
): number {
  let idx: number;
  if (useRotation) {
    idx = (Math.floor(barIndex * 3.2) + binOffset) % frequencyData.length;
  } else {
    idx = logBinIndex(barIndex, frequencyData.length);
  }
  return Math.min(1, ((frequencyData[idx] ?? 0) / 255) * scale);
}

function normalizeAmplitudes(amps: number[]): void {
  const max = Math.max(...amps, 0.001);
  const avg = amps.reduce((sum, v) => sum + v, 0) / amps.length;
  const cap = avg * 2.5;
  if (max > cap) {
    for (let i = 0; i < amps.length; i++) {
      if (amps[i] > cap) amps[i] = cap;
    }
  }
}

function getRawAmplitudes(
  state: VisualizerState,
  time: number,
  frequencyData: Uint8Array | null
): number[] {
  const amps = new Array<number>(BAR_COUNT).fill(0);
  const frame = Math.floor(time / 0.016);
  const binOffset = Math.floor((frame * 0.15) % BIN_COUNT);

  if (state === "speaking" && frequencyData) {
    for (let i = 0; i < BAR_COUNT; i++) {
      amps[i] = mapFrequencyToBar(frequencyData, i, 1, binOffset, true);
    }
    normalizeAmplitudes(amps);
    return amps;
  }

  if (state === "listening" && frequencyData) {
    for (let i = 0; i < BAR_COUNT; i++) {
      amps[i] = mapFrequencyToBar(frequencyData, i, 0.6);
    }
    normalizeAmplitudes(amps);
    return amps;
  }

  if (state === "idle") {
    const base = 0.055;
    for (let i = 0; i < BAR_COUNT; i++) {
      amps[i] =
        base +
        0.035 * Math.sin(time * 0.7 + i * 0.157) +
        0.028 * Math.sin(time * 1.1 + i * 0.314 + 1.0) +
        0.022 * Math.sin(time * 1.6 + i * 0.471 + 2.1) +
        0.018 * Math.sin(time * 0.4 + i * 0.628 + 3.2);
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
  time: number
) {
  const phase = barPhaseOffsets[barIndex];
  const outerMod = 0.5 + 0.5 * Math.sin(phase + time * 0.3);
  const innerMod = 0.5 + 0.5 * Math.sin(phase + time * 0.3 + Math.PI);

  const outerAmp = amp * outerMod;
  const innerAmp = amp * innerMod;

  const isLoud = amp > 0.45;
  const outerHex = isLoud ? "#8B5FC0" : "#6B3FA0";
  const innerHex = isLoud ? "#2E5299" : "#1E3A6E";
  const [or, og, ob] = hexToRgb(outerHex);
  const [ir, ig, ib] = hexToRgb(innerHex);

  const outerOpacity = 0.6 + outerAmp * 0.4;
  const innerOpacity = 0.55 + innerAmp * 0.45;
  const barWidth = 2.5;

  const drawStroke = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    r: number,
    g: number,
    b: number,
    opacity: number
  ) => {
    ctx.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
    ctx.lineWidth = barWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const outerLen = outerAmp * outerMaxLength;
  if (outerLen > 0.5) {
    drawStroke(
      edgeX,
      edgeY,
      edgeX + cos * outerLen,
      edgeY + sin * outerLen,
      or,
      og,
      ob,
      outerOpacity
    );
  }

  const innerLen = innerAmp * innerMaxLength;
  if (innerLen > 0.5) {
    drawStroke(
      edgeX,
      edgeY,
      edgeX - cos * innerLen,
      edgeY - sin * innerLen,
      ir,
      ig,
      ib,
      innerOpacity
    );
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
  const cy = getCircleCenterY(height);
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

  for (let i = 0; i < BAR_COUNT; i++) {
    smoothedAmps[i] = smoothedAmps[i] * 0.72 + rawAmps[i] * 0.28;
  }

  for (let i = 0; i < BAR_COUNT; i++) {
    const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const edgeX = cx + cos * circleRadius;
    const edgeY = cy + sin * circleRadius;

    drawBar(
      ctx,
      edgeX,
      edgeY,
      cos,
      sin,
      smoothedAmps[i],
      outerMaxLength,
      innerMaxLength,
      i,
      time
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
