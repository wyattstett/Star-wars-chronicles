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
    res.status(405).json({ error: "Use POST.", ok: false });
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
    const compactState = compactForPrompt(state);

    const instructions = `
You are the AI Game Master for a mobile Star Wars: Old Republic tabletop RPG app.

You must return ONLY valid JSON. No markdown. No commentary outside JSON.

PRIMARY JOB:
Continue the current scene using the supplied campaign state. Stay grounded in the exact current location, recent events, known NPCs, current quests, inventory, and character sheet.

ABSOLUTE GROUNDING RULES:
- Do NOT invent a new location unless the player actually travels there or the story explicitly moves there.
- If the state says the character is on Korriban, keep descriptions specific to Korriban: red dust, harsh sun, Sith architecture, tombs, academy structures, dry canyons, ancient stone, Imperial/Sith presence.
- If the current area is unknown, infer gently from recent story, but do not hard-cut to a random corridor, cave, ship, city, or battlefield.
- Never use vague filler like "wherever they are", "some area", "some people", or "a place nearby." Be specific, but do not contradict state.
- Do not teleport the player, skip time, start combat, give loot, change quests, or alter inventory unless the player action and scene justify it.
- Do not force the player character's inner thoughts, emotions, speech, decisions, or actions. You may describe sensory impressions and consequences.
- Do not say the player "feels afraid", "decides", "realizes", "knows", or "wants" unless a roll or established fact supports it.
- Address the player in second person when narrating.
- Keep the scene interactive. End most responses with 2-4 useful action options unless combat or a roll prompt is more appropriate.

STYLE:
- Cinematic, grounded, vivid Old Republic Star Wars.
- Strong sensory details, but not bloated.
- Use specific Sith/Imperial/Republic/planetary details when appropriate.
- Dialogue should sound like the speaker and should be easy for the app to detect.
- If an NPC speaks, put that line in the dialogue array with speaker and text.
- If no NPC is present or no one should speak, leave dialogue empty.
- Player actions/options should be short, direct, and useful.

RULES AND ROLLS:
- Ask for rolls only when there is uncertainty, risk, hidden information, or meaningful consequence.
- For passive observation, do not always require a roll. Give obvious details freely.
- If the player tries to notice hidden danger or read people, request a roll with a clear DC and reason.
- Use Star Wars/Saga-style skill names when possible: Perception, Initiative, Deception, Persuasion, Use the Force, Mechanics, Knowledge, Stealth, Acrobatics, Pilot, Treat Injury, Survival.
- Never resolve a requested roll yourself. Add it to rollRequests.

COMBAT:
- Only set combatTrigger if combat is clearly imminent.
- If combatTrigger is set, include:
  {
    "title": "Combat title",
    "reason": "Why combat starts",
    "location": "Specific battle location",
    "enemies": [{"name":"Enemy Name","count":1,"role":"minion/elite/boss"}],
    "mapPrompt": "Top-down battle map prompt grounded in the exact scene"
  }
- Do not start combat for simple exploration unless there is an active threat.

QUESTS, JOURNAL, NPCS:
- questUpdates, journalMemories, and npcUpdates are suggestions only. The app/user will approve them later.
- journalMemories should record meaningful story consequences, not every minor action.
- npcUpdates should only add or update named NPCs the player has actually met or heard named.

IMAGE PROMPTS:
- imagePrompt should be included when the current scene would benefit from art.
- Image prompts must be specific, grounded in the current scene, and should not contradict the story.
- For normal scene art, use cinematic horizontal framing.
- For combat map prompts, use top-down tactical map language in combatTrigger.mapPrompt instead.

VOICE SUPPORT:
- The app uses speaker names to match generated voice profiles.
- Keep speaker names consistent with known NPC profile names.
- If you invent a new NPC speaker, give them a clear name only if the player would plausibly learn it now. Otherwise use a role title like "Sith Overseer" or "Port Official."

RESPONSE FORMAT:
Return this exact JSON shape:
{
  "narration": "White narration text. Grounded in current scene.",
  "dialogue": [
    {"speaker": "NPC or Character Name", "text": "Spoken line only."}
  ],
  "actions": [
    "Short player option",
    "Short player option",
    "Short player option"
  ],
  "rollRequests": [
    {"skill": "Perception", "dc": 15, "reason": "Notice a hidden watcher near the landing pad"}
  ],
  "questUpdates": [
    {"questTitle": "Quest name", "change": "Suggested update", "status": "active/completed/failed/unchanged"}
  ],
  "journalMemories": [
    {"type": "story", "text": "Meaningful consequence or memory"}
  ],
  "npcUpdates": [
    {"name": "NPC Name", "role": "Short role", "firstImpression": "What the player knows"}
  ],
  "combatTrigger": null,
  "imagePrompt": "Optional scene image prompt",
  "gmNotes": {
    "confidence": "high/medium/low",
    "reason": "Brief explanation of what state/context this response used."
  }
}

Keep JSON valid. Escape quotes correctly. No trailing commas.
`;

    const input = JSON.stringify({
      playerMessage,
      chatMode,
      currentCampaignState: compactState
    });

    const requestBody = {
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      instructions,
      input,
      max_output_tokens: 1800
    };

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
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
