# calendar-backend — Task List

Last updated: 2026-05-22 (Phase 4.9 complete ✅ — In-App Notifications + WebSocket foundation shipped)

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
- [ ] IAM bind backend service account to `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the KEK ← pending: need backend service account email
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
- [ ] Run dry-run against staging snapshot ← ops step when staging is up
- [ ] Run for real against staging, then prod (off-hours) ← ops step

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
- [ ] Monitor 7 days post-prod deploy: KMS audit logs healthy, no decrypt failures ← ongoing

### P8 — Crypto-shredding for account delete

- [x] `authService.deactivateAccount` destroys `UserDekHistory` rows + nulls `User.wrappedDek` in the same `$transaction`, then calls `evictDek(userId)`
- [x] Unit tests: post-evict cache returns undefined; ciphertext from shredded DEK cannot be decrypted with a new DEK

### P9 — Hardening + observability

- [x] KMS disaster-recovery runbook in `docs/dev-notes/encryption.md` (key destruction protection, regional failover, IAM hygiene checklist)
- [x] Cloud Monitoring alert created: policy `8638838345955756167` — KMS API requests > 100/hour triggers alert
- [ ] Pre-encryption backup inventory ← no automated backups at current scale, revisit at Phase 6
- [ ] DB dump spot-check: `grep -ic "<known plaintext snippet>"` against prod dump ← ops step post-deploy

### P10 — Tests

- [x] Crypto unit tests: encrypt/decrypt round-trip, tampered ciphertext, wrong DEK, blind index, LRU cache, LocalKmsProvider
- [x] Crypto-shred unit tests: post-evict cache miss, ciphertext irrecoverable after shred
- [x] Logger PII redaction unit tests: denylist coverage, safe fields pass through
- [ ] Integration test: full meeting lifecycle with encryption on a live DB ← requires seeded staging DB

---

## Phase 6 — Teams (Backend)

> Full design spec: `../docs/internal/superpowers/specs/2026-05-09-teams-design.md`
> Depends on: Phase 5 (per-user DEK shipped). Phase 6 adds per-team DEK as an additive extension.

---

### P0 — Schema (do first — everything depends on this)

- [ ] **`SystemConfig` model** — key/value store editable from admin portal:
  ```prisma
  model SystemConfig {
    key       String   @id
    value     String
    updatedAt DateTime @updatedAt
    updatedBy String?
  }
  ```
- [ ] **Seed SystemConfig defaults** (via migration seed):
  `max_teams_per_pro_user=3`, `max_teams_per_business_user=10`, `max_members_per_team=50`, `team_invite_expiry_days=7`.

- [ ] **`Team` model** (note: `isDeleted + deletedAt` per project convention; `wrappedDek` + `dekVersion` for per-team encryption):
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

- [ ] **`TeamMember` model** — no `leftAt`; soft-delete handles "left/removed":
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

- [ ] **`TeamInvite` model**:
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

- [ ] **`TeamDekHistory` model** — mirrors `UserDekHistory`; append-only on rotation; hard cascade on team delete for crypto-shred guarantee. No `isDeleted`/`deletedAt` (same reasoning as `UserDekHistory`).
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

- [ ] **Add `teamId UUID?` + index** to: `Meeting`, `Card`, `Task`, `EventType`, `Booking`, `UserUsage`.
  Each gets `@@index([teamId, isDeleted])` (or `@@index([teamId])` for models without `isDeleted`).
- [ ] **Migration:** `pnpm db:migrate && pnpm db:generate`.

---

### P1 — Team CRUD Endpoints

New: `src/routes/teamRoutes.ts`, `src/controllers/teamController.ts`, `src/services/teamService.ts`. All under `verifyJWT`.

- [ ] `POST /teams` — create team. Plan gate (`user.plan IN ('PRO','BUSINESS')`). Team count check by plan key. Transaction:
  1. Generate team DEK via KMS, get `wrappedDek`.
  2. Insert `Team` with `wrappedDek`, `dekVersion=1`.
  3. Insert `TeamDekHistory` row for version 1.
  4. Insert OWNER `TeamMember`.
  5. Auto-create team `Card` with `userId = ownerId`, `teamId = team.id`.
- [ ] `GET /teams` — list teams the authenticated user is active in (`TeamMember.isDeleted = false`). Include role.
- [ ] `PATCH /teams/:teamId` — update name (Admin), slug (Owner only), logo (Admin), description (Admin). `verifyTeamRole('ADMIN')` baseline; controller checks Owner for slug.
- [ ] `DELETE /teams/:teamId` — soft delete (Owner only). Transaction: set `Team.isDeleted=true, deletedAt=now()`, set all `TeamMember.isDeleted=true, deletedAt=now()`, soft-delete team Cards.
- [ ] `POST /teams/:teamId/transfer-ownership` — Owner only. Body `{ newOwnerId, teamNameConfirm }`. Transaction: flip `Team.ownerId`, swap roles (old → ADMIN, new → OWNER), reassign team Cards' `userId = newOwnerId`.

> Hard delete + crypto-shred for soft-deleted teams happens via the existing retention job (extend it to also handle `Team` after `HARD_DELETE_ENABLED` retention window). Hard delete cascades `TeamDekHistory` automatically.

---

### P2 — Team Member + Invite Management

- [ ] `GET /teams/:teamId/members` — active members + role + last-active (from WS presence) + per-member usage summary. `verifyTeamMember`.
- [ ] `POST /teams/:teamId/members/invite` — `verifyTeamRole('ADMIN')`. Body: `{ mode: 'user'|'email', userId?, emails?: string[], role: 'ADMIN'|'MEMBER', message?: string }`. Member count check vs. `max_members_per_team`. For `mode=user`: insert `TeamInvite` + WS event `TEAM_INVITE_RECEIVED`. For `mode=email`: insert one `TeamInvite` per email, queue Bull email job per invite. Returns invites created.
- [ ] `GET /teams/:teamId/invites` — list pending invites. Admin/Owner.
- [ ] `POST /teams/:teamId/invites/:inviteId/resend` — bump `expiresAt`, re-queue email job. Admin/Owner.
- [ ] `DELETE /teams/:teamId/invites/:inviteId` — set `cancelledAt`, `isDeleted=true`. Admin/Owner.
- [ ] `GET /invites/:token` — public (no auth). Validate token + return team info `{ team: { name, slug, logoUrl }, role, inviter: { name }, expiresAt }`. 404 on invalid/cancelled/declined, 410 on expired.
- [ ] `POST /invites/:token/accept` — requires JWT. Transaction: mark `TeamInvite.acceptedAt`, create `TeamMember`, auto-create team Card for the new member, emit `TEAM_MEMBER_JOINED`.
- [ ] `POST /invites/:token/decline` — requires JWT (or unauthenticated for email link variant?). Set `declinedAt`.
- [ ] `POST /teams/:teamId/invites/accept` — accept in-app invite for existing user (uses authed user's email to match invite). Same transaction as above.
- [ ] `POST /teams/:teamId/invites/decline` — in-app decline.
- [ ] `PATCH /teams/:teamId/members/:userId` — `verifyTeamRole('OWNER')`. Change role. Cannot change own role. Emit `TEAM_MEMBER_ROLE_CHANGED`.
- [ ] `DELETE /teams/:teamId/members/:userId` — `verifyTeamRole('ADMIN')`. Set `TeamMember.isDeleted=true, deletedAt=now()`, soft-delete their team Card. Cannot remove Owner. Emit `TEAM_MEMBER_LEFT`.
- [ ] `DELETE /teams/:teamId/leave` — blocked if caller is Owner. Same as above for self.

---

### P3 — Encryption: per-team DEK

- [ ] Extend `cryptoService.getDek()` to accept `Principal = { type: 'user' | 'team', id: string }`. Add a backward-compatible string overload that resolves to `{ type: 'user', id }`.
- [ ] DEK cache key becomes `${principal.type}:${principal.id}`. Existing LRU keeps capacity; entries shared across user + team principals.
- [ ] Encrypt/decrypt helpers (`encryptField`, `decryptField` etc.) accept a `row` or explicit principal — pick `{ type: 'team', id: row.teamId }` when `row.teamId` is set, else `{ type: 'user', id: row.userId }`.
- [ ] Bull job payload schemas updated to carry `{ userId, teamId? }`. Workers call `getDek` with the right principal.
- [ ] Crypto unit tests for: team principal encrypt/decrypt roundtrip, cache eviction across principals, rotation (team DEK rotation inserts `TeamDekHistory` row).
- [ ] `keyRotationService` extended to rotate team DEKs on demand (admin endpoint deferred — not in scope for P3).
- [ ] Backfill: not required — existing rows have `teamId = null` and stay on user DEK.

---

### P4 — Context Middleware + Quota Resolver

New files: `src/middleware/resolveTeamContext.ts`, `src/middleware/verifyTeamRole.ts`, `src/services/quotaService.ts`.

- [ ] **`resolveTeamContext`** — reads `X-Team-Id` header. If absent → `req.teamContext = null`. If present → fetch active `TeamMember` (with team not soft-deleted, member not soft-deleted), 403 if not a member. Populates `req.teamContext = { teamId, role }`.
- [ ] **`verifyTeamRole(minRole)`** — factory: `'ADMIN'` allows ADMIN + OWNER, `'OWNER'` allows OWNER only. Runs after `resolveTeamContext` (or `verifyTeamMember` for route-param style). Throws 403.
- [ ] **`verifyTeamMember`** — variant that reads `teamId` from route param (for `/teams/:teamId/*` routes). Same semantics.
- [ ] **`getQuotaOwner({ userId, teamId })`** → `Promise<string>` — returns userId of the principal whose pool gets debited. Cached at request scope (per request, not LRU).
- [ ] Wire `getQuotaOwner` into:
  - Deepgram transcription start (records minutes against owner)
  - OpenAI calls (Ask AI, summary, content generation)
  - GCS upload (storage attribution)
  - Recall.ai webhook minute attribution
- [ ] `UserUsage` writes carry `teamId` for breakdown attribution. Aggregate queries support `groupBy: ['userId', 'teamId']`.

---

### P5 — Team-scoped Content (split per service)

Each sub-task is a single PR scope.

- [ ] **P5.1 Meetings** — `meetingService` reads `req.teamContext`. List/get/update/delete + nested (attachments, participants, recordings, transcript, segments, AI summary, ask AI, content generation, share) honor team context. Member visibility: when `role === 'MEMBER'`, add `participants: { some: { userId } }` to where clause.
- [ ] **P5.2 Cards** — `cardService` + `cardContactService` honor team context. Public team card endpoint (`GET /public/teams/:slug`) separate.
- [ ] **P5.3 Tasks** — `taskService` honors team context. Reassign endpoint blocks `role === 'MEMBER'`.
- [ ] **P5.4 Scheduling** — `eventTypeService`, `availabilityService`, `bookingService` (private endpoints) honor team context. Team-scoped EventTypes have `teamId` set; slot engine works unchanged.
- [ ] **P5.5 Tags** — `tagService` polymorphic tags (meeting/card/task/contact) scope to team context. The `Tag` model itself gets `teamId UUID?`.
- [ ] **P5.6 SMA + AI** — `AskAIConversation` scoped by `meeting.teamId`. `MeetingAIContent` cache scoped by `meeting.teamId`.
- [ ] **P5.7 Recall webhooks** — match Recall event → meeting → use `meeting.teamId` for quota attribution via `getQuotaOwner`.
- [ ] **P5.8 Usage endpoint** — `GET /teams/:teamId/usage?period=this_month|last_month|7d|custom&start=&end=` — aggregate `UserUsage` per member for the period. Owner/Admin only. Returns `{ summary: {...}, breakdown: [{ user, meetings, transcriptionMinutes, aiTokens, storageGB }] }`.

---

### P6 — Public Team Endpoints

- [ ] `GET /public/teams/:slug` — no auth. Returns `{ team: { name, slug, description, logoUrl, createdAt }, members: [{ user: { displayName, username, avatarUrl }, role, teamCard: { ... } }], stats: { memberCount } }`. Only active members. 404 if team `isDeleted` or not found.
- [ ] `GET /public/scheduling/team/:slug/profile` — team scheduling profile + active member list.
- [ ] `GET /public/scheduling/team/:slug/:username` — specific member's team-scoped EventTypes.
- [ ] Slot engine respects `eventType.teamId = team.id` (no change to slot algorithm — just filter scope).

---

### P7 — WebSocket Events

Extend `WsServerMessage` (in `src/types/ws.ts`):

- [ ] `TEAM_INVITE_RECEIVED` — emitted to invitee on user-mode invite.
- [ ] `TEAM_MEMBER_JOINED` — emitted to all current team members on acceptance.
- [ ] `TEAM_MEMBER_LEFT` — emitted to remaining team members on removal/leave.
- [ ] `TEAM_MEMBER_ROLE_CHANGED` — emitted to team.
- [ ] `TEAM_MEETING_BOOKED` — emitted to participant on internal booking confirmation.

Publish from `teamService` / `meetingService` after the relevant DB commit, never inside the transaction.

---

### P8 — Admin API

Routes under `verifyAdmin` in `src/routes/adminRoutes.ts`:

- [ ] `GET /admin/config` — list all `SystemConfig` entries grouped by category (derived from key prefix).
- [ ] `PATCH /admin/config/:key` — Zod `{ value: z.string().min(1) }`. Records `updatedBy = adminUserId`. Writes audit row.
- [ ] `GET /admin/teams?include_deleted=false&search=&page=&pageSize=` — list with `owner { email }`, `_count { members }`, `createdAt`, `isDeleted`. Pagination.
- [ ] `GET /admin/teams/:teamId` — full detail incl. active + departed members + recent activity (created, member joined, member left, role changed events from audit log).
- [ ] `DELETE /admin/teams/:teamId` — admin override soft-delete (same effect as Owner-initiated delete; records admin override in audit log).
- [ ] `PATCH /admin/users/:userId/plan` — Zod `{ plan: z.enum(['FREE','PRO','BUSINESS']) }`. Records `previousPlan` in audit log. Returns updated user.

---

## Phase 7 — Razorpay ⛔ BLOCKED

Account blocked. Env vars already in `.env.example` (commented out). Do not start.

---

## Phase 8 — Big Brain ⛔ BLOCKED

Requires separate infrastructure (vector DB) + Phase 5 (Encryption at Rest) live in prod. Do not start.

- [ ] Vector embeddings pipeline
- [ ] RAG query endpoint (global Ask AI)
- [x] ~~Model upgrades: `nova-2` → `nova-3`, `gpt-4o-mini` → `gpt-5.4-mini`~~ — done early at Phase 4 start
