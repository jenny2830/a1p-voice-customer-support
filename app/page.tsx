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
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#080610",
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      <Visualizer state={agentStatus} getFrequencyData={getFrequencyData} />

      <a
        href="https://a1potential.com"
        style={{
          position: "absolute",
          top: 20,
          left: 24,
          fontSize: 11,
          color: "rgba(255,255,255,0.25)",
          textDecoration: "none",
          letterSpacing: "1px",
          zIndex: 10,
        }}
      >
        ← a1potential.com
      </a>

      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            marginTop: "calc(28vmin + 24px)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <p
            style={{
              fontSize: 11,
              letterSpacing: "4px",
              color: "rgba(255,255,255,0.45)",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            SYSTEM SECURE: JENNY
          </p>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "2px",
              color: STATUS_COLORS[status],
              marginTop: 8,
            }}
          >
            {STATUS_LABELS[status]}
          </p>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          {TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => handleTopicClick(topic)}
              style={{
                border: "1px solid rgba(138,100,255,0.3)",
                background: "rgba(138,100,255,0.08)",
                color: "#c4b8ff",
                fontSize: 12,
                borderRadius: 40,
                padding: "8px 18px",
                cursor: "pointer",
              }}
            >
              {topic}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void startConversation()}
            style={{
              background: "rgba(138,100,255,0.9)",
              color: "white",
              border: "none",
              borderRadius: 40,
              padding: "13px 36px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Start conversation
          </button>

          {isActive && (
            <button
              type="button"
              onClick={() => void endConversation()}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,0,100,0.4)",
                color: "rgba(255,100,130,0.8)",
                borderRadius: 40,
                padding: "13px 36px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              End call
            </button>
          )}
        </div>

        <p
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.2)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          For billing issues email support@a1potential.com
        </p>
      </div>
    </main>
  );
}
