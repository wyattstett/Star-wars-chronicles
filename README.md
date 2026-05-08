# Star Wars Chronicles v1.8.9.0 Campaign Sync Bridge

Replace:
- `index.html`
- `api/gm.js`
- `api/health.js`
- `package.json`

Changes:
- Adds Campaign Sync Bridge panel to Campaign Control.
- Adds Copy Campaign State and Apply GM Update JSON workflow.
- Adds local update handling for NPCs, Bonds/Influence, XP, credits, inventory items, quests, and Journal memories.
- Adds missing live AI helper functions used by the AI test harness.
- Updates `/api/gm` to return structured `appUpdates` for auto-syncable campaign changes.
- Keeps Chat Completions compatibility to avoid the previous Responses/JSON mode 400 issue.
