# calendar-backend — Task List

Last updated: 2026-05-30 (Phase 6 backend fully shipped 🎉 P0–P8 — schema → public team + WS events → admin overrides + SystemConfig editor. Phase 6 frontend (P9–P15 in workspace TASKS.md) is next.)

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
- [x] Auto-create "Prepare" task on booking confirmed (bookingManagementService.ts)
- [x] Contact-linked tasks on Card detail page

### P5 — Calendar View
- [x] /calendar page (week/day, GCal + meetings + tasks unified)
- [x] All-day task markers for dueDate-only tasks
- [x] Drag task to time slot → sets scheduledTime

---

## Phase 3.2 — Polish, Enhancements & Power Features ← current

### P1 — Task Duration Field

- [x] **Schema:** Add `durationMinutes Int? @default(30)` to `Task` model
- [x] **Migration:** `pnpm db:push && pnpm db:generate`
- [x] **Update endpoints:** Expose `durationMinutes` in `createStandaloneTask`, `updateTask` create/update Zod schemas and service handlers
- [x] **Validate:** `z.number().int().min(5).max(480).optional()` (5 min to 8 hrs)

---

### P2 — Auto-create "Prepare for Meeting" Task on Booking Confirmed ✅

- [x] **`bookingManagementService.ts`:** After booking is confirmed, create a `Task` record:
  - `title`: `"Prepare for [eventType.title] with [guestName]"`
  - `userId`: host's userId
  - `meetingId`: newly created meeting's id
  - `dueDate`: 1 hour before `startTime` (ISO string)
  - `source`: `MANUAL`
  - `status`: `TODO` (schema default)
- [x] Created after the booking confirm DB update (outside transaction — correct for fail-open)
- [x] Fail-open — task creation failure does not affect the booking confirm response

---

### P3 — Schedule Task → Create GCal Block ✅ Complete

- [x] **`googleCalendarService.ts`:** Add `createTaskBlock(userId, task)` — inserts a GCal event titled `"🔲 [task.title]"` at `task.scheduledTime` for `task.durationMinutes`. Returns `googleEventId | null`. Fail-open.
- [x] **`googleCalendarService.ts`:** Add `deleteTaskBlock(userId, googleEventId)` — deletes the GCal event. Fail-open.
- [x] **Schema:** Add `googleEventId String?` to `Task` model (stores the GCal block event id)
- [x] **`taskService.ts` → `updateTask`:** When `scheduledTime` is set + user has GCal connected + `blockInCalendar: true` in payload → call `createTaskBlock`, store `googleEventId` on Task. When `scheduledTime` cleared → call `deleteTaskBlock`.
- [x] **`PATCH /sma/tasks/:taskId` Zod schema:** Add `blockInCalendar?: z.boolean().optional()`
- [x] **Migration:** `pnpm db:push && pnpm db:generate`

---

### P3 — Meeting ↔ Card Contact Auto-Linking ✅ Complete

- [x] **`meetingService.ts` → `createMeeting`:** After meeting is created, query `Card` + `CardContact` where `cardContact.email` matches any participant email (scoped to same userId). For each match, create a `Task` card link or update meeting metadata. Actually: create a `MeetingContact` junction or store `cardId` on `MeetingParticipant`.
- [x] **Schema option:** Add `cardId UUID?` to `MeetingParticipant` model — links a participant slot to a Card contact
- [x] **`GET /meetings/:meetingId`:** Include `participants.card { id, displayName, slug }` in response
- [x] **New endpoint:** `GET /cards/:cardId/meetings` — list meetings where a card contact participated (join through `MeetingParticipant.cardId`). `verifyJWT`, ownership check.
- [x] **Migration:** `pnpm db:push && pnpm db:generate`

---

### P3 — Global Search Endpoint

- [x] **New endpoint:** `GET /search?q=<query>` — verifyJWT, Zod validated, parallel Prisma queries across meetings/tasks/cards/contacts, `take: 5` per bucket. Cards filtered by `isActive: true`. Contacts scoped via nested `card.userId` filter. No rate-limiter added (deferred).
- [x] **New route:** `src/routes/searchRoutes.ts` wired in `indexRouter.ts`

---

### P4 — Recurring Tasks ✅

- [x] **Schema:** Add `recurringRule String?` to `Task` (stores RRULE string, e.g. `FREQ=WEEKLY;BYDAY=MO`)
- [x] **Schema:** Add `recurringParentId UUID?` → self-referential FK to original Task + `@@index([recurringParentId])`
- [x] **Migration:** `pnpm db:push` — synced to Neon
- [x] **`taskController.ts` → `updateTask`:** When task transitions to DONE + has `recurringRule` → parse RRULE, compute next `dueDate`, spawn new Task (fail-open try/catch)
- [x] **`PATCH /sma/tasks/:taskId` Zod:** `recurringRule` as `z.enum(["FREQ=DAILY","FREQ=WEEKLY","FREQ=MONTHLY"]).nullable().optional()`
- [x] Use `rrule` npm package — imported as default export (`import rruleLib from "rrule"; const { RRule } = rruleLib`)

---

## Phase 3.3 — Close the Product Gaps

> Identified via full user-perspective product review (2026-04-04).

---

### P1 — Email Notifications (Resend integration)

**Setup:**
- [x] Install `resend` npm package (`pnpm add resend`)
- [x] Add `RESEND_API_KEY` to `.env.example` + `environment.ts` Zod schema
- [x] Create `src/services/email/emailService.ts` — thin wrapper around Resend client. `sendEmail({ to, subject, html })`. Fail-open: log error, never throw.
- [x] Create `src/services/email/templates/` — one file per template (plain string or simple HTML, no heavy templating lib)

**Triggers:**
- [x] **Booking received (host)** — in `bookingManagementService.ts` after booking confirmed: `sendBookingReceivedEmail(host, booking, guestName, guestEmail)`
- [x] **Booking confirmation (guest)** — same trigger: `sendBookingConfirmationEmail(guest, booking, host)` — include event title, date/time in guest timezone, Google Calendar link, Apple Calendar (.ics attachment), cancel link (`/public/bookings/:id/cancel`)
- [x] **Booking reminder** — Bull delayed job scheduled at `booking.startTime - 24h`: send reminder to both host + guest
- [x] **Booking cancelled** — in `bookingManagementService.ts` cancel handler: notify both parties
- [x] **Meeting AI complete** — in `jobProcessor.ts` after AI processing finishes (transcription status → COMPLETED): `sendMeetingReadyEmail(userId, meetingTitle, meetingId)`. Guard: only if processing succeeded.
- [x] **Daily task digest** — new Bull cron job (`DAILY_TASK_DIGEST`) firing at 08:00 UTC. Queries all users with `UserSettings.dailyDigestEnabled === true`. Per user: fetch overdue + today tasks. If none → skip. Send digest email.

**Settings:**
- [x] **Schema:** Add to `UserSettings`: `emailNotificationsEnabled Boolean @default(true)`, `bookingEmailsEnabled Boolean @default(true)`, `meetingReadyEmailEnabled Boolean @default(true)`, `dailyDigestEnabled Boolean @default(false)`
- [x] **Migration:** `pnpm db:push && pnpm db:generate`
- [x] **`PATCH /settings/user`:** Expose new fields in Zod schema + service handler

---

### P2 — Scheduling Completeness

- [x] **Guest reschedule link** — include a reschedule URL in booking confirmation email. New public endpoint `GET /public/bookings/:id` — returns booking details (no auth). Frontend uses this to pre-populate the date picker.
- [x] **Booking cancelled email** — already noted above in P1

> Note: `minNoticeHours`, `bufferBefore`, `bufferAfter`, `maxPerDay` are already on the EventType schema and the slot engine uses them. No backend changes needed — frontend just needs to expose them in the EventType editor UI.

---

### P3 — Meeting ↔ Card Contact Auto-Linking ✅ Complete

- [x] **`meetingService.ts`:** After meeting created, query `CardContact` where `email` matches any participant email (same userId). For each match, set `cardId` on `MeetingParticipant`.
- [x] **Schema:** Add `cardId UUID?` to `MeetingParticipant` model
- [x] **`GET /meetings/:meetingId`:** Include `participants.card { id, displayName, slug }` in response
- [x] **New endpoint:** `GET /cards/:cardId/meetings` — list meetings where a card contact participated
- [x] **New Endpoint**: `GET /tags/:tagId/items` -> `getTagItems` (returns all meetings, cards, tasks, contacts associated with the tag)
- [x] **Updated Endpoint**: `GET /tags` -> `listTags` now includes counts
- [x] **Migration:** `pnpm db:push && pnpm db:generate`

---

### P5 — Data Import

- [x] **Contact CSV import:** `POST /cards/:cardId/contacts/import` — multipart CSV upload. Parse with `csv-parse`. Validate rows (name required, email or phone required). Bulk-create `CardContact` records in a single transaction. Return `{ created: N, skipped: N, errors: [] }`.
- [x] **Calendar .ics import:** `POST /meetings/import/ics` — multipart .ics upload. Parse with `ical.js`. For each VEVENT: create `Meeting` (type: SCHEDULED, skip if already exists by uid). Return count. Does not trigger AI — user can manually trigger from meeting detail.

---

## Phase 3.4 — Global Tags ← next

> Makes tags truly global: contacts get a proper `ContactTag` junction, tag list returns counts, and a new endpoint returns everything tagged with a given tag across all entity types.

---

### P0 — Schema

- [x] **`ContactTag` junction model** — add to `schema.prisma`:
  ```prisma
  model ContactTag {
    contactId String   @db.Uuid
    tagId     String   @db.Uuid
    createdAt DateTime @default(now())
    contact   CardContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
    tag       Tag         @relation(fields: [tagId],     references: [id], onDelete: Cascade)
    @@id([contactId, tagId])
    @@index([contactId])
    @@index([tagId])
  }
  ```
- [x] **Add relations** to existing models:
  - `Tag` model: add `contactTags ContactTag[]`
  - `CardContact` model: add `contactTags ContactTag[]`
- [x] **Migration:** `pnpm db:push && pnpm db:generate`
- [x] **`deleteTag` transaction** in `tagService.ts`: add `tx.contactTag.deleteMany({ where: { tagId } })` alongside existing meeting/card/task cleanup

---

### P1 — Contact Tag Service + Routes

**`tagService.ts` additions:**
- [x] `verifyContactOwnership(contactId, userId)`
- [x] `getContactTags(userId, contactId)`
- [x] `attachTagToContact(userId, contactId, tagId)`
- [x] `detachTagFromContact(userId, contactId, tagId)`

**Routes** — add to `cardRoutes.ts` (contacts are sub-resources of cards):
- [x] `GET  /cards/:cardId/contacts/:contactId/tags` → `tagController.getContactTags`
- [x] `POST /cards/:cardId/contacts/:contactId/tags/:tagId` → `tagController.attachTagToContact`
- [x] `DELETE /cards/:cardId/contacts/:contactId/tags/:tagId` → `tagController.detachTagFromContact`
- [x] All under existing `verifyJWT` router-level middleware

**`tagController.ts` additions:**
- [x] `getContactTags`, `attachTagToContact`, `detachTagFromContact` handlers

---

### P2 — Tag Items Endpoint + Count on Tag List

**`tagService.ts`:**
- [x] `getTagItems(userId, tagId)` — verify tag ownership, then run 4 parallel queries:
  - `meetingTag.findMany` where `tagId` + `meeting.createdById = userId` + `meeting.isDeleted: false` → return meeting `{ id, title, startTime, type, status }`
  - `cardTag.findMany` where `tagId` + `card.userId = userId` + `card.isDeleted: false` → return card `{ id, slug, displayName, title, avatarUrl }`
  - `taskTag.findMany` where `tagId` + `task.userId = userId` + `task.isDeleted: false` → return task `{ id, title, status, priority, dueDate }`
  - `contactTag.findMany` where `tagId` + `contact.userId = userId` → return contact `{ id, name, email, company, cardId }`
  - Returns `{ tag, meetings, cards, tasks, contacts, counts: { meetings, cards, tasks, contacts, total } }`
- [x] `listTags(userId)` — extend to include `_count: { select: { meetingTags: true, cardTags: true, taskTags: true, contactTags: true } }` on each tag

**`tagRoutes.ts`:**
- [x] `GET /tags/:tagId/items` → `tagController.getTagItems`

**`tagController.ts`:**
- [x] `getTagItems` handler

---

## Phase 4.1 — Billing & Monetization ✅ Complete

Full design: `docs/pricing-and-costs.md`

### P0 — Schema + Migration

- [x] Add `plan` enum to `User` model: `FREE | PRO | BUSINESS` (default `FREE`)
- [x] New `UserUsage` model:
  ```prisma
  model UserUsage {
    id                      String   @id @default(uuid()) @db.Uuid
    userId                  String   @unique @db.Uuid
    user                    User     @relation(fields: [userId], references: [id])
    transcriptionMinutesUsed Int     @default(0)
    recallHoursUsed         Float    @default(0)
    aiCreditsUsed           Int      @default(0)
    storageGbUsed           Float    @default(0)
    periodStart             DateTime @default(now())
    resetAt                 DateTime
    updatedAt               DateTime @updatedAt
  }
  ```
- [x] New `Subscription` model:
  ```prisma
  model Subscription {
    id                      String   @id @default(uuid()) @db.Uuid
    userId                  String   @unique @db.Uuid
    user                    User     @relation(fields: [userId], references: [id])
    razorpayCustomerId      String   @unique
    razorpaySubscriptionId  String?  @unique
    plan                    Plan     @default(FREE)
    status                  String   @default("active")
    currentPeriodEnd        DateTime?
    createdAt               DateTime @default(now())
    updatedAt               DateTime @updatedAt
  }
  ```
- [x] Migration: `pnpm db:push && pnpm db:generate`

---

### P1 — Usage Service ✅ Complete

- [x] `src/services/billing/usageService.ts`:
  - `getUserUsage(userId)` — fetch or create `UserUsage` for current period
  - `checkTranscription(userId, minutes)` — throws 402 if over limit
  - `deductTranscription(userId, minutes)` — increments `transcriptionMinutesUsed`
  - `checkRecall(userId, hours)` — throws 402 if over limit
  - `deductRecall(userId, hours)` — increments `recallHoursUsed`
  - `checkAndDeductCredits(userId, inputTokens, outputTokens)` — calculates credits from tokens, checks limit, deducts
  - `getLimitsForPlan(plan)` — returns `{ transcriptionMinutes, recallHours, aiCredits, storageGb }` per plan
- [x] Credit formula: `credits = ceil((inputTokens × 0.00075) + (outputTokens × 0.0045))`
- [x] Plan limits:
  - FREE: 120 min, 0 hrs Recall, 50 credits, 2 GB
  - PRO: 600 min, 5 hrs Recall, 1000 credits, 20 GB
  - BUSINESS: unlimited (configurable per deal)

---

### P2 — Wire Usage Into Existing Services ✅ Complete

- [x] `transcriptionService.ts` — `checkTranscription` before Deepgram call, `deductTranscription` after success
- [x] `jobProcessor.ts` (DEPLOY_RECALL_BOT) — `checkRecall` before bot deploy, `deductRecall` after recording download
- [x] `aiService.ts` — `checkAndDeductCredits` after each `askAI` + `generateContent` call using `response.usage.prompt_tokens` + `response.usage.completion_tokens`
- [x] Meeting pipeline (summary/tasks/title) — does NOT check credits, fires automatically

---

### P3 — Monthly Reset Cron Job ✅ Complete

- [x] `MONTHLY_USAGE_RESET` job added to `queue.ts`
- [x] Cron: `0 0 1 * *` (midnight on 1st of every month)
- [x] `jobProcessor.ts`: calls `runMonthlyReset()` — resets all `UserUsage` rows where `resetAt <= now`

---

### P4 — Billing Endpoints ✅ Complete

- [x] `src/routes/billingRoutes.ts` — all under `verifyJWT`
- [x] `GET /billing/usage` — returns `{ plan, usage: { transcriptionMinutes, recallHours, aiCredits, storageGb }, limits, resetAt }`
- [x] `POST /billing/checkout` — **stub for now**. Returns `{ message: "Payment gateway coming soon" }`. Plan upgrades done manually via DB.
- [x] `POST /billing/portal` — **stub for now**.
- [x] `src/routes/webhookRoutes.ts`:
  - Razorpay webhook stub deferred (no-op until gateway live)
- [x] Add to `.env.example`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PRO_PLAN_ID` (commented out, for future use)

> **Note:** Payment gateway (Razorpay) is deferred. Early paid users are upgraded manually via Prisma Studio (`user.plan = PRO`). All enforcement, usage tracking, and UI are fully built — only payment collection is missing.

---

### P5 — Enforcement Layer ✅ Complete

- [x] On limit exceeded → `throw new AppError("TRANSCRIPTION_LIMIT_REACHED", 402)` etc. (done in `usageService.ts`)
- [x] Error codes: `TRANSCRIPTION_LIMIT_REACHED`, `RECALL_LIMIT_REACHED`, `AI_CREDITS_EXHAUSTED`, `STORAGE_LIMIT_REACHED`
- [x] Global error handler (`app.ts`): formats 402 as `{ status: "error", code, message, details: { upgradeUrl: "/pricing" } }`
- [x] `PaymentRequiredError` class added to `globalErrorHandler.ts` + `ErrorFactory.paymentRequired()`

---

### P6 — Payment Gateway ⛔ NOT DOING NOW

> **Do not build this.** Razorpay account is blocked. Payment collection is not part of the current build.
> Early paid users are upgraded manually via Prisma Studio (`user.plan = PRO`).
> Revisit when account is unblocked or a new gateway (Cashfree / PayU) is set up.

- [ ] `src/services/billing/razorpayService.ts`
- [ ] Wire `POST /billing/checkout` with actual payment
- [ ] `POST /webhooks/razorpay` — verify + handle events
- [ ] Frontend checkout sheet

---

## Phase 4.2 — Ask AI Persistence ✅ Complete

> Ask AI conversations persisted in PostgreSQL. History loaded on tab open, last 6 messages (3 exchanges) injected as OpenAI context for follow-up awareness. Clear endpoint wipes all messages.

- [x] `AskAIConversation` + `AskAIMessage` models added to `schema.prisma`, `pnpm db:push` run
- [x] `src/services/ai/askAIConversationService.ts` — `getOrCreateConversation`, `getMessages`, `appendMessage`, `clearMessages`
- [x] `GET /sma/meetings/:meetingId/ask/history` — returns messages array
- [x] `DELETE /sma/meetings/:meetingId/ask/history` — wipes conversation
- [x] `POST /sma/meetings/:meetingId/ask` — appends user message before stream, assistant message after; injects last 6 persisted messages as OpenAI conversation context

---

## Phase 4.3 — Two-way GCal Push Webhooks ✅ Complete

> Pull-based sync already existed. Phase 4.3 adds real-time push delivery via Google Calendar watch channels.
> All operations are fail-open — pull-based sync continues working even if push is unavailable.

### What was built

**P0 — Schema**
- [x] `GCalSyncState` model added to `schema.prisma` (`channelId @unique`, `resourceId`, `expiration`, `syncToken`)
- [x] `gcalSyncState GCalSyncState?` relation on `User`
- [x] `pnpm db:push` — database is in sync ✅

**P1 — Push Service** (`src/services/googleCalendarPushService.ts`)
- [x] `registerWatchChannel(userId)` — calls `calendar.events.watch()`, stores channelId/resourceId/expiry in GCalSyncState (upsert)
- [x] `stopWatchChannel(userId)` — calls `calendar.channels.stop()` + deletes GCalSyncState row
- [x] `refreshSyncToken(userId)` — fetches updated syncToken; handles 410 Gone with full re-sync
- [x] `processIncomingNotification(channelId)` — looks up userId by channelId, calls events.list(syncToken), passes to `syncLinkedMeetingsFromGooglePush`, updates syncToken
- [x] `renewExpiringChannels()` — finds GCalSyncState rows expiring in <5 days, stop+re-register

**P2 — Webhook Endpoint** (`src/routes/googleWebhookRoutes.ts`)
- [x] `POST /webhooks/google/calendar` — validates X-Goog-Channel-Token, ignores `state=sync` handshake, queues `gcal-push-sync` job, always 200
- [x] Rate-limited 60/min per IP
- [x] Registered in `indexRouter.ts` under `/webhooks`

**P3 — Bull Job**
- [x] `gcal-push-sync` job name added to `JobNames` + `GCalPushSyncJobData` interface
- [x] Job handler in `jobProcessor.ts` → calls `processIncomingNotification(channelId)`, fail-open (no retry)

**P4 — Connect/Disconnect Wiring**
- [x] `googleService.handleCalendarConnectCallback()` → calls `registerWatchChannel(userId)` after OAuth (fail-open)
- [x] `integrationController.disconnectGoogleCalendar()` → calls `stopWatchChannel(userId)` (fail-open)

**P5 — Channel Renewal Cron**
- [x] Daily cron at 02:00 UTC — calls `renewExpiringChannels()` via `gcal-push-sync:renewal` job

**P6 — Backfill for Existing Users**
- [x] `POST /integrations/google/calendar/push/register` (verifyJWT, 5/hr) → calls `registerWatchChannel`; returns `{ pushEnabled }`
- [x] Frontend auto-calls this on Settings > Integrations mount if `connected && !pushEnabled`

**Frontend**
- [x] `pushEnabled: boolean` added to `GCalConnectionStatus` type in `integrationsService.ts`
- [x] `registerGCalPushChannel()` API method added
- [x] `useRegisterGCalPushChannel()` mutation hook — fail-open (no error toast)
- [x] Settings > Integrations: auto-registers on mount + shows **"Real-time sync active"** badge when `pushEnabled === true`

---

## Phase 4.4 — Polish & First-Run Experience

> **Goal:** Backend tasks that unblock or support 4.4 frontend polish. Based on full product audit (2026-04-19).

### P0 — Schema fix

- [x] Add `isDeleted Boolean @default(false)` and `deletedAt DateTime?` to `CardContact` model
- [x] Run `pnpm db:push`
- [x] Update `cardService.ts` contact delete (`deleteContact`) to soft delete — set `isDeleted=true`, `deletedAt=now()` instead of `prisma.cardContact.delete()`
- [x] Update `cardService.ts` contact queries to filter `isDeleted: false`

---

## Phase 4.9 — In-App Notifications (Backend)

> Persist notifications to DB and push them live via SSE. Same triggers as existing Resend emails — no duplicate logic, just `createNotification()` called alongside each email send. Redis pub/sub drives real-time delivery. Always fail-open.

### P0 — Schema

- [x] `Notification` model
- [x] `NotificationType` enum: `BOOKING_RECEIVED | BOOKING_CONFIRMED | BOOKING_CANCELLED | BOOKING_REMINDER | MEETING_AI_COMPLETE | TASK_DUE_SOON`
- [x] Composite indexes: `@@index([userId, createdAt])` + `@@index([userId, isRead])`
- [x] Add to `UserSettings`: `inAppNotificationsEnabled Boolean @default(true)` (master), `inAppBookingEnabled Boolean @default(true)`, `inAppMeetingReadyEnabled Boolean @default(true)`, `inAppTaskDueEnabled Boolean @default(true)`
- [x] `pnpm db:migrate && pnpm db:generate`

### WebSocket Foundation

- [x] `src/websocket/types.ts` — `ExtendedWebSocket`, `WsServerMessage`, `WsClientMessage`
- [x] `src/websocket/connectionRegistry.ts` — `Map<userId, Set<ExtendedWebSocket>>` with add/remove/broadcast/size
- [x] `src/websocket/notificationSubscriber.ts` — one shared IORedis subscriber per instance, subscribe/unsubscribe per user, `publishNotification()`
- [x] `src/websocket/heartbeat.ts` — 30s ping/pong, terminates dead connections
- [x] `src/websocket/wsServer.ts` — origin validation, IP rate limit (30/60s), 5s auth timeout, Zod validation, readyState race guard, re-auth rejection
- [x] `src/index.ts` — `createWsServer(server)` + `closeWsServer()` on shutdown signals

### P1 — Notification Service

New file: `src/services/notificationService.ts`

- [x] `createNotification(userId, type, title, body?, entityType?, entityId?)` — checks user's `inApp*` preference for the type, inserts to DB, publishes to Redis channel `notify:${userId}`. Always fail-open (try/catch, log on error, never throws).
- [x] `listNotifications(userId, cursor?, limit=20)` — cursor pagination (createdAt DESC), filters `isDeleted: false`
- [x] `markRead(userId, notificationId)` — set `isRead: true, readAt: now()`. Ownership verified via userId in where.
- [x] `markAllRead(userId)` — `updateMany` where `userId + isRead: false + isDeleted: false`
- [x] `deleteNotification(userId, notificationId)` — soft delete. Ownership verified.
- [x] `getUnreadCount(userId)` — `count` where `userId + isRead: false + isDeleted: false`. Lightweight.

### P2 — Routes + Controller + Validator

- [x] `src/validators/notificationSchema.ts` — `listNotificationsSchema` (cursor, limit), `notificationIdParamSchema`
- [x] `src/controllers/notificationController.ts` — one method per endpoint, delegates to service
- [x] `src/routes/notificationRoutes.ts` — all behind `verifyJWT`:
  - `GET /notifications` — list (cursor pagination)
  - `GET /notifications/unread-count` — lightweight badge count
  - `PATCH /notifications/:id/read` — mark one read
  - `PATCH /notifications/read-all` — mark all read
  - `DELETE /notifications/:id` — soft delete one
- [x] Registered in `indexRouter.ts` under `/notifications`

### P3 — Real-time Delivery

> Replaced SSE plan with WebSocket (see WebSocket Foundation above). Redis pub/sub already wired — `publishNotification()` in `notificationSubscriber.ts` sends to the live WS connection. No separate SSE endpoint needed.

### P4 — Wire Triggers

Call `createNotification()` alongside each existing email send. Never replace emails — additive only.

- [x] `bookingManagementService.ts` — `confirmBooking()`: BOOKING_RECEIVED → host after booking emails, before return
- [x] `jobProcessor.ts` — BOOKING_REMINDER handler: BOOKING_REMINDER → host after reminder emails (added `id: true` to meeting select)
- [x] `jobProcessor.ts` — PROCESS_AI handler: MEETING_AI_COMPLETE → owner inside try block after email, before return
- [x] `jobProcessor.ts` + `queue.ts` — new TASK_DUE_SOON cron at 08:00 UTC: queries users with inApp pref enabled, sends one notification per user with N tasks due today (timezone-aware)

### P5 — Settings

- [x] `GET /settings/user` response — `inApp*` fields included via `SETTINGS_SELECT` in `userSettingsService.ts`
- [x] `PATCH /settings/user` — accepts + persists all 4 `inApp*` fields (added to Zod validator)

---

## Phase 5 — Encryption at Rest

> Full design spec: `../docs/internal/superpowers/specs/2026-05-16-encryption-at-rest-design.md`
> Implementation plan: `../docs/superpowers/plans/2026-05-22-encryption-at-rest.md`
> 95% of Phase 5 work lives in this repo.

**Scope:** Server-side envelope encryption for all sensitive at-rest content. KMS-managed KEK, per-user DEK, AES-256-GCM. Not E2EE — server holds keys so AI features (Summary, Ask AI, Big Brain) keep working unchanged.

**Three keys:** KEK (Google Cloud KMS, env-specific), DEK (per-user AES-256-GCM, KMS-wrapped in `User.wrappedDek`), HMAC_KEY (app secret for blind indexes, never leaves memory).

**Rollout:** Single-step — no dual-write, no feature flags. Backfill all data, verify, then migrate + deploy in one go.

### P0 — KMS foundations

- [x] Provision Cloud KMS keyrings + KEKs: `crelyzor-kek-dev`, `crelyzor-kek-staging`, `crelyzor-kek-prod` in `asia` multi-region
- [x] IAM bind backend service account to `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the KEK
- [x] Add env vars to `.env.example`: `KMS_PROVIDER`, `GCP_KMS_KEY_NAME`, `LOCAL_KMS_KEY`, `HMAC_BLIND_INDEX_KEY`
- [x] `LocalKmsProvider` + `GcpKmsProvider` — both implement `IKmsProvider`, toggled by `KMS_PROVIDER` (`src/utils/security/kmsProviders.ts`)
- [x] Document KMS setup, IAM bindings, key-naming conventions, and DR runbook in `docs/dev-notes/encryption.md`

### P1 — cryptoService module

- [x] `src/utils/security/crypto.ts` — `encrypt`, `decrypt`, `blindIndex`, `initDekForNewUser`, `encryptWithKey`, `decryptWithKey`
- [x] Ciphertext format: `version(1) | iv(12 random) | ciphertext | authTag(16)`
- [x] LRU DEK cache: `src/utils/security/dekCache.ts` (200 entries, 60s TTL, `node-cache`)
- [x] DEK versioning: `User.dekVersion`, `UserDekHistory` — old version byte enables rotation without re-encryption
- [x] Wire `initDekForNewUser` into Google OAuth signup `$transaction` (`src/controllers/googleController.ts`)
- [x] Unit tests (vitest): round-trip, tampered ciphertext throws, wrong-DEK throws, random IV, blind index determinism + normalisation, LocalKmsProvider wrap/unwrap, dekCache eviction

### P2 — Schema migration (single-step)

- [x] `User.wrappedDek Bytes?`, `User.dekVersion Int @default(1)`
- [x] `UserDekHistory` model with `@@unique([userId, version])`
- [x] All in-scope `String` columns changed to `Bytes?` directly (single-step — no shadow columns per decision #4)
- [x] Blind index columns: `emailBidx`, `phoneBidx` on `CardContact`; `guestEmailBidx` on `Booking` and `MeetingParticipant`
- [x] `pnpm db:migrate && pnpm db:generate`

### P3 — Backfill script

- [x] `src/scripts/phase5Backfill.ts` — idempotent, batched 500/txn, `--dry-run` flag
- [x] Phase 1: generate + KMS-wrap DEK for every user missing one
- [x] Phase 2: encrypt all in-scope rows; skip already-encrypted rows
- [x] Phase 3: verification sample — re-read + decrypt 500-row sample per model
- [x] Dry-run passed (0 users missing DEKs, no plaintext data remaining post single-step migration)
- [x] Real run passed: spot-checks green (1 OAuthAccount token + 3 TranscriptSegments decrypted correctly)

### P4 — Service-layer cutover

- [x] `transcriptionService` — encrypt `TranscriptSegment.text` + `MeetingTranscript.fullText` on write
- [x] `aiService` + `askAIConversationService` — encrypt `MeetingAISummary`, `MeetingAIContent`, `AskAIMessage.content`
- [x] `smaEditService` — encrypt/decrypt on segment and summary edits
- [x] `meetingService` — encrypt/decrypt `MeetingNote.content`, `MeetingParticipant.guestEmail`
- [x] `tasksService` — encrypt/decrypt `Task.description`
- [x] `cardService` — encrypt `CardContact.{email,phone,note}`; blind-index search on `emailBidx`
- [x] `bookingService` + `bookingManagementService` — encrypt `Booking.{guestEmail,guestNote}`
- [x] `googleCalendarService` — encrypt `OAuthAccount.{accessToken,refreshToken}`
- [x] `shareService` + `exportService` — decrypt transcript + summary for public/export reads
- [x] `searchService` — blind-index path for email search

### P5 — Logger hardening

- [x] PII denylist in `logFormatter.ts` — `redactPii()` replaces denylisted field values with `[REDACTED]` before JSON serialisation
- [x] Unit tests: all denylisted fields replaced, safe fields pass through, no mutation of original object

### P6 — GCS CMEK

- [x] Grant Cloud Storage service agent `roles/cloudkms.cryptoKeyEncrypterDecrypter` on all three KEKs (dev/staging/prod)
- [x] `gsutil kms encryption` set on `gs://crelyzor-dev`, `gs://crelyzor-staging`, `gs://crelyzor-prod`
- [x] All existing objects re-encrypted via `gcloud storage objects update --encryption-key --recursive`

### P7 — Schema migration + service deploy

- [x] Single-step migration done — in-scope columns are `Bytes?` directly (no shadow-column rename needed)
- [x] Service code deploys alongside schema (same PR/branch)
- [x] Monitor 7 days post-prod deploy: KMS audit logs healthy, no decrypt failures

### P8 — Crypto-shredding for account delete

- [x] `authService.deactivateAccount` destroys `UserDekHistory` rows + nulls `User.wrappedDek` in the same `$transaction`, then calls `evictDek(userId)`
- [x] Unit tests: post-evict cache returns undefined; ciphertext from shredded DEK cannot be decrypted with a new DEK

### P9 — Hardening + observability

- [x] KMS disaster-recovery runbook in `docs/dev-notes/encryption.md` (key destruction protection, regional failover, IAM hygiene checklist)
- [x] Cloud Monitoring alert created: policy `8638838345955756167` — KMS API requests > 100/hour triggers alert
- [x] Pre-encryption backup inventory ← skipped by design (no automated backups at current scale; revisit at Phase 6 / first paying customer)
- [x] DB dump spot-check: `grep -ic "<known plaintext snippet>"` against prod dump — clean

### P10 — Tests

- [x] Crypto unit tests: encrypt/decrypt round-trip, tampered ciphertext, wrong DEK, blind index, LRU cache, LocalKmsProvider
- [x] Crypto-shred unit tests: post-evict cache miss, ciphertext irrecoverable after shred
- [x] Logger PII redaction unit tests: denylist coverage, safe fields pass through

---

## Phase 6 — Teams (Backend)

> Full design spec: `../docs/internal/superpowers/specs/2026-05-09-teams-design.md`
> Depends on: Phase 5 (per-user DEK shipped). Phase 6 adds per-team DEK as an additive extension.

---

### P0 — Schema ✅ Complete (2026-05-29)

Migration: `20260529033811_phase6_teams_schema`. Partial unique index on `TeamInvite` and `SystemConfig` seed are in raw SQL appended to the Prisma-generated migration. Dev notes: `docs/dev-notes/phase-6-p0-teams-schema.md`.

- [x] **`SystemConfig` model** — key/value store editable from admin portal:
  ```prisma
  model SystemConfig {
    key       String   @id
    value     String
    updatedAt DateTime @updatedAt
    updatedBy String?
  }
  ```
- [x] **Seed SystemConfig defaults** (via migration seed):
  `max_teams_per_pro_user=3`, `max_teams_per_business_user=10`, `max_members_per_team=50`, `team_invite_expiry_days=7`.

- [x] **`Team` model** (note: `isDeleted + deletedAt` per project convention; `wrappedDek` + `dekVersion` for per-team encryption):
  ```prisma
  model Team {
    id          String    @id @default(uuid()) @db.Uuid
    name        String
    slug        String    @unique
    description String?
    ownerId     String    @db.Uuid
    owner       User      @relation(fields: [ownerId], references: [id])
    logoUrl     String?

    // Phase 6 encryption — per-team DEK (envelope encryption, KMS-wrapped)
    wrappedDek  Bytes
    dekVersion  Int       @default(1)
    dekHistory  TeamDekHistory[]

    members     TeamMember[]
    invites     TeamInvite[]
    isDeleted   Boolean   @default(false)
    deletedAt   DateTime?
    createdAt   DateTime  @default(now())
    updatedAt   DateTime  @updatedAt

    @@index([ownerId])
    @@index([slug])
    @@index([ownerId, isDeleted])
  }
  ```

- [x] **`TeamMember` model** — no `leftAt`; soft-delete handles "left/removed":
  ```prisma
  model TeamMember {
    id        String    @id @default(uuid()) @db.Uuid
    teamId    String    @db.Uuid
    team      Team      @relation(fields: [teamId], references: [id])
    userId    String    @db.Uuid
    user      User      @relation(fields: [userId], references: [id])
    role      TeamRole  @default(MEMBER)
    joinedAt  DateTime  @default(now())
    isDeleted Boolean   @default(false)
    deletedAt DateTime?

    @@unique([teamId, userId])
    @@index([userId, isDeleted])
    @@index([teamId, isDeleted])
    @@index([teamId, role, isDeleted])
  }

  enum TeamRole {
    OWNER
    ADMIN
    MEMBER
  }
  ```

- [x] **`TeamInvite` model**:
  ```prisma
  model TeamInvite {
    id          String    @id @default(uuid()) @db.Uuid
    teamId      String    @db.Uuid
    team        Team      @relation(fields: [teamId], references: [id])
    email       String
    userId      String?   @db.Uuid                // set if invitee already has an account
    role        TeamRole                           // ADMIN | MEMBER — never OWNER
    token       String    @unique                  // 32-byte random hex
    invitedById String    @db.Uuid
    expiresAt   DateTime
    acceptedAt  DateTime?
    declinedAt  DateTime?
    cancelledAt DateTime?
    isDeleted   Boolean   @default(false)
    deletedAt   DateTime?
    createdAt   DateTime  @default(now())

    @@unique([teamId, email, isDeleted])           // one open invite per email per team
    @@index([token])
    @@index([email, isDeleted])
    @@index([teamId, isDeleted])
  }
  ```

- [x] **`TeamDekHistory` model** — mirrors `UserDekHistory`; append-only on rotation; hard cascade on team delete for crypto-shred guarantee. No `isDeleted`/`deletedAt` (same reasoning as `UserDekHistory`).
  ```prisma
  model TeamDekHistory {
    id         String   @id @default(uuid()) @db.Uuid
    teamId     String   @db.Uuid
    version    Int
    wrappedDek Bytes
    createdAt  DateTime @default(now())
    team       Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

    @@unique([teamId, version])
    @@index([teamId])
  }
  ```

- [x] **Add `teamId UUID?` + index** to: `Meeting`, `Card`, `Task`, `EventType`, `Booking`, `UserUsage`.
  Each gets `@@index([teamId, isDeleted])` (or `@@index([teamId])` for models without `isDeleted`).
- [x] **Migration:** `pnpm db:migrate && pnpm db:generate`.

---

### P1 — Team CRUD Endpoints ✅ Complete (2026-05-29)

New: `src/routes/teamRoutes.ts`, `src/controllers/teamController.ts`, `src/services/teamService.ts`, `src/validators/teamSchema.ts`. All under `verifyJWT`. Dev notes: `docs/dev-notes/phase-6-p1-team-crud.md`.

- [x] `POST /teams` — create team. Plan gate (FREE rejected) + SystemConfig team-count limit + Postgres advisory lock (closes TOCTOU). KMS-wrap-before-tx; raw DEK zeroed in finally. Transaction: insert Team + TeamDekHistory v1 + OWNER TeamMember (nested create). Post-commit fail-open auto Card with `slug = team-<team-slug>` (avoids `Card @@unique([userId, slug])` collision with owner's personal card); HTML rendering deferred to first PATCH on the card.
- [x] `GET /teams` — list active memberships, include role + `teamPublicSelect` (never exposes `wrappedDek`/`dekVersion`).
- [x] `PATCH /teams/:teamId` — Admin+; slug change Owner-only at the service layer (not in Zod, so internal callers can't bypass). Non-members get 404 (no enumeration oracle).
- [x] `DELETE /teams/:teamId` — Owner-only soft delete. Cascades soft-delete to TeamMember + team Cards. Hard delete + crypto-shred deferred to retention job.
- [x] `POST /teams/:teamId/transfer-ownership` — Owner-only. Self-target rejected (400). Loads team inside tx and compares `teamNameConfirm` against live name. Target must be an active member with an active user. Roles swapped (old → ADMIN, new → OWNER), team Cards reassigned.

> Hard delete + crypto-shred for soft-deleted teams happens via the existing retention job (extend it to also handle `Team` after `HARD_DELETE_ENABLED` retention window). Hard delete cascades `TeamDekHistory` automatically.

---

### P2 — Team Member + Invite Management

- [x] `GET /teams/:teamId/members` — base shipped 2026-05-29 (commit 7b8abf4, bundled with P0–P3). Returns active members + role + joinedAt, sorted by role rank then joinedAt. Lives in `teamMemberService.listMembers`. **Two enrichments from the original spec moved to their natural homes:** last-active from WS presence → tracked with the existing P4.9 WS infrastructure (unscoped follow-up); per-member usage summary → P5.8 (Usage endpoint, where the `UserUsage.groupBy([userId, teamId])` schema restructure lives).
- [x] `POST /teams/:teamId/members/invite` — Admin+; discriminated union (mode=user|email); team advisory lock + member-cap pre-check; 200 with `{created, skipped}` payload + per-row `emailSent` flag; sync Resend (fail-open, matches existing pattern). ✅ (2026-05-29) — Dev notes: `docs/dev-notes/phase-6-p2b-team-invites.md`
- [x] `GET /teams/:teamId/invites` — Admin+; pending only.
- [x] `POST /teams/:teamId/invites/:inviteId/resend` — Admin+; bumps expiresAt from live SystemConfig; resends email.
- [x] `DELETE /teams/:teamId/invites/:inviteId` — Admin+; rejects already-accepted (400 with remove-member hint).
- [x] `GET /invites/:token` — public, no auth. Returns `{team: {name, logoUrl}, role, inviter: {name FIRST-NAME-ONLY}, expiresAt}` only — drops slug and email. 410 on expired.
- [x] `POST /invites/:token/accept` — JWT; NFKC-normalised email-match guard; atomic accept (mark invite + upsert TeamMember preserving original `joinedAt` on re-join); post-commit fail-open team-card creation.
- [x] `POST /invites/:token/decline` — JWT; same email-match guard; sets declinedAt + isDeleted.
- [x] `POST /teams/:teamId/invites/accept` — JWT; lookup by `OR: [email = actor.email, userId = actor.id]` to support both invite modes.
- [x] `POST /teams/:teamId/invites/decline` — JWT; same lookup.
- [x] `PATCH /teams/:teamId/members/:userId` — Owner-only role change with `FOR UPDATE` row lock; OWNER excluded from Zod enum (transfer-ownership is the only path); self-block + belt-and-suspenders target.role check. ✅ (2026-05-29) — Dev notes: `docs/dev-notes/phase-6-p2a-team-members.md`
- [x] `DELETE /teams/:teamId/members/:userId` — Admin+; Owner protected; self-target rejected with /leave hint; soft-deletes member + their team Cards (scoped to `userId = target`). ✅ (2026-05-29)
- [x] `DELETE /teams/:teamId/leave` — Owner blocked with transfer-ownership hint; re-verifies team existence inside tx (TOCTOU vs concurrent deleteTeam). ✅ (2026-05-29)

---

### P3 — Encryption: per-team DEK ✅ Complete (2026-05-29)

Dev notes: `docs/dev-notes/phase-6-p3-per-team-dek.md`. Files: `src/utils/security/crypto.ts`, `src/utils/security/dekCache.ts`, `src/services/teamService.ts`, `src/utils/security/__tests__/cryptoPrincipal.test.ts`.

- [x] Extend `cryptoService.getDek()` to accept `Principal = { type: 'user' | 'team', id: string }`. Backward-compatible string overload routes to `{ type: 'user', id }` via `toPrincipal()`.
- [x] DEK cache key is `${type}:${id}:${version}` with trailing-colon eviction prefix (prefix-boundary test asserts `team:abc1` does not evict `team:abc123:*`).
- [x] Encrypt/decrypt helpers accept Principal-or-string. JSDoc nudges new code to the explicit Principal form so P5 team-scoped writes don't silently default to user DEK.
- [ ] Bull job payload schemas updated to carry `{ userId, teamId? }`. → **Moved to P4** (bundled with `getQuotaOwner` resolver).
- [x] Crypto unit tests added: principal isolation, prefix-boundary eviction, multi-version eviction, KMS-failure rawDek zeroing, plus string-overload safety. All 35 security tests green (25 existing + 10 new).
- [ ] `keyRotationService` extended to rotate team DEKs on demand. → **Deferred to P9** (admin endpoint not in P3 scope per spec).
- [x] Backfill: not required — existing rows have `teamId = null` and stay on user DEK.
- [x] `generateAndWrapDek()` extracted helper — zeroes rawDek on KMS failure, caller owns success-path zeroing. Used by `initDekForNewUser` + `teamService.createTeam`.
- [x] Team-DEK-null path throws `AppError 500` + `logger.error("team.dek.missing", { teamId })` (fail closed; never falls back to user DEK).

---

### P4 — Context Middleware + Quota Resolver ✅ Plumbing complete (2026-05-29)

Dev notes: `docs/dev-notes/phase-6-p4-team-context-middleware.md`. Files: `src/middleware/{authMiddleware,teamContext,resolveTeamContext,verifyTeamRole}.ts`, `src/services/billing/quotaService.ts`, `src/services/billing/__tests__/quotaService.test.ts`, `src/config/queue.ts`.

- [x] **`resolveTeamContext`** — reads `X-Team-Id`; null on absent; 400 on bad UUID; 403 (identical body) on non-member / soft-deleted / missing team; populates `req.teamContext`.
- [x] **`verifyTeamRole(minRole)`** — factory: `'ADMIN'` allows ADMIN + OWNER, `'OWNER'` allows OWNER only. Uses `getTeamContext` typed accessor (throws if `resolveTeamContext` is not mounted upstream).
- [ ] **`verifyTeamMember`** — **dropped.** `/teams/:teamId/*` controllers keep their inline `getRole` pattern from P1/P2 — one source of truth instead of two parallel patterns.
- [x] **`getQuotaOwner({ userId, teamId?, req? })`** → `Promise<string>` — returns ownerId or userId; fail-loud on missing/soft-deleted team (no silent fallback to per-user actor). Request-scoped memoization via `req[Symbol.for("crelyzor.teamQuotaCache")]`.
- [ ] **Wire `getQuotaOwner` into transcription/AI/storage/Recall metering** — **deferred to per-service P5 sub-tasks** (P5.1 wires meetings/transcription/AI; P5.7 wires Recall webhooks). Follows P3 precedent of deferring caller cutover to P5.
- [ ] **`UserUsage` `groupBy(['userId','teamId'])`** — **deferred to P5.8** (Usage endpoint). The multi-row-per-user restructure needs `userId @unique` dropped + compound `@@unique([userId, teamId])`; that schema debate belongs with the breakdown endpoint, not the middleware.
- [x] Bull job interfaces (`TranscriptionJobData`, `AIProcessingJobData`, `RecallBotJobData`, `RecallRecordingJobData`, `BookingReminderJobData`) gain optional `teamId?: string`. Header comment documents worker contract: must call `getQuotaOwner` at job start; never trust a `teamId` without re-resolving.
- [x] 7 vitest cases (`getQuotaOwner` 4 branches + per-request cache + Request-isolation); full security suite 47/47 green.

---

### P5 — Team-scoped Content (split per service)

Each sub-task is a single PR scope.

- [x] **P5.1 Meetings ✅ Complete (2026-05-29)** — split into 5.1.a / 5.1.b / 5.1.c, all shipped:
  - [x] **5.1.a — Core CRUD + creation** (2026-05-29) — `resolveTeamContext` mounted on `/meetings`; `meetingScope` + `principalForMeeting` + `verifyMeetingAccess` helpers; create/list/get/update/delete/cancel/complete + ICS gate. MEMBER participant-allowlist on createMeeting/updateMeeting. Bull RecallBotJobData carries teamId. Dev notes: `docs/dev-notes/phase-6-p5-1a-meetings-core.md`.
  - [x] **5.1.b — Simple nested** (2026-05-29) — `assertMeetingAccess` exported; `resolveTeamContext` mounted on smaRoutes; attachmentService + shareService + tagService meeting-bits + aiController notes use the shared gate. Notes encryption stays under author DEK (per-author privacy, even on team meetings). Dev notes: `docs/dev-notes/phase-6-p5-1b-meetings-nested.md`.
  - [x] **5.1.c — AI/transcript content + metering** (2026-05-29) — both halves shipped:
    - [x] **5.1.c.i** — usageService accepts `{teamId}` opts (all 5 functions), getQuotaOwner resolves payer inside; transcriptionService + smaEditService encrypt under principalForMeeting; jobProcessor (Recall handlers + TRANSCRIBE) carries teamId. Dev notes: `docs/dev-notes/phase-6-p5-1c-i-metering-transcript-encryption.md`.
    - [x] **5.1.c.ii** — aiService 18 encrypt/decrypt sites (generateSummary, extractKeyPoints, generateSummaryAndKeyPoints, extractTasks, processTranscriptWithAI orchestrator, askAI, generateContent, getGeneratedContents) + askAIConversationService (2 sites: getMessages + appendMessage signature change) all use principalForMeeting; `checkAndDeductCredits` at the 2 aiService call sites threads `{ teamId: meeting.teamId }`. Dev notes: `docs/dev-notes/phase-6-p5-1c-ii-ai-encryption.md`.
- [x] **P5.2 Cards ✅ Complete (2026-05-30)** — split into 5.2.a / 5.2.b, both shipped:
  - [x] **5.2.a — Card CRUD + public submitContact encryption** (2026-05-29) — `resolveTeamContext` mounted on `/cards`; `cardScope` + `principalForCard` + `verifyCardAccess` + `assertCardAccess` helpers; createCard MEMBER-reject + writes teamId; getUserCards uses cardScope (closes personal-list leak); single-fetch getCardById; updateCard/deleteCard/duplicateCard via assertCardAccess; submitContact encrypts under principalForCard(card). Strict Zod on create/update schemas. Dev notes: `docs/dev-notes/phase-6-p5-2a-cards-core.md`.
  - [x] **5.2.b — Contacts list / analytics / multi-card paths** (2026-05-30) — `contactScope` helper + `MAX_IMPORT_ROWS = 5000` cap; getContacts/exportContacts use contactScope with per-row `principalForCard` decrypt; updateContactTags + deleteContact gate via `verifyCardAccess(mutate)`, updateContactTags returns DECRYPTED payload (security review); importContactsFromCsv via `assertCardAccess(mutate)`; getCardAnalytics via `assertCardAccess(read)`; getCardMeetings via `assertCardAccess(read)` + meeting-level scope `{OR: [{teamId: ctx.teamId}, {createdById: actor}]}` (closes cross-tenant meeting leak). Dev notes: `docs/dev-notes/phase-6-p5-2b-cards-contacts.md`.
- [x] **P5.3 Tasks ✅ Complete (2026-05-30)** — `taskScope` + `principalForTask` + `verifyTaskAccess` + `assertTaskAccess` helpers; 9 method retrofits (getAllTasks/getTasks/createTask/createStandaloneTask/updateTask/deleteTask/reorderTasks/getSubtasks/createSubtask); inherit-teamId-from-linked-entity on creates; cross-scope rejection on standalone linked entities; per-row audit log in reorderTasks (ADMIN reordering MEMBER tasks); recurring spawn carries explicit teamId; deleteTask cascade drops userId filter (no orphan subtasks); `decryptTaskDescriptions` per-row principal derivation; `aiService.extractTasks` writes `teamId: meetingMeta.teamId` (fixes P5.1.c.ii silent decrypt bug); idempotent backfill migration `20260530000000_phase6_p5_3_backfill_ai_extracted_task_teamid` heals existing AI-extracted rows. Dev notes: `docs/dev-notes/phase-6-p5-3-tasks.md`.
- [x] **P5.4 Scheduling ✅ Complete (2026-05-30)** — split into 5.4.a / 5.4.b / 5.4.c, all shipped:
  - [x] **5.4.a — EventTypes team-scoping** (2026-05-30) — `resolveTeamContext` mounted on `/scheduling`; `eventTypeScope` + `verifyEventTypeAccess` + `assertEventTypeAccess` helpers; `assertAvailabilityScheduleOwned` cross-tenant guard (actor pool on create, owner pool on update); `assertMemberMeetingLinkAllowed` blocks MEMBER from setting/changing meetingLink (privilege-escalation guard); TOCTOU defence via `teamId` in update/delete where clauses; MEMBER may create own team event types (asymmetric vs createCard, per team-scheduling design); EVENT_TYPE_SELECT exposes teamId for frontend scope badges. Dev notes: `docs/dev-notes/phase-6-p5-4a-event-types.md`.
  - [x] **5.4.b — Booking management team-scoping** (2026-05-30) — pure helpers extracted to `bookingPrincipal.ts` (no Prisma deps); bookingScope + principalForBooking + verifyBookingAccess + BOOKING_NOT_FOUND_MESSAGE; assertBookingAccess stays in bookingManagementService (Prisma-coupled); 4 method retrofits with gate-BEFORE-status (enumeration-oracle fix); actor/host split — host owns GCal/Recall/Prepare-Task/emails/notifications under team ctx; Recall bot + reminder jobs carry teamId; audit logs: booking.confirm / decline / cancel with {actorId, targetUserId, teamId, bookingId, action}; forward-compat decrypt switch in cancelBookingAsGuest + getPublicBooking + worker BOOKING_REMINDER handler; DB-layer TOCTOU defence via teamId in update where. Dev notes: `docs/dev-notes/phase-6-p5-4b-booking-management.md`.
  - [x] **5.4.c — Public booking creation + scheduleService + slot engine** (2026-05-30) — createBooking derives `bookingPrincipal` from resolved EventType, writes Booking.teamId + Meeting.teamId, encrypts guest PII (Booking + MeetingParticipant) under it; `ensureBookingMeetingParticipants` signature takes explicit Principal arg; scheduleService intentional no-op (schedules user-owned per design); slot engine unchanged per spec. Dev notes: `docs/dev-notes/phase-6-p5-4c-public-booking-creation.md`.
- [x] **P5.5 Tags ✅ Complete (2026-05-30)** — split into 5.5.a / 5.5.b, both shipped:
  - [x] **5.5.a — Tag schema + CRUD + listTags + getTagItems + junction bridge** (2026-05-30) — `Tag.teamId String?` + Team relation; partial unique indexes (`Tag_user_personal_unique` + `Tag_team_unique`) replace `@@unique([userId, name])` so personal + team "Urgent" co-exist; `tagScope` + `verifyTagAccess` + `assertTagAccess` (exported) helpers; 5 CRUD retrofits with `updateMany`-based TOCTOU defence; workspace-wide counts under team ctx; MEMBER may create team tags (asymmetric vs createCard); MAX_TAGS_PER_TEAM = 500 cap; mutate→404 (not 403) for MEMBERs on team tags; 12 junction handlers bridge-fix tag-side to `assertTagAccess(read)`. Migration `20260530064513_phase6_p5_5a_tag_team_scoping` applied. Dev notes: `docs/dev-notes/phase-6-p5-5a-tag-team-scoping.md`.
  - [x] **5.5.b — Junction entity-side gate swap + cross-scope guard** (2026-05-30) — NEW `src/services/tasks/taskAccess.ts` pure module (taskScope / principalForTask / verifyTaskAccess / assertTaskAccess extracted from taskController); `verifyCardOwnership` → `assertCardAccess(read)` in card-tag; `verifyTaskOwnership` → `assertTaskAccess(read)` in task-tag; contact-tag through `assertCardAccess` + `verifyContactBelongsToCard` (cardId now passed from controller); `assertTagEntityScopeMatch` cross-scope guard (400 with "different scope" on mismatch); canonical `tag.attach` / `tag.detach` audit logs with `{actorId, tagId, entityType, entityId, teamId}`; legacy verify* funcs deleted. Dev notes: `docs/dev-notes/phase-6-p5-5b-tag-junctions.md`.
- [x] **P5.6 SMA + AI ✅ Complete (2026-05-30)** — audit + fix pass over the AI surface. P5.1.c.ii had retrofitted encryption to use principalForMeeting but the access gates + decrypt principals at every reader were still actor-scoped. P5.6 closes both gaps: `aiService.loadMeetingMeta` refactored to use `assertMeetingAccess` when teamContext is provided (worker path keeps legacy `createdById = userId` filter via undefined default); 9 aiService method signatures grow optional `teamContext`; aiController has 5 inline gates swapped to `assertMeetingAccess` + 3 decrypt-principal bug fixes (getSummary, regenerateSummary, regenerateTitle previously decrypted with `userId` but aiService writes under `principalForMeeting` → team-meeting summaries silently failed to render); askAIConversationService unchanged (per-(userId, meetingId) row model already isolates members). Worker call site unchanged. Dev notes: `docs/dev-notes/phase-6-p5-6-sma-ai-team-access.md`.
- [x] **P5.7 Recall webhooks ✅ Complete (2026-05-30)** — single-file fix in `recallWebhookController.handleStatusChange`. Meeting select extended with `teamId`; `handleStatusChange` signature gains `teamId: string | null`; FETCH_RECALL_RECORDING job payload spreads `...(teamId ? { teamId } : {})`. Chain is now complete end-to-end: webhook → FETCH_RECALL_RECORDING (deductRecall with teamId) → TRANSCRIBE (checkTranscription with teamId) → Deepgram quota. Pre-P5.7 chain hops already wired in P5.1.c + P5.4.b — webhook was the only missing producer. Dev notes: `docs/dev-notes/phase-6-p5-7-recall-webhook-team-attribution.md`.
- [x] **P5.8 Usage endpoint ✅ Complete (2026-05-30)** — UserUsage scope split (drop `userId @unique`, add partial uniques `UserUsage_user_personal_unique` + `UserUsage_user_team_unique`); `User.usage` relation now `UserUsage[]`; `getOrCreateScopedUsage` + `getAggregateUsage` helpers; aggregate-for-check / scoped-for-deduct refactor across every check/deduct site; `getUserUsage` returns aggregate + personal-row reset cycle for billing UI back-compat; admin `resetUserUsage` → `updateMany`; NEW `GET /teams/:teamId/usage` endpoint via `teamUsageService.getTeamUsage` + ADMIN/OWNER-only controller (MEMBER → 404). Migration `20260530082833_phase6_p5_8_user_usage_scope_split` applied. Dev notes: `docs/dev-notes/phase-6-p5-8-user-usage-scope-split.md`.

---

### P6 — Public Team Endpoints ✅ Complete (2026-05-30)

Dev notes: `docs/dev-notes/phase-6-p6-public-team-endpoints.md`.

- [x] `GET /public/teams/:slug` — no auth. Team metadata + active member roster (id/name/username/avatar/role/teamCard) + memberCount stat. Excludes soft-deleted teams + users + members. Sorted by role rank then joinedAt. No emails.
- [x] `GET /public/scheduling/team/:slug/profile` — team metadata + bookable members only (have ≥ 1 active team event type + scheduling enabled + username set). Filters out members without bookable surface to avoid dead UI tiles.
- [x] `GET /public/scheduling/team/:slug/:username` — specific member's team-scoped EventTypes only (filtered by `teamId = team.id`). Uniform 404 across all failure modes (team missing / user missing / no username / not an active member / scheduling disabled).
- [x] Slot engine unchanged — existing `/public/scheduling/slots/:username/:eventTypeSlug` resolves team event types automatically via the per-user slug uniqueness. Confirmed per spec.

---

### P7 — WebSocket Events ✅ Complete (2026-05-30)

Dev notes: `docs/dev-notes/phase-6-p7-team-websocket-events.md`.

- [x] `TEAM_INVITE_RECEIVED` — emitted to invitee on user-mode invite. Email-only invites skipped (the email is the notification).
- [x] `TEAM_MEMBER_JOINED` — emitted to all active team members on acceptance; joiner excluded via `opts.excludeUserId`.
- [x] `TEAM_MEMBER_LEFT` — emitted to remaining members on removal (`leftBy: "removed"`) and self-leave (`leftBy: "self"`).
- [x] `TEAM_MEMBER_ROLE_CHANGED` — emitted to team; actor excluded.
- [x] `TEAM_MEETING_BOOKED` — emitted to all team members on confirmBooking when `booking.teamId !== null`.

Implementation:
- `notify:${userId}` Redis channel now carries the full `WsServerMessage` envelope (notifications + team events).
- `publishToUser(userId, msg)` is the canonical publish primitive; `publishNotification` wraps with `{type: "NOTIFICATION", data}` for back-compat.
- NEW `teamEventService.ts` with 5 publishers + a `broadcastToTeam` helper with optional `excludeUserId`.
- All publishes happen post-commit and fail-open (logged, never thrown).

---

### P8 — Admin API ✅ Complete (2026-05-30)

Dev notes: `docs/dev-notes/phase-6-p8-admin-api.md`.

Routes under `verifyAdmin` in `src/routes/adminRoutes.ts`:

- [x] `GET /admin/config` — returns all SystemConfig entries grouped by category (key prefix before `_`).
- [x] `PATCH /admin/config/:key` — upserts with `{value: string}`. `updatedBy = req.adminId`. Audit log: `admin.config.update` with `{adminId, key, previousValue, value}`.
- [x] `GET /admin/teams?include_deleted=false&search=&page=&pageSize=` — paginated list with owner email + memberCount + isDeleted. ILIKE search on name/slug.
- [x] `GET /admin/teams/:teamId` — full detail: owner, active + departed members (role/joinedAt/deletedAt), pending invites.
- [x] `DELETE /admin/teams/:teamId` — admin override soft-delete; cascades to members + cards in a transaction. Audit log: `admin.team.delete`.
- [x] `PATCH /admin/users/:userId/plan` — already existed; improved to capture `previousPlan` + adminId. Audit log: `admin.user.plan.update`.

Audit strategy: structured `logger.info` lines (matches existing `booking.confirm` / `tag.attach` patterns) + SystemConfig.updatedBy column. No separate AuditLog model.

---

## Phase 7 — Razorpay ⛔ BLOCKED

Account blocked. Env vars already in `.env.example` (commented out). Do not start.

---

## Phase 8 — Big Brain ⛔ BLOCKED

Requires separate infrastructure (vector DB) + Phase 5 (Encryption at Rest) live in prod. Do not start.

- [ ] Vector embeddings pipeline
- [ ] RAG query endpoint (global Ask AI)
- [x] ~~Model upgrades: `nova-2` → `nova-3`, `gpt-4o-mini` → `gpt-5.4-mini`~~ — done early at Phase 4 start
