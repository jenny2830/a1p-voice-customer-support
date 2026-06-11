"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import Visualizer from "@/components/Visualizer";

type AgentStatus = "idle" | "listening" | "speaking" | "processing";

const TOPICS = [
  "Pricing & plans",
  "Assessments",
  "Login help",
  "AI coaches",
] as const;

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: "Ready",
  listening: "Listening...",
  speaking: "Speaking",
  processing: "Thinking...",
};

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "rgba(255,255,255,0.4)",
  listening: "#22d3ee",
  speaking: "#8a64ff",
  processing: "rgba(255,255,255,0.4)",
};

function mapConversationToStatus(
  connectionStatus: string,
  isSpeaking: boolean
): AgentStatus {
  if (connectionStatus === "connecting") return "processing";
  if (connectionStatus === "connected")
    return isSpeaking ? "speaking" : "listening";
  return "idle";
}

export default function Home() {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [isActive, setIsActive] = useState(false);
  const pendingTopicRef = useRef<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frequencyBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const conversation = useConversation({
    onConnect: () => setStatus("listening"),
    onDisconnect: () => {
      setStatus("idle");
      setIsActive(false);
    },
    onMessage: () => {},
    onError: (error) => console.error(error),
  });

  const agentStatus = useMemo(
    () => mapConversationToStatus(conversation.status, conversation.isSpeaking),
    [conversation.status, conversation.isSpeaking]
  );

  useEffect(() => {
    if (conversation.status === "connected") {
      setIsActive(true);
    }
    if (conversation.status === "disconnected") {
      setIsActive(false);
    }
  }, [conversation.status]);

  useEffect(() => {
    setStatus(agentStatus);
  }, [agentStatus]);

  useEffect(() => {
    if (agentStatus === "speaking") {
      if (!audioContextRef.current) {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        frequencyBufferRef.current = new Uint8Array(
          new ArrayBuffer(analyser.frequencyBinCount)
        ) as Uint8Array<ArrayBuffer>;
      }

      if (audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume();
      }
    }
  }, [agentStatus]);

  useEffect(() => {
    return () => {
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      analyserRef.current = null;
      frequencyBufferRef.current = null;
    };
  }, []);

  const getFrequencyData = useCallback((): Uint8Array | null => {
    const sdkData = conversation.getOutputByteFrequencyData?.();
    if (sdkData && sdkData.length > 0) {
      return sdkData;
    }

    const analyser = analyserRef.current;
    const buffer = frequencyBufferRef.current;
    if (analyser && buffer) {
      analyser.getByteFrequencyData(buffer);
      return buffer;
    }

    return null;
  }, [conversation]);

  const startConversation = useCallback(
    async (topic?: string) => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsActive(true);
        if (topic) {
          pendingTopicRef.current = topic;
        }
        await conversation.startSession({
          agentId: process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID,
        });
        if (pendingTopicRef.current) {
          conversation.sendContextualUpdate(
            `The user wants help with: ${pendingTopicRef.current}`
          );
          pendingTopicRef.current = null;
        }
      } catch (error) {
        console.error(error);
        setStatus("idle");
        setIsActive(false);
      }
    },
    [conversation]
  );

  const endConversation = useCallback(async () => {
    await conversation.endSession();
    setStatus("idle");
    setIsActive(false);
    pendingTopicRef.current = null;
  }, [conversation]);

  const handleTopicClick = (topic: string) => {
    void startConversation(topic);
  };

  return (
    <main className="page">
      <Visualizer state={agentStatus} getFrequencyData={getFrequencyData} />

      <a href="https://a1potential.com" className="top-bar">
        ← a1potential.com
      </a>

      <div className="center-zone">
        <div className="status-block">
          <p className="status-title">SYSTEM SECURE: JENNY</p>
          <p className="status-pill" style={{ color: STATUS_COLORS[status] }}>
            {STATUS_LABELS[status]}
          </p>
        </div>
      </div>

      <div className="bottom-zone">
        <div className="topic-pills">
          {TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              className="topic-pill"
              onClick={() => handleTopicClick(topic)}
            >
              {topic}
            </button>
          ))}
        </div>

        <div className="action-buttons">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void startConversation()}
          >
            Start conversation
          </button>

          {isActive && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void endConversation()}
            >
              End call
            </button>
          )}
        </div>

        <p className="billing-email">
          For billing issues email support@a1potential.com
        </p>
      </div>
    </main>
  );
}
