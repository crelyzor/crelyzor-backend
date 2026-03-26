# calendar-backend — Task List

Last updated: 2026-03-26 (Phase 1.2 P2 complete — booking creation + host management + guest cancellation done)

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
- [x] `POST /sma/meetings/:meetingId/ask`
  - Verify meeting belongs to user
  - Fetch `MeetingTranscript` with all `TranscriptSegment[]`
  - Build prompt: system + transcript (use `displayName` if set, else `speakerLabel`) + user question
  - Stream response back to client (SSE or chunked transfer)
  - Zod: `{ question: z.string().min(1).max(1000) }`
  - Rate limit: max 20 req/user/hour

### AI Content Generation
- [x] `POST /sma/meetings/:meetingId/generate`
  - Body: `{ type: "MEETING_REPORT" | "MAIN_POINTS" | "TODO_LIST" | "TWEET" | "BLOG_POST" | "EMAIL" }`
  - Each type gets its own OpenAI prompt template
  - Cache result — store in `MeetingAIContent` (new model) keyed by meetingId + type
  - Zod: `{ type: z.enum([...]) }`
- [x] `GET /sma/meetings/:meetingId/generated` — list all cached generated content

### Regenerate Actions
- [x] `POST /sma/meetings/:meetingId/summary/regenerate` — re-runs OpenAI summary + key points
- [x] `POST /sma/meetings/:meetingId/title/regenerate` — re-runs OpenAI title generation

### Change Language
- [x] `POST /sma/meetings/:meetingId/language`
  - Body: `{ language: string }` (BCP 47 code e.g. "en-US", "es", "fr")
  - Re-run Deepgram with specified language
  - Re-queue as Bull job

---

## P2 — Deeper Features

### Public Meeting Links
- [x] Schema: `MeetingShare` model — `id`, `meetingId`, `userId`, `shortId` (nanoid 8 chars), `isPublic`, `showTranscript`, `showSummary`, `showTasks`, soft delete, `createdAt`
- [x] `pnpm db:push` — schema synced to DB
- [x] `POST /sma/meetings/:meetingId/share` — create or get existing share (idempotent)
- [x] `PATCH /sma/meetings/:meetingId/share` — update `isPublic` + field flags
- [x] `GET /public/meetings/:shortId` — public endpoint, returns meeting data (transcript + summary + tasks) if isPublic

### Export
- [x] `GET /sma/meetings/:meetingId/export`
  - Query params: `?format=pdf|txt&content=transcript|summary`
  - PDF: use a lightweight lib (e.g. pdfkit or puppeteer)
  - TXT: plain text, streamed as file download
  - Auth required (private export)

### Tags (Universal)
- [x] Schema: `Tag` model — `id`, `userId`, `name`, `color`, `createdAt`, soft delete
- [x] Schema: `MeetingTag` junction — `meetingId`, `tagId`
- [x] Schema: `CardTag` junction — `cardId`, `tagId`
- [x] `pnpm db:push` — schema synced to DB
- [x] `GET /tags` — list user's tags
- [x] `POST /tags` — create tag (hex color validated, P2002 → 409)
- [x] `PATCH /tags/:tagId` — update tag name/color
- [x] `DELETE /tags/:tagId` — soft delete (cascades junction rows in transaction)
- [x] `GET /meetings/:meetingId/tags` — list tags on a meeting
- [x] `POST /meetings/:meetingId/tags/:tagId` — attach tag (idempotent upsert)
- [x] `DELETE /meetings/:meetingId/tags/:tagId` — detach tag
- [x] `GET /cards/:cardId/tags` — list tags on a card
- [x] `POST /cards/:cardId/tags/:tagId` — attach tag to card
- [x] `DELETE /cards/:cardId/tags/:tagId` — detach tag from card
- [x] All routes under `verifyJWT`, Zod validated, ownership verified on both meeting/tag

### Attachments
- [x] Schema: `MeetingAttachment` model — `id`, `meetingId`, `userId`, `type` (FILE | LINK | PHOTO), `url`, `name`, `size`, `createdAt`
- [x] `POST /meetings/:meetingId/attachments/link` — save link (SSRF-safe URL validation)
- [x] `POST /meetings/:meetingId/attachments/file` — upload file to GCS (images + PDF + doc, 50MB max)
- [x] `DELETE /meetings/:meetingId/attachments/:attachmentId` — soft delete
- [x] `GET /meetings/:meetingId/attachments` — list with signed GCS URLs (60min TTL)

### Edit Transcript / Summary
- [x] `PATCH /sma/meetings/:meetingId/transcript/segments/:segmentId`
  - Body: `{ text: string }` — edit a single segment's text
- [x] `PATCH /sma/meetings/:meetingId/summary`
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

## Phase 1.2 — Scheduling & Online Meetings ← current

Design doc: `docs/dev-notes/phase-1.2-scheduling.md`

### P0 — Schema + Foundation (do first — everything else depends on it)

- [x] **Schema:** Add `UserSettings`, `EventType`, `Availability`, `AvailabilityOverride`, `Booking` models + `LocationType`/`BookingStatus` enums + `recallBotId` on `Meeting` (see design doc for full Prisma models)
- [x] **Migration:** Used `pnpm db:push` (project uses push throughout Phase 1 — no migrations dir existed). DB in sync.
- [x] **UserSettings on sign-up:** In auth controller, after `user.create`, auto-create `UserSettings` with defaults + auto-seed `Availability` Mon–Fri 09:00–17:00 (5 rows)
- [x] **UserSettings API:** `GET /settings/user` + `PATCH /settings/user` — get/update all scheduling + AI + integration settings. Zod-validated. `verifyJWT`.

### P1 — Event Types + Availability

- [x] **Event types CRUD:** `GET /scheduling/event-types`, `POST /scheduling/event-types`, `PATCH /scheduling/event-types/:id`, `DELETE /scheduling/event-types/:id` (soft delete). Zod: title, slug (unique per user), duration, locationType, meetingLink (required when ONLINE), bufferBefore, bufferAfter, maxPerDay, isActive.
- [x] **Availability API:** `GET /scheduling/availability` — list user's weekly availability rows. `PATCH /scheduling/availability` — bulk upsert all days (array of `{ dayOfWeek, startTime, endTime }` or `{ dayOfWeek, isOff: true }`).
- [x] **Availability overrides API:** `POST /scheduling/availability/overrides` — mark a specific date blocked. `DELETE /scheduling/availability/overrides/:id` — unblock.
- [x] **Slot calculation engine:** `src/services/scheduling/slotService.ts` — given `username`, `eventTypeSlug`, `date`; generates candidate slots within availability window; subtracts existing Bookings + Crelyzor Meetings + buffers + minNoticeHours; returns `{ startTime, endTime }[]` in UTC. Timezone-aware (uses `User.timezone`). DST-safe via pure Intl approach.
- [x] **Slots API:** `GET /public/scheduling/slots/:username/:eventTypeSlug?date=YYYY-MM-DD` — calls slot engine. No auth. Uses public identifiers (no UUID leakage).
- [x] **Public scheduling profile:** `GET /public/scheduling/profile/:username` — returns user's active event types + display name. No auth. Used by booking page SSR.

### P2 — Booking Creation

- [x] **Booking creation:** `POST /public/bookings` (no auth) — validate slot still available (re-run slot check), create `Booking` + `Meeting` (type: SCHEDULED) in a `prisma.$transaction`, link `Booking.meetingId`. Serializable isolation prevents double-bookings. Rate-limited (10/hr per IP). meetingLink omitted from response (security).
- [x] **Booking management (host):** `GET /scheduling/bookings` — list host's bookings (filter by status, date range, pagination). `PATCH /scheduling/bookings/:id/cancel` — cancel with reason, update Meeting status. `verifyJWT`.
- [x] **Booking cancellation (guest):** `PATCH /public/bookings/:id/cancel` — no auth. Cancel booking + meeting. Rate-limited.

### P3 — Google Calendar Integration

- [ ] **Google Calendar re-auth:** Update OAuth flow to conditionally request `https://www.googleapis.com/auth/calendar` write scope (when `googleCalendarSyncEnabled` is being turned on). Store updated tokens on `OAuthAccount`.
- [ ] **Google Calendar read sync:** In slot engine, when `UserSettings.googleCalendarSyncEnabled === true`, call `calendar.freebusy.query` for the requested date. Cache result 5 minutes (Redis). Merge returned busy intervals with Crelyzor meetings before filtering.
- [ ] **Google Calendar write sync:** On booking confirmed, call `calendar.events.insert` (attendees, location/link, description from guest note). Store `event.id` as `Booking.googleEventId`. On booking cancelled, call `calendar.events.delete(googleEventId)`.

### P4 — Recall.ai Integration

- [ ] **Recall.ai settings storage:** `recallApiKey` encrypted at rest on `UserSettings`. `PATCH /settings/user` accepts/updates it.
- [ ] **Recall.ai service:** `src/services/recall/recallService.ts` — `deployBot(meetingLink, recallApiKey)` → `POST https://api.recall.ai/v1/bots` → returns `botId`. Store `botId` on `Meeting.recallBotId`.
- [ ] **Recall bot job:** On booking confirmed + `locationType === ONLINE` + `recallEnabled === true` → queue Bull job: `{ type: 'recall-deploy', bookingId, meetingLink, startTime }`. Worker picks it up ~5 mins before `startTime` and calls `recallService.deployBot`.
- [ ] **Recall webhook:** `POST /webhooks/recall` — verify Recall.ai signature. On `bot.status_change` → update `Meeting` status. On audio data → stream to Deepgram (reuse `transcribeRecording`). Same AI pipeline fires after.

---

## Phase 3 — Big Brain

- [ ] Vector embeddings pipeline
- [ ] RAG query endpoint (global Ask AI)

---

## Phase 4 — Standalone Tasks

- [ ] Standalone tasks API — `GET /tasks` (all tasks, not scoped to a meeting), with filter/sort/pagination
- [ ] Tag junction for Tasks (`TaskTag` — extends universal Tag system)
- [ ] Due date + priority support (model already has the fields, just needs API + UI)
