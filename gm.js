import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

function fallbackPayload(text) {
  return {
    narration: text || "The GM considers the next moment.",
    dialogue: [],
    actions: ["Continue forward.", "Look around.", "Ask a question."],
    rollRequests: [],
    questUpdates: [],
    journalMemories: [],
    combatTrigger: null,
    imagePrompt: ""
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({
      error: "OPENAI_API_KEY is missing in Vercel Environment Variables."
    });
    return;
  }

  try {
    const { playerMessage = "", chatMode = "in", state = {} } = req.body || {};

    const instructions = `
You are the AI GM for a Star Wars Old Republic tabletop RPG app.

You must return ONLY valid JSON. No markdown. No commentary outside JSON.

Tone:
- Cinematic Star Wars Old Republic.
- Respect the player's character sheet, location, inventory, quests, and recent story.
- Do not force the player character's thoughts, emotions, or spoken dialogue.
- Keep responses playable and give choices.
- Use dialogue speaker names clearly so the app can attach voices.
- If combat should begin, set combatTrigger with a reason, enemies, and location.
- If a roll is needed, add rollRequests rather than resolving it secretly.
- If the scene would benefit from art, include imagePrompt.

Required JSON shape:
{
  "narration": "white narration text",
  "dialogue": [
    {"speaker": "NPC Name", "text": "spoken line"}
  ],
  "actions": [
    "Option/action the player can take"
  ],
  "rollRequests": [
    {"skill": "Perception", "dc": 15, "reason": "Notice movement in the shadows"}
  ],
  "questUpdates": [],
  "journalMemories": [],
  "combatTrigger": null,
  "imagePrompt": ""
}
`;

    const input = JSON.stringify({
      playerMessage,
      chatMode,
      currentCampaignState: state
    });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      instructions,
      input,
      max_output_tokens: 1400
    });

    const text = response.output_text || "";
    const parsed = safeJsonParse(text) || fallbackPayload(text);

    res.status(200).json({
      structured: parsed,
      raw: text,
      responseId: response.id || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error?.message || "AI GM request failed."
    });
  }
}
