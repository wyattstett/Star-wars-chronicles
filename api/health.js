module.exports = async function handler(req, res) {
  res.status(200).json({
    ok: true,
    route: "/api/health",
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-5.2",
    time: new Date().toISOString()
  });
};
