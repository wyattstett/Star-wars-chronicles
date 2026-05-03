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
    actions: [],
    rollRequests: [],
    questUpdates: [],
    journalMemories: [],
    npcUpdates: [],
    combatTrigger: null,
    imagePrompt: "",
    gmNotes: {
      confidence: "fallback",
      reason: "The AI response was not valid JSON, so the server wrapped it safely."
    }
  };
}

function compactForPrompt(state) {
  const safe = state || {};
  return {
    appVersion: safe.appVersion,
    ruleset: safe.ruleset,
    campaignTitle: safe.campaignTitle,
    character: safe.character,
    location: safe.location,
    quests: safe.quests || [],
    journal: safe.journal || {},
    party: safe.party || {},
    inventory: safe.inventory || [],
    voices: safe.voices || {},
    recentInCharacter: safe.recentInCharacter || [],
    recentOutOfCharacter: safe.recentOutOfCharacter || [],
    gmSettings: safe.gmSettings || {}
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Use POST." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY is missing in Vercel Environment Variables."
    });
    return;
  }

  try {
    const { playerMessage = "", chatMode = "in", state = {} } = req.body || {};
    const compactState = compactForPrompt(state);

    const systemPrompt = `
You are the AI Game Master for a mobile Star Wars: Old Republic tabletop RPG app.

Return ONLY valid JSON. No markdown. No commentary outside JSON.

If chatMode is "out":
- Do NOT continue the story.
- Answer as an out-of-character tabletop GM/rules/helper.
- Put the direct answer in narration.
- Leave dialogue, actions, questUpdates, journalMemories, npcUpdates, combatTrigger, and imagePrompt empty unless the user explicitly asks for design/planning help.

If chatMode is "in":
- Continue the current scene from the supplied campaign state and recent story.
- Stay locked to the exact active scene. Do not change locations unless the player actually moves.
- If the player asks "what do I see?", "I check my surroundings", "can I roll Perception?", or similar, clearly describe the immediate surroundings first.
- Give obvious visible/audible/sensory details freely without a roll.
- Only request Perception for hidden threats, concealed details, subtle clues, eavesdropping, or reading behavior.
- Do not give menu-style action options by default. Leave actions empty unless the player asks what they can do.
- Do not speak for the player character, decide their thoughts, emotions, dialogue, or next action.
- Do not teleport the player, skip time, grant loot, start combat, or update quests unless justified by the action.

Style:
- Cinematic but grounded Old Republic Star Wars.
- If on Korriban, use specific details: red dust, harsh sun, Sith Academy structures, Imperial sentries, robed initiates, black stone, old Sith statues, dry wind, tomb silhouettes in the distance.
- Be specific. Avoid vague phrases like "wherever they are", "the area", "some people", or "various structures."

Return this exact JSON shape:
{
  "narration": "Scene narration or OOC answer.",
  "dialogue": [
    {"speaker": "NPC Name", "text": "Spoken line only."}
  ],
  "actions": [],
  "rollRequests": [
    {"skill": "Perception", "dc": 15, "reason": "Notice a hidden watcher near the landing pad"}
  ],
  "questUpdates": [],
  "journalMemories": [],
  "npcUpdates": [],
  "combatTrigger": null,
  "imagePrompt": "",
  "gmNotes": {
    "sceneAnchor": "Exact scene/location being used",
    "confidence": "high/medium/low",
    "reason": "Brief reason/context used"
  }
}
`;

    const userPayload = { playerMessage, chatMode, currentCampaignState: compactState };

    const apiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ],
        temperature: 0.7,
        max_tokens: 1200
      })
    });

    const raw = await apiResponse.text();

    if (!apiResponse.ok) {
      res.status(apiResponse.status).json({
        ok: false,
        error: `OpenAI API error ${apiResponse.status}`,
        details: raw.slice(0, 5000),
        hint: "This endpoint uses /v1/chat/completions with no JSON mode. If this fails, the error details should reveal model access, billing/quota, invalid key, or a malformed request."
      });
      return;
    }

    const openaiJson = safeJsonParse(raw) || {};
    const outputText = openaiJson.choices?.[0]?.message?.content || "";
    const structured = safeJsonParse(outputText) || fallbackPayload(outputText);

    if (!Array.isArray(structured.actions)) structured.actions = [];
    if (!Array.isArray(structured.dialogue)) structured.dialogue = [];
    if (!Array.isArray(structured.rollRequests)) structured.rollRequests = [];
    if (!Array.isArray(structured.questUpdates)) structured.questUpdates = [];
    if (!Array.isArray(structured.journalMemories)) structured.journalMemories = [];
    if (!Array.isArray(structured.npcUpdates)) structured.npcUpdates = [];

    res.status(200).json({
      ok: true,
      structured,
      raw: outputText,
      responseId: openaiJson.id || null,
      backend: "chat-completions-compat-v1.8.8.7"
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error && error.message ? error.message : "AI GM request failed.",
      details: String(error && error.stack ? error.stack : error)
    });
  }
};
