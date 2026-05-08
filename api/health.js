module.exports = async function handler(req, res) {
  res.status(200).json({
    ok: true,
    route: "/api/health",
    appVersion: "1.8.9.1",
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    time: new Date().toISOString(),
    build: "campaign-sync-v1.8.9.0"
  });
};
