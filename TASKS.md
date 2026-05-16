# calendar-backend — Task List

Last updated: 2026-04-19 (Phase 4.3 complete ✅ — Two-way GCal Push Webhooks shipped)

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

## Phase 5 — Encryption at Rest

> Full design spec: `../docs/superpowers/specs/2026-05-16-encryption-at-rest-design.md`
> 95% of Phase 5 work lives in this repo.

**Scope:** Server-side envelope encryption for all sensitive at-rest content. KMS-managed KEK, per-user DEK, AES-256-GCM. Not E2EE — server holds keys so AI features (Summary, Ask AI, Big Brain) keep working unchanged.

### P0 — KMS foundations

- [ ] Provision Cloud KMS keyring + KEK in GCP for each env (dev / staging / prod)
- [ ] IAM bind backend service account to `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the KEK only
- [ ] Add `GCP_KMS_KEY_NAME`, `GCP_PROJECT_ID`, `GCP_KMS_LOCATION`, `GCP_KMS_KEYRING` to `.env.example`
- [ ] Document KMS setup, IAM bindings, and key-naming conventions in `docs/dev-notes/encryption.md`

### P1 — cryptoService module

- [ ] `src/utils/security/crypto.ts` — public `encrypt(plaintext, userId)` + `decrypt(ciphertext, userId)`, internal `getDek(userId)` with AsyncLocalStorage cache
- [ ] `src/middleware/cryptoMiddleware.ts` — unwrap DEK once per authenticated request, store in AsyncLocalStorage, discard on request end
- [ ] Wire `cryptoMiddleware` into the request pipeline immediately after `verifyJWT`
- [ ] `generateDekForNewUser(userId)` — called from the Google OAuth signup flow on new user creation
- [ ] Per-record ciphertext format: `iv(12) ‖ ciphertext ‖ authTag(16)`, single `Bytes` column
- [ ] Unit tests: encrypt → decrypt round-trip, wrong-DEK fails, tampered ciphertext fails GCM auth check, missing DEK throws clearly

### P2 — Schema migration 1 (additive)

- [ ] Add `User.wrappedDek Bytes?` (null only during backfill window)
- [ ] Add `_encrypted Bytes?` shadow column for each in-scope field:
  - [ ] `MeetingTranscript.fullText_encrypted`
  - [ ] `TranscriptSegment.text_encrypted`
  - [ ] `MeetingNote.content_encrypted`
  - [ ] `MeetingAISummary.summary_encrypted`, `keyPoints_encrypted Bytes[]`
  - [ ] `MeetingAIContent.content_encrypted`
  - [ ] `AskAIConversation` — encrypted shadow for message contents
  - [ ] `Task.title_encrypted`, `Task.description_encrypted`
  - [ ] `CardContact.name_encrypted`, `email_encrypted`, `phone_encrypted`, `notes_encrypted`
  - [ ] `Booking.guestEmail_encrypted`, `guestNotes_encrypted`
- [ ] `pnpm db:migrate && pnpm db:generate`

### P3 — Backfill script

- [ ] `src/scripts/backfill-encryption.ts`
- [ ] Phase 1: generate + KMS-wrap a DEK for every user missing one. Idempotent.
- [ ] Phase 2: encrypt all in-scope rows. Batched 1000/txn. Resumable from a checkpoint table (`BackfillCheckpoint` with `(modelName, lastId, completedAt)`). Owner-DEK lookup via FK chain (e.g., `MeetingNote → Meeting → userId`).
- [ ] Phase 3: verification — re-read a random 1000-row sample, decrypt, compare to plaintext, fail loud on any mismatch.
- [ ] `--dry-run` flag — performs reads + encrypts in memory but never writes
- [ ] Run dry-run against a staging snapshot of prod DB; only proceed when sample check is green
- [ ] Run for real against staging, then prod (off-hours)

### P4 — Service-layer cutover

- [ ] Patch `smaService` writes to encrypt before insert (transcripts, segments, notes, AI summaries, AI content)
- [ ] Patch `smaService` reads to decrypt after fetch
- [ ] Patch `tasksService` writes + reads for `title`, `description`
- [ ] Patch `cardService` writes + reads for `CardContact.{name, email, phone, notes}`
- [ ] Patch `bookingService` writes + reads for `Booking.{guestEmail, guestNotes}`
- [ ] Patch `askAiService` writes + reads for `AskAIConversation` messages
- [ ] Feature flag env var `ENCRYPTION_READS_FROM_ENCRYPTED_COLUMN`, defaults `false`
- [ ] Dual-write during rollout: writes go to both plaintext + `_encrypted` columns
- [ ] AI service code (`aiService.ts`) untouched — receives plaintext from the service layer which handles encrypt/decrypt at the boundary

### P5 — Logger hardening

- [ ] Logger middleware: denylist for encrypted-field names (`fullText`, `content`, `description`, `notes`, `phone`, `email`, `guestEmail`, `guestNotes`, etc.) — never serialized into log output
- [ ] `req.body` redacted in request logs for routes that accept encrypted content
- [ ] Unit test: denylisted fields never appear in `logger.x()` output even when passed as object props

### P6 — GCS CMEK

- [ ] Grant Cloud Storage service agent `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the KEK
- [ ] `gsutil kms encryption -k <key-resource-name> gs://<recordings-bucket>` — sets default CMEK for all new uploads
- [ ] Background `gsutil rewrite -k` job to re-encrypt existing recording objects (no app downtime)

### P7 — Cutover

- [ ] End-to-end verification on staging: meeting create → recording upload → transcribe → summarize → ask AI → all with encryption flag on
- [ ] Flip `ENCRYPTION_READS_FROM_ENCRYPTED_COLUMN` → `true` in prod
- [ ] Monitor 7 days: KMS audit logs healthy, no decrypt failures in error tracking, no plaintext leaks in app logs

### P8 — Schema migration 2 (drop plaintext)

- [ ] Migration 2: drop original plaintext columns, rename `_encrypted` → original column name
- [ ] Remove dual-write code paths; reads/writes only touch the final column
- [ ] Remove the feature flag

### P9 — Crypto-shredding for account delete

- [ ] Wire account-delete service to destroy `User.wrappedDek` (set null → hard-delete user row in same transaction)
- [ ] Integration test: account delete → subsequent read of that user's content fails / returns not-found

### P10 — Hardening + observability

- [ ] Cloud Logging alert on anomalous KMS unwrap volume (>5× baseline / hour)
- [ ] KMS disaster-recovery runbook in `docs/dev-notes/encryption.md` (key destruction protection, regional failover, IAM hygiene)
- [ ] Pre-encryption backup inventory: list every Cloud SQL automated backup + manual snapshot, then delete or re-import-and-re-encrypt each pre-encryption backup — otherwise crypto-shredding has a plaintext escape hatch
- [ ] DB dump spot-check: `grep -ic "<known plaintext snippet>"` against a redacted prod dump — expect zero hits

### P11 — Tests

- [ ] Integration test: full meeting lifecycle with encryption on (create → upload → transcribe → summarize → ask AI → delete)
- [ ] Integration test: account delete crypto-shredding (verify post-delete reads fail)
- [ ] Backfill script test on a seeded staging DB — assert 100% rows encrypted post-run

---

## Phase 6 — Teams (Backend)

> Full design spec: `../docs/superpowers/specs/2026-05-09-teams-design.md`

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
- [ ] **`Team` model**:
  ```prisma
  model Team {
    id        String    @id @default(uuid()) @db.Uuid
    name      String
    slug      String    @unique
    ownerId   String    @db.Uuid
    owner     User      @relation(fields: [ownerId], references: [id])
    logoUrl   String?
    members   TeamMember[]
    createdAt DateTime  @default(now())
    deletedAt DateTime?
    @@index([ownerId])
  }
  ```
- [ ] **`TeamMember` model**:
  ```prisma
  model TeamMember {
    id       String     @id @default(uuid()) @db.Uuid
    teamId   String     @db.Uuid
    team     Team       @relation(fields: [teamId], references: [id])
    userId   String     @db.Uuid
    user     User       @relation(fields: [userId], references: [id])
    role     TeamRole   @default(MEMBER)
    joinedAt DateTime   @default(now())
    leftAt   DateTime?
    @@unique([teamId, userId])
    @@index([userId])
  }

  enum TeamRole {
    OWNER
    ADMIN
    MEMBER
  }
  ```
- [ ] **Add `teamId UUID?`** to: `Meeting`, `Card`, `Task`, `EventType`, `Booking` — nullable FK to `Team`. `null` = personal context.
- [ ] **Migration:** `pnpm db:migrate && pnpm db:generate`
- [ ] **Seed SystemConfig defaults:** `max_teams_per_pro_user=3`, `max_members_per_team=50`

---

### P1 — Team CRUD Endpoints

Routes under `verifyJWT`. New route file: `src/routes/teamRoutes.ts`. Controller: `src/controllers/teamController.ts`. Service: `src/services/teamService.ts`.

- [ ] `POST /teams` — create team. Pro gate (check `user.plan === PRO`). Check team count ≤ `SystemConfig.max_teams_per_pro_user`. Create `Team` + `TeamMember` (role: OWNER) + auto-create team `Card` — all in one `prisma.$transaction`.
- [ ] `GET /teams` — list teams the authenticated user belongs to (any role, `leftAt IS NULL`). Include role in response.
- [ ] `PATCH /teams/:teamId` — update name, slug, logoUrl. Middleware: `verifyTeamRole('ADMIN')`.
- [ ] `DELETE /teams/:teamId` — soft delete (`deletedAt = now()`). Owner only. Sets all members' `leftAt` in transaction.

---

### P2 — Team Member Management

- [ ] `GET /teams/:teamId/members` — list active members with role + usage snapshot. `verifyTeamMember`.
- [ ] `POST /teams/:teamId/members/invite` — invite by `userId` (existing user) or `email` (non-user → send email with token). `verifyTeamRole('ADMIN')`. Check member count ≤ `SystemConfig.max_members_per_team`.
- [ ] `POST /teams/invites/:token/accept` — accept email invite. Creates `TeamMember` with role MEMBER. No auth required (email link).
- [ ] `PATCH /teams/:teamId/members/:userId` — change member role. `verifyTeamRole('OWNER')`. Cannot change Owner role this way (use transfer endpoint).
- [ ] `DELETE /teams/:teamId/members/:userId` — remove member. `verifyTeamRole('ADMIN')`. Sets `leftAt = now()`. Cannot remove Owner.
- [ ] `DELETE /teams/:teamId/leave` — leave team. Blocked if caller is Owner. Sets `leftAt = now()`.

---

### P3 — Team Middleware

New middleware files in `src/middleware/`:

- [ ] **`verifyTeamMember.ts`** — reads `teamId` from route param. Checks `TeamMember` exists for `userId` with `leftAt IS NULL` and team `deletedAt IS NULL`. Throws 403 if not a member.
- [ ] **`verifyTeamRole.ts`** — factory: `verifyTeamRole('ADMIN')` allows ADMIN + OWNER; `verifyTeamRole('OWNER')` allows OWNER only. Must run after `verifyTeamMember`.

---

### P4 — Team-scoped Content

- [ ] All meeting queries: when `teamId` header present (`X-Team-Id`), scope `where` to `teamId`. Members get additional filter `participants.userId = req.user.id` unless OWNER/ADMIN.
- [ ] All card/task/EventType/booking queries: scope to `teamId` when context is team.
- [ ] `GET /teams/:teamId/usage` — aggregate `UserUsage` per member for current period. Owner/Admin only.

---

### P5 — Team Public Scheduling

- [ ] `GET /public/scheduling/team/:slug/profile` — no auth. Fetch team + active members with their active `EventType[]` (where `eventType.teamId = team.id`). Returns team profile + member list.
- [ ] `GET /public/scheduling/team/:slug/:username` — no auth. Fetch specific member's active EventTypes scoped to this team. Used for team-member booking page.
- [ ] Slot engine: no changes needed — slots already work per username + eventTypeSlug. Team EventTypes just have `teamId` set.

---

### P6 — Admin Portal: SystemConfig + Teams API

Routes under `verifyAdmin` in `src/routes/adminRoutes.ts`:

- [ ] `GET /admin/config` — list all `SystemConfig` entries
- [ ] `PATCH /admin/config/:key` — update value. Zod: `{ value: z.string().min(1) }`.
- [ ] `GET /admin/teams` — list all teams with `owner { email }`, `_count { members }`, `createdAt`, `deletedAt`. Pagination. Soft-deleted teams included (filterable).

---

## Phase 7 — Razorpay ⛔ BLOCKED

Account blocked. Env vars already in `.env.example` (commented out). Do not start.

---

## Phase 8 — Big Brain ⛔ BLOCKED

Requires separate infrastructure (vector DB) + Phase 5 (Encryption at Rest) live in prod. Do not start.

- [ ] Vector embeddings pipeline
- [ ] RAG query endpoint (global Ask AI)
- [x] ~~Model upgrades: `nova-2` → `nova-3`, `gpt-4o-mini` → `gpt-5.4-mini`~~ — done early at Phase 4 start
