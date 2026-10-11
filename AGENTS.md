# Standing instructions for every agent working in this repo (Axis DriveWorks)

Stack: React 19 + Vite (axisdriveworks/), Express 5 + SQLite via `sqlite`/`sqlite3` (axisdriveworks-backend/), ES modules, Node 20+.

## Hard rules
1. Read `MASTER_PROMPT.md` first and follow it phase by phase. After each phase: summarise what changed, run lint + build, then STOP and wait for my "go".
2. Never delete or overwrite anything until I have approved the exact list of files.
3. Never put secrets in frontend code, `render.yaml`, logs or git. Secrets live in `.env` (gitignored). Only edit `.env.example`.
4. Never invent car data. Specs come only from the Perplexity lookup (validated + cached) or from `car_names.json` (names only).
5. Keep the `reservations` table and its data. Do not touch the `.glb` files or the URLs in `ModelRegistry.jsx`.
6. Use parameterised SQL only. Validate all inputs. Handle missing/array/oversized query params.
7. Prefer small, reviewable diffs. Do not reformat unrelated files.
8. If something is ambiguous, or an API behaves differently from what is described here, stop and ask me.
