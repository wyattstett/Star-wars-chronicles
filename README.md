# Star Wars Chronicles AI GM Test Harness v1.8.7.2

Upload these files/folders to your GitHub repo:

- index.html
- package.json
- README.md
- api/gm.js
- api/health.js

Then redeploy on Vercel.

Required Vercel Environment Variable:
- OPENAI_API_KEY = your OpenAI API key

Optional:
- OPENAI_MODEL = gpt-5.2

Test backend:
- /api/health should show ok:true and hasOpenAIKey:true
- /api/gm must be called from the app using POST

This version removes the OpenAI Node SDK import and uses fetch directly to avoid Vercel function import/runtime crashes.
