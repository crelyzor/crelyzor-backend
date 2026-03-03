# calendar-backend — Task List

Last updated: 2026-03-03

> **Rule:** When you complete a task, change `- [ ]` to `- [x]` and move it to the Done section.
> **Legend:** `[ ]` Not started · `[~]` Has code but broken/incomplete · `[x]` Done and working

---

## P0 — Build Next

### Ask AI endpoint
- [ ] `POST /sma/meetings/:meetingId/ask`
  - Verify meeting belongs to user
  - Fetch `MeetingTranscript` with all `TranscriptSegment[]`
  - Build OpenAI prompt: system + transcript context (use displayName if set, else speakerLabel) + user question
  - Stream response back to client
  - Add to `smaRoutes.ts` with `verifyJWT`
  - Zod schema: `{ question: z.string().min(1).max(1000) }`
  - Rate limit: max 20 requests per user per hour

### Auth — Refresh Token
- [ ] `POST /auth/refresh` endpoint — exchange refresh token for new access token
- [ ] Issue refresh token on login (httpOnly cookie or response body), store hashed in DB
- [ ] Rotate refresh tokens on use

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
- [x] Meeting notes CRUD
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
- [x] Auto-create MeetingSpeaker records after transcription (distinct speaker labels from TranscriptSegment → upsert MeetingSpeaker rows)
- [x] `PATCH /sma/meetings/:meetingId/speakers/:speakerId` — rename speaker (displayName + role)
- [x] `GET /sma/meetings/:meetingId/speakers` — list all speakers for a meeting

---

## Phase 1.2 — Future

- [ ] Recall.ai webhook + bot deployment
- [ ] Availability slots API
- [ ] Public booking endpoint
- [ ] Google Calendar sync

---

## Phase 2 — Future

- [ ] Vector embeddings pipeline
- [ ] RAG query endpoint

---

## Phase 3 — Future

- [ ] Tasks model + CRUD API
