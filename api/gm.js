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

function extractOutputText(responseJson) {
  if (responseJson.output_text) return responseJson.output_text;

  const out = responseJson.output || [];
  const chunks = [];

  for (const item of out) {
    const content = item.content || [];
    for (const c of content) {
      if (typeof c.text === "string") chunks.push(c.text);
      if (typeof c.output_text === "string") chunks.push(c.output_text);
    }
  }

  return chunks.join("\n").trim();
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

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).json({
      error: "Use POST.",
      ok: false
    });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error: "OPENAI_API_KEY is missing in Vercel Environment Variables.",
      ok: false
    });
    return;
  }

  try {
    const { playerMessage = "", chatMode = "in", state = {} } = req.body || {};

    const instructions = `
You are the AI GM for a Star Wars Old Republic tabletop RPG app.

Return ONLY valid JSON. No markdown. No commentary outside JSON.

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

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.2",
        instructions,
        input,
        max_output_tokens: 1400
      })
    });

    const raw = await apiResponse.text();

    if (!apiResponse.ok) {
      res.status(apiResponse.status).json({
        ok: false,
        error: `OpenAI API error ${apiResponse.status}`,
        details: raw.slice(0, 1800)
      });
      return;
    }

    const openaiJson = safeJsonParse(raw) || {};
    const outputText = extractOutputText(openaiJson);
    const structured = safeJsonParse(outputText) || fallbackPayload(outputText);

    res.status(200).json({
      ok: true,
      structured,
      raw: outputText,
      responseId: openaiJson.id || null
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error && error.message ? error.message : "AI GM request failed.",
      details: String(error && error.stack ? error.stack : error)
    });
  }
};
