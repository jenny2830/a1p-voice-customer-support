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

function initParticles(width: number, height: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    radius: 1 + Math.random(),
  }));
}

function getAmplitudes(
  state: VisualizerState,
  time: number,
  rotation: number,
  frequencyData: Uint8Array | null
): number[] {
  const amps = new Array<number>(BAR_COUNT).fill(0);

  if (state === "speaking" && frequencyData) {
    for (let i = 0; i < BAR_COUNT; i++) {
      const idx = Math.floor((i / BAR_COUNT) * frequencyData.length);
      amps[i] = frequencyData[idx] / 255;
    }
    return amps;
  }

  if (state === "idle") {
    for (let i = 0; i < BAR_COUNT; i++) {
      amps[i] = 0.04 + 0.03 * Math.sin(time * 0.8 + i * 0.15);
    }
    return amps;
  }

  if (state === "listening") {
    for (let i = 0; i < BAR_COUNT; i++) {
      const pulse = Math.sin(time * 5 + i * 0.4);
      const active = pulse > 0.6 ? 1 : 0;
      amps[i] = active * (0.08 + 0.12 * ((Math.sin(time * 3 + i) + 1) / 2));
    }
    return amps;
  }

  if (state === "processing") {
    for (let i = 0; i < BAR_COUNT; i++) {
      const angle = (i / BAR_COUNT) * Math.PI * 2;
      const wave = Math.sin(angle - rotation);
      amps[i] = wave > 0.3 ? 0.03 + 0.02 * Math.sin(time * 0.6) : 0.03;
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

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: VisualizerState,
  time: number,
  rotation: number,
  frequencyData: Uint8Array | null
) {
  const cx = width / 2;
  const cy = height / 2;
  const circleRadius = Math.min(width, height) * 0.28;
  const outerMaxLength = circleRadius * 0.85;
  const innerMaxLength = circleRadius * 0.38;

  ctx.strokeStyle = "rgba(138,100,255,0.08)";
  ctx.lineWidth = 1;
  for (const scale of [0.92, 1.08]) {
    ctx.beginPath();
    ctx.arc(cx, cy, circleRadius * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  const amplitudes = getAmplitudes(state, time, rotation, frequencyData);

  for (let i = 0; i < BAR_COUNT; i++) {
    const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const edgeX = cx + cos * circleRadius;
    const edgeY = cy + sin * circleRadius;

    let amp = amplitudes[i];
    if (state === "listening") {
      amp = amp * 0.35;
    }

    const purpleOpacity = 0.55 + amp * 0.45;
    const cyanOpacity = purpleOpacity * 0.85;

    if (state !== "listening" || amp > 0.05) {
      const outerLen = state === "listening" ? amp * outerMaxLength * 0.15 : amp * outerMaxLength;
      ctx.strokeStyle = `rgba(138,100,255,${purpleOpacity})`;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(edgeX, edgeY);
      ctx.lineTo(edgeX + cos * outerLen, edgeY + sin * outerLen);
      ctx.stroke();
    }

    const innerLen = amp * innerMaxLength;
    ctx.strokeStyle = `rgba(34,211,238,${cyanOpacity})`;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(edgeX, edgeY);
    ctx.lineTo(edgeX - cos * innerLen, edgeY - sin * innerLen);
    ctx.stroke();
  }
}

export default function Visualizer({ state, getFrequencyData }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);
  const rotationRef = useRef(0);
  const rafRef = useRef<number>(0);
  const stateRef = useRef(state);
  const getFrequencyDataRef = useRef(getFrequencyData);

  useEffect(() => {
    stateRef.current = state;
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
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (particlesRef.current.length === 0) {
        particlesRef.current = initParticles(window.innerWidth, window.innerHeight);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const currentState = stateRef.current;

      ctx.clearRect(0, 0, width, height);

      drawParticles(ctx, particlesRef.current, width, height);

      const frequencyData =
        currentState === "speaking" && getFrequencyDataRef.current
          ? getFrequencyDataRef.current()
          : null;

      drawSpectrum(
        ctx,
        width,
        height,
        currentState,
        timeRef.current,
        rotationRef.current,
        frequencyData
      );

      timeRef.current += 0.016;
      if (currentState === "processing") {
        rotationRef.current += 0.02;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
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
