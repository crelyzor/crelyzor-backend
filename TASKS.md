# calendar-backend — Task List

Last updated: 2026-03-03

> **Rule:** When you complete a task, change `- [ ]` to `- [x]` and move it to the Done section.
> **Legend:** `[ ]` Not started · `[~]` Has code but broken/incomplete · `[x]` Done and working

---

## P0 — Build Next

### Task model — replace MeetingActionItem
The `MeetingActionItem` model is being dropped. `Task` is the permanent model from day one.
Meeting-linked tasks have `meetingId` set. Standalone tasks (Phase 3) will have `meetingId: null`.

- [x] Add `Task` model to `schema.prisma` with `TaskSource` and `TaskPriority` enums
- [x] Run `pnpm db:push` — schema synced to DB
- [x] Update AI extraction service: write `Task` records (with meetingId + `source: AI_EXTRACTED`) instead of `MeetingActionItem`
- [x] Drop `MeetingActionItem` from schema (it has no production data worth keeping)
- [x] `GET /sma/meetings/:meetingId/tasks` — list tasks for a meeting
- [x] `POST /sma/meetings/:meetingId/tasks` — create task manually (`source: MANUAL`)
- [x] `PATCH /sma/tasks/:taskId` — update (toggle isCompleted, edit title, set dueDate)
- [x] `DELETE /sma/tasks/:taskId` — soft delete
- [x] All routes under `verifyJWT`, Zod validated

### Auth — Refresh Token
- [x] `POST /auth/refresh-token` — already fully implemented
- [x] Refresh token issued on login, stored in DB
- [x] Token rotation on refresh (old token revoked)
- [x] `POST /auth/logout` — invalidates refresh token in DB

---

## P1 — Next Sprint

### Ask AI
- [ ] `POST /sma/meetings/:meetingId/ask`
  - Verify meeting belongs to user
  - Fetch `MeetingTranscript` with all `TranscriptSegment[]`
  - Build prompt: system + transcript (use `displayName` if set, else `speakerLabel`) + user question
  - Stream response back to client (SSE or chunked transfer)
  - Zod: `{ question: z.string().min(1).max(1000) }`
  - Rate limit: max 20 req/user/hour

### AI Content Generation
- [ ] `POST /sma/meetings/:meetingId/generate`
  - Body: `{ type: "MEETING_REPORT" | "MAIN_POINTS" | "TODO_LIST" | "TWEET" | "BLOG_POST" | "EMAIL" }`
  - Each type gets its own OpenAI prompt template
  - Cache result — store in `MeetingAIContent` (new model) keyed by meetingId + type
  - Zod: `{ type: z.enum([...]) }`

### Regenerate Actions
- [ ] `POST /sma/meetings/:meetingId/regenerate`
  - Body: `{ target: "TITLE" | "SUMMARY" | "TRANSCRIPT" }`
  - TITLE + SUMMARY: re-run OpenAI with existing transcript
  - TRANSCRIPT: re-run Deepgram (TRANSCRIPT only if recording exists)
  - Re-queue as Bull job, return 202 + jobId
  - `GET /sma/meetings/:meetingId/regenerate/:jobId/status` — poll job status

### Change Language
- [ ] `POST /sma/meetings/:meetingId/language`
  - Body: `{ language: string }` (BCP 47 code e.g. "en-US", "es", "fr")
  - Re-run Deepgram with specified language
  - Re-queue as Bull job

---

## P2 — Deeper Features

### Public Meeting Links
- [ ] Schema: `MeetingShare` model — `id`, `meetingId`, `shortId` (nanoid 8 chars), `isPublic`, `createdAt`
- [ ] Migration + Prisma generate
- [ ] `POST /sma/meetings/:meetingId/share` — create or get existing share (idempotent)
- [ ] `PATCH /sma/meetings/:meetingId/share` — toggle `isPublic`
- [ ] `GET /public/meetings/:shortId` — public endpoint, returns meeting data (transcript + summary) if isPublic

### Export
- [ ] `GET /sma/meetings/:meetingId/export`
  - Query params: `?format=pdf|txt&content=transcript|summary`
  - PDF: use a lightweight lib (e.g. pdfkit or puppeteer)
  - TXT: plain text, streamed as file download
  - Auth required (private export)

### Tags (Universal)
- [ ] Schema: `Tag` model — `id`, `userId`, `name`, `color`, `createdAt`
- [ ] Schema: `MeetingTag` junction — `meetingId`, `tagId`
- [ ] Schema: `CardTag` junction — `cardId`, `tagId`
- [ ] Migration + Prisma generate
- [ ] `GET /tags` — list user's tags
- [ ] `POST /tags` — create tag
- [ ] `DELETE /tags/:tagId` — delete tag (cascades junctions)
- [ ] `POST /meetings/:meetingId/tags` — attach tag
- [ ] `DELETE /meetings/:meetingId/tags/:tagId` — detach tag
- [ ] `POST /cards/:cardId/tags` — attach tag
- [ ] `DELETE /cards/:cardId/tags/:tagId` — detach tag

### Attachments
- [ ] Schema: `MeetingAttachment` model — `id`, `meetingId`, `userId`, `type` (FILE | LINK | PHOTO), `url`, `name`, `size`, `createdAt`
- [ ] `POST /meetings/:meetingId/attachments` — upload file to GCS or save link
- [ ] `DELETE /meetings/:meetingId/attachments/:attachmentId`
- [ ] `GET /meetings/:meetingId/attachments`

### Edit Transcript / Summary
- [ ] `PATCH /sma/meetings/:meetingId/transcript/segments/:segmentId`
  - Body: `{ text: string }` — edit a single segment's text
- [ ] `PATCH /sma/meetings/:meetingId/summary`
  - Body: `{ summary?: string, keyPoints?: string[], title?: string }` — manual override

---

## Phase 1 — Done ✅

- [x] Meeting CRUD (create, update, cancel, complete, list, get by ID)
- [x] MeetingType enum (SCHEDULED | RECORDED | VOICE_NOTE) — schema + migration
- [x] Non-SCHEDULED meetings skip conflict detection + participants
- [x] Type filter on GET /meetings endpoints
- [x] Meeting participants management
- [x] Conflict detection (for SCHEDULED only)
- [x] Recording upload to GCS — end to end working
- [x] GCS lazy env var loading (fixed ESM hoisting bug)
- [x] Deepgram Nova-2 transcription with diarization
- [x] TranscriptSegment storage (speaker + timestamp)
- [x] OpenAI summary generation
- [x] Key points extraction (fixed markdown JSON parsing)
- [x] Action items extraction (fixed markdown JSON parsing)
- [x] AI meeting title generation
- [x] Meeting notes CRUD (`GET/POST /sma/meetings/:id/notes`, `DELETE /sma/notes/:noteId`)
- [x] Meeting state history
- [x] Google OAuth + JWT
- [x] Card CRUD
- [x] Public card endpoints
- [x] Contact exchange
- [x] Card analytics
- [x] QR code + vCard generation
- [x] User profile management
- [x] Soft delete system
- [x] Global error handler + response handler
- [x] Zod validation on all existing routes
- [x] Rate limiting
- [x] Bull job queue
- [x] Auto-create MeetingSpeaker records after transcription
- [x] `PATCH /sma/meetings/:id/speakers/:speakerId` — rename speaker
- [x] `GET /sma/meetings/:id/speakers` — list speakers

---

## Phase 1.2 — Future

- [ ] Recall.ai webhook + bot deployment
- [ ] Availability slots API
- [ ] Public booking endpoint
- [ ] Google Calendar sync

---

## Phase 2 — Future

- [ ] Vector embeddings pipeline
- [ ] RAG query endpoint (global Ask AI)

---

## Phase 3 — Future

- [ ] Standalone tasks API — `GET /tasks` (all tasks, not scoped to a meeting), with filter/sort/pagination
- [ ] Tag junction for Tasks (`TaskTag` — extends universal Tag system)
- [ ] Due date + priority support (model already has the fields, just needs API + UI)
