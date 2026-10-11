# Where each file goes

Unzip this pack INTO your project root (the folder that contains `axisdriveworks/` and
`axisdriveworks-backend/`). Choose "merge" if asked. Result:

| File in this pack | Final location |
|---|---|
| AGENTS.md, MASTER_PROMPT.md, PLACEMENT.md | project root (agents read AGENTS.md automatically) |
| axisdriveworks-backend/data/car_names.json (+ .csv) | axisdriveworks-backend/data/ |
| axisdriveworks-backend/scripts/seedCarNames.js | axisdriveworks-backend/scripts/ |
| axisdriveworks-backend/lib/perplexitySpecs.js, suggestRoute.js | axisdriveworks-backend/lib/ |
| axisdriveworks-backend/.env.example | copy to `.env`, fill in keys (never commit) |
| axisdriveworks/.env.example | copy to `.env` |
| tools/ | project root (regenerates the names list if you add more CSVs) |
