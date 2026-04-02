# calendar-backend — Task List

Last updated: 2026-04-02 (Phase 3 complete — Phase 3.2 in progress)

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

- [x] **Google Calendar re-auth:** New `POST /auth/google/calendar/connect` endpoint (verifyJWT) returns Google OAuth URL with calendar scope. Callback `GET /auth/google/calendar/connect/callback` verifies HMAC-signed state, exchanges code, updates OAuthAccount tokens + UserSettings.googleCalendarEmail. Frontend wired: connect button calls POST, navigates to returned URL; callback params handled on Settings mount.
- [x] **Google Calendar read sync:** In slot engine, when `UserSettings.googleCalendarSyncEnabled === true`, call `calendar.freebusy.query` for the requested date. Cache result 5 minutes (Redis). Merge returned busy intervals with Crelyzor meetings before filtering.
- [x] **Google Calendar write sync:** On booking confirmed, call `calendar.events.insert` (attendees, location/link, description from guest note). Store `event.id` as `Booking.googleEventId`. On booking cancelled, call `calendar.events.delete(googleEventId)`.

### P4 — Recall.ai Integration

- [x] **Recall.ai settings storage:** `recallApiKey` AES-256-GCM encrypted at rest. `PUT /settings/recall-api-key` saves it. `PATCH /settings/user { recallEnabled }` guarded — 400 if key not saved.
- [x] **Recall.ai service:** `src/services/recall/recallService.ts` — `deployBot(meetingLink, recallApiKey)` + `getRecordingUrl(botId, recallApiKey)`. Uses `Authorization: Token <key>` (not Bearer).
- [x] **Recall bot job:** On booking confirmed + `recallEnabled === true` → Bull delayed job fires 5 min before startTime. Worker decrypts key at runtime, calls deployBot, stores botId on Meeting.
- [x] **Recall webhook:** `POST /webhooks/recall` — HMAC-SHA256 signature verification, scoped rawBody capture, rate-limited. On `done` status → queue recall-recording job → download + upload to GCS → transcription pipeline.

---

---

## Phase 1.3 — Google Calendar Deep Integration

Design doc: `docs/dev-notes/phase-1.3-gcal.md`

> **What already exists from Phase 1.2:**
> - `googleCalendarService.ts` — `getCalendarBusyIntervals`, `insertCalendarEvent`, `deleteCalendarEvent` (booking-scoped)
> - Google Calendar re-auth OAuth flow (`/auth/google/calendar/connect`)
> - `OAuthAccount` stores scopes + tokens + refresh logic
> - `UserSettings.googleCalendarSyncEnabled` + `googleCalendarEmail`
> - `Booking.googleEventId`

### P0 — Schema + Meet Link Foundation (do first — P1 and P3 depend on it)

- [x] **Schema:** Add `meetLink String?` to `Meeting` model — stores auto-generated Google Meet URL
- [x] **Schema:** Add `googleEventId String?` to `Meeting` model — for write sync back to GCal
- [x] **Migration:** `pnpm db:push && pnpm db:generate` — schema synced, Prisma client regenerated
- [x] **`generateMeetLink(userId)`** in `googleCalendarService.ts` — calls `calendar.events.insert` with `conferenceData: { createRequest: { requestId: uuid } }`, extracts `conferenceData.entryPoints[0].uri`. Fail-open: returns `null` if GCal not connected or API fails.
- [x] **Auto Meet link on meeting create:** In `meetingService.createMeeting()` — if `addToCalendar === true` and type is SCHEDULED and GCal connected → call `generateMeetLink` → store `meetLink` + `googleEventId` on Meeting
- [x] **Include `meetLink` in all meeting responses** — scalar fields auto-included in all `include`-based queries (no changes needed)

### P1 — GCal Write Sync for Meetings

- [x] **`createGCalEventForMeeting(userId, params)`** in `googleCalendarService.ts` — creates GCal event from a `Meeting` record (title, start/end, location, optional Meet link via conferenceData). Returns `{ googleEventId, meetLink } | null`. Fail-open.
- [x] **`updateGCalEventForMeeting(userId, googleEventId, updates)`** — patches GCal event (title, times, timezone, location). Fail-open.
- [x] **`deleteCalendarEvent`** — already existed, reused directly in meetingService.
- [x] **Hook into `createMeeting`:** Replaced P0 `generateMeetLink` call with `createGCalEventForMeeting` (one API call gets proper event + Meet URL). Stores `googleEventId` + `meetLink`.
- [x] **Hook into `updateMeeting`:** If `meeting.googleEventId` set → call `updateGCalEventForMeeting` after transaction.
- [x] **Hook into `cancelMeeting` / `deleteMeeting`:** Added `deleteMeeting` service method. Both call `deleteCalendarEvent` after DB commit.
- [x] **Zod:** Added `addToCalendar?: z.boolean().optional()` to both `createMeetingSchema` and `updateMeetingSchema`

### P2 — GCal Events Endpoint (for Dashboard Timeline)

- [x] **`fetchGCalEvents(userId, start, end)`** in `googleCalendarService.ts` — calls `calendar.events.list` (primary calendar, timeMin/timeMax, singleEvents: true, orderBy: startTime). Returns normalized `CalendarEvent[]` with `{ id, title, startTime, endTime, location, meetLink }`. Cached in Redis 5 min. Fail-open returns `[]`.
- [x] **`GET /integrations/google/events?start=&end=`** — `verifyJWT`, Zod validate (ISO datetimes, end>start, 60-day cap), userRateLimit(60/hr). New route file: `src/routes/integrationRoutes.ts`.
- [x] **`GET /integrations/google/status`** — `verifyJWT`, returns `{ connected: boolean, email: string | null, syncEnabled: boolean }`. Scoped service function `getGCalConnectionStatus` in `googleCalendarService.ts`.
- [x] **Wire new routes** into `src/routes/indexRouter.ts` under `/integrations`

### P3 — Disconnect Endpoint

- [x] **`disconnectGCalendar(userId)`** in `googleCalendarService.ts` — strips calendar scopes from `OAuthAccount`, clears `googleCalendarEmail` + disables sync in `UserSettings`. Single `prisma.$transaction` with 15s timeout. Fail-open pattern: existing meetings with `googleEventId` retain the field, GCal sync simply stops.
- [x] **`DELETE /integrations/google/disconnect`** in `integrationRoutes.ts` — `verifyJWT` applied at router level. Controller calls `disconnectGCalendar(userId)`.

---

## Phase 1.4 — Recall.ai Platform Integration ✅ Complete

Design doc: `docs/dev-notes/phase-1.4-recall-platform.md`

Move Recall from per-user BYO-key to platform-level service.

### P0 — Schema + Environment

- [x] Schema: drop `recallApiKey String?` from `UserSettings` model (keep `recallEnabled`)
- [x] DB push: `pnpm db:push` — column dropped, Prisma client regenerated
- [x] Env: add `RECALL_API_KEY` to `.env.example` + `environment.ts` Zod schema
- [x] Env: remove `RECALL_ENCRYPTION_KEY` from `.env.example` + `environment.ts`

### P1 — Remove per-user key infrastructure

- [x] Delete `PUT /settings/recall-api-key` route from `settingsRoutes.ts`
- [x] Delete `saveRecallApiKey` handler from `userSettingsController.ts`
- [x] Delete `upsertRecallApiKey` from `userSettingsService.ts`
- [x] Delete `saveRecallApiKeySchema` from `recallSchema.ts` (kept webhook schema)
- [x] Remove "must have recallApiKey before enabling" guard — replaced with `env.RECALL_API_KEY` check
- [x] Remove `hasRecallApiKey` from settings response. Add `recallAvailable: boolean` (derived from `!!env.RECALL_API_KEY`)
- [x] Delete `encryption.ts` entirely (only Recall used it)

### P2 — Refactor Recall service + worker

- [x] `recallService.ts`: remove `recallApiKey` param — reads `env.RECALL_API_KEY` internally
- [x] `recallService.ts`: add `joinAt` param to `deployBot()` — pass `join_at` ISO timestamp
- [x] `recallService.ts`: add `automatic_leave` config (waiting_room_timeout: 600, noone_joined_timeout: 180)
- [x] `recallService.ts`: remove `assembly_ai` transcript provider from bot payload
- [x] `jobProcessor.ts` — `DEPLOY_RECALL_BOT`: removed decrypt, per-user key fetch; uses platform key + joinAt
- [x] `jobProcessor.ts` — `FETCH_RECALL_RECORDING`: removed decrypt, per-user key fetch; calls `getRecordingUrl(botId)`
- [x] `bookingManagementService.ts`: already clean — only checks `recallEnabled` (no per-user key dependency)

### P3 — Expand bot deployment scope

- [x] `meetingService.ts`: on `createMeeting()` — queues Recall bot if SCHEDULED + video link + recallEnabled + RECALL_API_KEY
- [x] Covers both GCal Meet links (`addToCalendar: true`) and manual video URLs in `location`
- [x] URL allowlist validation (`isVideoMeetingUrl`) — only Google Meet, Zoom, Teams, Webex passed to Recall
- [x] Fail-open: bot deploy failure doesn't block meeting creation

---

## Phase 2 — Standalone Tasks ✅ Complete

- [x] Standalone tasks API — `GET /sma/tasks` (filter/sort/pagination) + `POST /sma/tasks` (standalone create with optional meetingId)
- [x] Tag junction for Tasks (`TaskTag` — extends universal Tag system, GET/POST/DELETE /sma/tasks/:taskId/tags, tags included in GET /sma/tasks response)
- [x] Due date + `scheduledTime` support (`scheduledTime DateTime?` + index, exposed in create/update/list endpoints, frontend type updated)

---

## Phase 3 — Todoist-Level Tasks + Calendar View

### P0 — Schema + API Upgrades ✅ Complete

- [x] `TaskStatus` enum: `TODO | IN_PROGRESS | DONE` added to schema
- [x] `status TaskStatus @default(TODO)` on Task — synced with isCompleted in service layer
- [x] `sortOrder Int @default(0)` on Task
- [x] `parentTaskId UUID?` on Task — self-referential FK, subtasks
- [x] `cardId UUID?` on Task — link task to Card contact
- [x] `transcriptContext String?` on Task — transcript sentence for AI_EXTRACTED tasks
- [x] DB push + Prisma client regenerated
- [x] `PATCH /sma/tasks/reorder` — bulk sortOrder update, userId-scoped transaction
- [x] `GET /sma/tasks/:taskId/subtasks` — parent ownership verified
- [x] `POST /sma/tasks/:taskId/subtasks` — parent ownership verified, userId from auth
- [x] `GET /sma/tasks?view=` — inbox | today | upcoming | all | from_meetings
- [x] `cardId`, `status`, `transcriptContext` on create + update endpoints
- [x] `updateTask`: status↔isCompleted kept in sync
- [x] `deleteTask`: cascades soft-delete to direct subtasks in transaction
- [x] `getTasks` (meeting-scoped): userId added to Task where clause (security fix)

### P1 — Task Detail Panel + Row Redesign (crelyzor-frontend) ✅ Complete

- [x] Task detail slide panel (right-side slide-over, auto-save on blur)
- [x] Task row redesign (priority border, overdue indicator, meeting chip, click to open panel)

### P2 — Sidebar Nav + Views (crelyzor-frontend) ✅ Complete

- [x] Sidebar nav: Inbox · Today · Upcoming · All · From Meetings (URL-driven `?view=`)
- [x] Today view (overdue + due today sections, midnight boundary)
- [x] Upcoming view (7-day grouped, backend pre-groups response)
- [x] From Meetings view (grouped by meeting name on frontend)

### P3 — Board View + Drag and Drop (crelyzor-frontend)
- [x] Board view (Kanban: Todo / In Progress / Done)
- [x] List drag-to-reorder (dnd-kit)
- [x] Grouped view (by date)

### P4 — Quick Add + Integrations
- [x] Global quick-add Cmd+K with natural language parsing
- [ ] Auto-create "Prepare" task on booking confirmed (bookingManagementService.ts)
- [ ] Contact-linked tasks on Card detail page

### P5 — Calendar View
- [ ] /calendar page (week/day, GCal + meetings + tasks unified)
- [ ] All-day task markers for dueDate-only tasks
- [ ] Drag task to time slot → sets scheduledTime

---

## Phase 3.2 — Polish, Enhancements & Power Features ← current

### P1 — Task Duration Field

- [ ] **Schema:** Add `durationMinutes Int? @default(30)` to `Task` model
- [ ] **Migration:** `pnpm db:push && pnpm db:generate`
- [ ] **Update endpoints:** Expose `durationMinutes` in `createStandaloneTask`, `updateTask` create/update Zod schemas and service handlers
- [ ] **Validate:** `z.number().int().min(5).max(480).optional()` (5 min to 8 hrs)

---

### P2 — Auto-create "Prepare for Meeting" Task on Booking Confirmed

- [ ] **`bookingManagementService.ts`:** After `Booking` + `Meeting` are created atomically, create a `Task` record:
  - `title`: `"Prepare for [eventType.title] with [guestName]"`
  - `userId`: host's userId
  - `meetingId`: newly created meeting's id
  - `dueDate`: 1 hour before `startTime` (ISO string)
  - `source`: `MANUAL`
  - `status`: `TODO`
- [ ] Done inside the same `$transaction` as booking creation
- [ ] Fail-open — task creation failure should not roll back the booking

---

### P3 — Schedule Task → Create GCal Block

- [ ] **`googleCalendarService.ts`:** Add `createTaskBlock(userId, task)` — inserts a GCal event titled `"🔲 [task.title]"` at `task.scheduledTime` for `task.durationMinutes`. Returns `googleEventId | null`. Fail-open.
- [ ] **`googleCalendarService.ts`:** Add `deleteTaskBlock(userId, googleEventId)` — deletes the GCal event. Fail-open.
- [ ] **Schema:** Add `googleEventId String?` to `Task` model (stores the GCal block event id)
- [ ] **`taskService.ts` → `updateTask`:** When `scheduledTime` is set + user has GCal connected + `blockInCalendar: true` in payload → call `createTaskBlock`, store `googleEventId` on Task. When `scheduledTime` cleared → call `deleteTaskBlock`.
- [ ] **`PATCH /sma/tasks/:taskId` Zod schema:** Add `blockInCalendar?: z.boolean().optional()`
- [ ] **Migration:** `pnpm db:push && pnpm db:generate`

---

### P3 — Meeting ↔ Card Contact Auto-Linking

- [ ] **`meetingService.ts` → `createMeeting`:** After meeting is created, query `Card` + `CardContact` where `cardContact.email` matches any participant email (scoped to same userId). For each match, create a `Task` card link or update meeting metadata. Actually: create a `MeetingContact` junction or store `cardId` on `MeetingParticipant`.
- [ ] **Schema option:** Add `cardId UUID?` to `MeetingParticipant` model — links a participant slot to a Card contact
- [ ] **`GET /meetings/:meetingId`:** Include `participants.card { id, displayName, slug }` in response
- [ ] **New endpoint:** `GET /cards/:cardId/meetings` — list meetings where a card contact participated (join through `MeetingParticipant.cardId`). `verifyJWT`, ownership check.
- [ ] **Migration:** `pnpm db:push && pnpm db:generate`

---

### P3 — Global Search Endpoint

- [ ] **New endpoint:** `GET /search?q=<query>&types=meetings,tasks,cards`
  - `verifyJWT`
  - Zod: `q` (string, 2–100 chars), `types` (optional comma-separated enum)
  - Queries in parallel (Promise.all):
    - Meetings: `title ILIKE %q%` OR summary text ILIKE
    - Tasks: `title ILIKE %q%` OR description ILIKE
    - Cards: `displayName ILIKE %q%`
  - Returns `{ meetings: [...], tasks: [...], cards: [...] }` — each capped at 10 results
  - All queries scoped to `userId`, `isDeleted: false`
- [ ] **New route:** `GET /search` in `src/routes/searchRoutes.ts`, wired in `indexRouter.ts`
- [ ] **Rate limit:** 30 req/min per user

---

### P4 — Recurring Tasks

- [ ] **Schema:** Add `recurringRule String?` to `Task` (stores RRULE string, e.g. `FREQ=WEEKLY;BYDAY=MO`)
- [ ] **Schema:** Add `recurringParentId UUID?` → self-referential FK to original Task
- [ ] **Migration:** `pnpm db:push && pnpm db:generate`
- [ ] **`taskService.ts` → `updateTask`:** When `isCompleted: true` + task has `recurringRule` → generate next occurrence: parse RRULE, compute next `dueDate`, create new Task (same title/description/priority/cardId/meetingId, `recurringParentId = original.id`)
- [ ] **`PATCH /sma/tasks/:taskId` Zod:** Add `recurringRule?: z.string().optional().nullable()`
- [ ] **`POST /sma/tasks` Zod:** Add `recurringRule?: z.string().optional()`
- [ ] Use `rrule` npm package for RRULE parsing/generation (lightweight, no dependencies)

---

## Phase 4 — Big Brain ⛔ BLOCKED

Requires separate infrastructure. Do not start.

- [ ] Vector embeddings pipeline
- [ ] RAG query endpoint (global Ask AI)
- [ ] Full two-way GCal sync — Google Calendar push webhooks
