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
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

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

  const setupMicAnalyser = useCallback(async (stream: MediaStream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    inputAnalyserRef.current = analyser;
    micSourceRef.current = source;
    micStreamRef.current = stream;
    inputBufferRef.current = new Uint8Array(
      new ArrayBuffer(analyser.frequencyBinCount)
    ) as Uint8Array<ArrayBuffer>;
  }, []);

  useEffect(() => {
    return () => {
      micSourceRef.current?.disconnect();
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      inputAnalyserRef.current = null;
      inputBufferRef.current = null;
      micStreamRef.current = null;
      micSourceRef.current = null;
    };
  }, []);

  const getFrequencyData = useCallback((): Uint8Array | null => {
    if (agentStatus === "speaking") {
      const sdkData = conversation.getOutputByteFrequencyData?.();
      if (sdkData && sdkData.length > 0) {
        return sdkData;
      }
    }

    if (agentStatus === "listening") {
      const analyser = inputAnalyserRef.current;
      const buffer = inputBufferRef.current;
      if (analyser && buffer) {
        analyser.getByteFrequencyData(buffer);
        return buffer;
      }

      const sdkInput = conversation.getInputByteFrequencyData?.();
      if (sdkInput && sdkInput.length > 0) {
        return sdkInput;
      }
    }

    return null;
  }, [agentStatus, conversation]);

  const startConversation = useCallback(
    async (topic?: string) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await setupMicAnalyser(stream);
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
    [conversation, setupMicAnalyser]
  );

  const endConversation = useCallback(async () => {
    await conversation.endSession();
    setStatus("idle");
    setIsActive(false);
    pendingTopicRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micSourceRef.current?.disconnect();
    micStreamRef.current = null;
    micSourceRef.current = null;
  }, [conversation]);

  const handleTopicClick = (topic: string) => {
    void startConversation(topic);
  };

  return (
    <main className="page">
      <Visualizer state={agentStatus} getFrequencyData={getFrequencyData} />

      <header className="top-header">
        <a href="https://a1potential.com" className="top-bar">
          ← a1potential.com
        </a>
        <h1 className="page-title">SYSTEM SECURE: JENNY</h1>
      </header>

      <p
        className="visualizer-status"
        style={{ color: STATUS_COLORS[status] }}
      >
        {STATUS_LABELS[status]}
      </p>

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
