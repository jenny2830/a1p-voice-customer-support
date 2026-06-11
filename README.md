# a1p-voice-customer-support

Customer support voice agent for A1Potential — a premium dark immersive interface powered by ElevenLabs (Jenny).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Add your ElevenLabs agent ID to `.env.local`:

```
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_agent_id_here
```

3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

Deploy to Vercel and set `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` in your project environment variables.
