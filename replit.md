# Picture Flashcards

A local-first educational PWA for building a shared picture flashcard catalogue and practising it with a child.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/picture-flashcards run dev` — run the PWA frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `FLASHCARDS_DATA_DIR` — optional path for the server's `cards.json` and `images/` folder; defaults to `./data`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Persistence: server-side JSON catalogue plus processed JPEG files
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/picture-flashcards` — responsive PWA with `/` playback and `/admin` catalogue management
- `artifacts/api-server/src/lib/card-store.ts` — JSON/file persistence and image conversion
- `artifacts/api-server/src/routes/cards.ts` — flashcard API and image serving
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `artifacts/picture-flashcards/public/manifest.webmanifest` and `service-worker.js` — installable PWA shell

## Architecture decisions

- Cards are shared across devices by storing metadata in `cards.json` and images in a sibling `images/` directory on the server.
- Uploads arrive as base64 data URLs so the browser can submit ordinary image files and HEIC files through one simple JSON endpoint.
- HEIC images are converted to JPEG on the server with `heic-convert`; JPEG output keeps playback compatible with tablets and browsers.
- The admin route is intentionally separate from the child playback route, with a subtle adult-access control in playback.

## Product

- Adults can add, edit, crop, categorise, and delete picture cards.
- Children can practise a random card set with title, category filtering, next-card controls, and timed playback.
- The app includes an installable service-worker shell while leaving catalogue requests network-backed for fresh shared data.

## User preferences

- The primary runtime is a locally hosted Raspberry Pi, not a cloud database.

## Gotchas

- The frontend expects the API to be available under the same origin at `/api`; a Pi deployment should put the static frontend and API behind one local reverse proxy or equivalent.
- Do not move card image bytes into PostgreSQL; the JSON/file store is deliberate for simple Raspberry Pi operation.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
