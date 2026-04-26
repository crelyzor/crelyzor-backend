# calendar-backend — API Intelligence

> Read this before writing any backend code for Crelyzor.

---

## What This Repo Is

The single backend for all of Crelyzor. Serves both `calendar-frontend` and `cards-frontend`.

- Express 5 + TypeScript 5
- Prisma 6 + PostgreSQL
- OpenAI (GPT-5.4-mini) + Deepgram (Nova-3 Multilingual)
- Bull + Redis (job queues + caching)
- Google Cloud Storage (recordings, files)
- Google OAuth 2.0 + JWT

All routes under `/api/v1/`

---

## Architecture Pattern

**Always follow this chain. Never skip layers.**

```
Request → Route → Middleware → Controller → Service → Prisma → DB
                     ↑               ↑           ↑
                  verifyJWT       AppError    $transaction
                  Zod validate
```

```
src/
├── routes/        ← Route definitions only. No logic.
├── controllers/   ← Request/response handling. Calls services.
├── services/      ← All business logic. Calls Prisma.
├── validators/    ← Zod schemas. One file per domain.
├── middleware/    ← Auth, upload, rate limiting.
├── utils/
│   ├── errors/        ← AppError class
│   ├── logging/       ← logger (Pino)
│   └── globalErrorHandler.ts
├── config/        ← Service clients (OpenAI, Deepgram, Redis)
├── types/         ← TypeScript interfaces
└── db/
    └── prismaClient.ts
```

---

## Code Conventions

### Error Handling — Always AppError

```typescript
import { AppError } from "../utils/errors/AppError";

// Throw AppError with HTTP status
throw new AppError("Meeting not found", 404);
throw new AppError("Unauthorized", 401);
throw new AppError("Validation failed", 400);

// Never throw plain Error in controllers/services
// Never return error responses manually — let globalErrorHandler handle it
```

### Response — Always globalResponseHandler

```typescript
import { globalResponseHandler } from "../utils/globalResponseHandler";

// Success
return globalResponseHandler(res, 200, "Meeting fetched", { meeting });
return globalResponseHandler(res, 201, "Meeting created", { meeting });
return globalResponseHandler(res, 200, "Meeting deleted");

// Never use res.json() or res.send() directly
```

### Logging — Always logger, Never console

```typescript
import { logger } from "../utils/logging/logger";

logger.info("Meeting created", { meetingId, userId });
logger.error("Transcription failed", { error, meetingId });
logger.warn("Rate limit hit", { ip });

// Never: console.log, console.error
```

### Validation — Always Zod

```typescript
// In validators/meetingSchema.ts
import { z } from "zod";

export const createMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
});

// In controller
const validated = createMeetingSchema.safeParse(req.body);
if (!validated.success) throw new AppError("Validation failed", 400);
```

### Database — Always Prisma with Transactions

```typescript
import { prisma } from "../db/prismaClient";

// Multi-step operations — always use transaction
const result = await prisma.$transaction(async (tx) => {
  const meeting = await tx.meeting.create({ data: { ... } });
  await tx.meetingParticipant.create({ data: { meetingId: meeting.id, ... } });
  return meeting;
}, { timeout: 15000 }); // Always set 15s timeout

// Single reads — direct prisma is fine
const meeting = await prisma.meeting.findUnique({ where: { id } });
```

### Auth — Always verifyJWT on Protected Routes

```typescript
import { verifyJWT } from "../middleware/authMiddleware";

// Protected route
router.get("/meetings", verifyJWT, meetingController.getMeetings);

// Public route (explicitly — no middleware)
router.get("/public/cards/:username", cardController.getPublicCard);

// Never skip verifyJWT on private endpoints
// req.user.id is available after verifyJWT
```

---

## Service Client Initialization

Services are lazily initialized. Access via getter functions:

```typescript
// OpenAI
import { getOpenAIClient } from "../config/openai";
const openai = getOpenAIClient();

// Deepgram
import { getDeepgramClient } from "../config/deepgram";
const deepgram = getDeepgramClient();

// Redis
import { getRedisClient } from "../config/redisClient";

// Never import process.env directly for these — use the config files
```

---

## Database Schema — Key Models

All IDs are UUIDs (`@db.Uuid`). All soft deletes (`isDeleted`, `deletedAt`).

**Core:** `User`, `Session`, `OAuthAccount`, `RefreshToken`
**Meetings:** `Meeting`, `MeetingParticipant`, `MeetingStateHistory`
**SMA:** `MeetingRecording`, `MeetingTranscript`, `TranscriptSegment`, `MeetingAISummary`, `MeetingActionItem`, `MeetingNote`, `MeetingSpeaker`
**Cards:** `Card`, `CardContact`, `CardView`

Schema: `prisma/schema.prisma`

**After schema changes:**
```bash
pnpm db:migrate    # creates migration file + applies
pnpm db:generate   # regenerates Prisma client
```

---

## SMA Pipeline (Smart Meeting Assistant)

```
Upload → GCS → Deepgram Nova-3 Multilingual (diarize: true) → TranscriptSegment[]
                                                         ↓
                                              OpenAI (parallel):
                                              ├── generateSummary()
                                              ├── extractKeyPoints()
                                              └── extractActionItems()
```

Transcription status flow: `NONE → UPLOADED → PROCESSING → COMPLETED → FAILED`

Services in `src/services/`:
- `transcription/transcriptionService.ts` — Deepgram integration
- `ai/aiService.ts` — OpenAI processing
- `recording/` — GCS upload handling

---

## Ask AI — To Build

```typescript
// New endpoint: POST /sma/meetings/:meetingId/ask
// In: smaRoutes.ts → aiController.ts → aiService.ts

// Service logic:
async function askAI(meetingId: string, question: string, userId: string) {
  // 1. Verify meeting belongs to user
  // 2. Fetch MeetingTranscript with segments
  // 3. Build transcript context string (speaker: text format)
  // 4. Call OpenAI with system prompt + transcript + question
  // 5. Return answer (stream preferred)
}
```

---

## Route Structure

```
routes/
├── authRoutes.ts          ← /auth/*
├── meetingRoutes.ts       ← /meetings/*
├── cardRoutes.ts          ← /cards/*
├── publicCardRoutes.ts    ← /public/cards/*
├── smaRoutes.ts           ← /sma/*
├── userRoutes.ts          ← /users/*
├── storageRoutes.ts       ← /storage/*
└── auth/
    └── googleOAuthRoutes.ts
```

---

## Running Locally

```bash
pnpm dev          # Start API server (:3000)
pnpm dev:worker   # Start Bull job worker (separate terminal, required for queue jobs)
pnpm db:studio    # Prisma Studio (DB GUI)
```

---

## What NOT To Do

- Do NOT use `console.log` — use `logger`
- Do NOT return `res.json()` — use `globalResponseHandler`
- Do NOT throw plain `Error` — use `AppError`
- Do NOT skip `verifyJWT` on protected routes
- Do NOT access service clients via `process.env` directly — use config files
- Do NOT use `any` type in TypeScript
- Do NOT skip Zod validation on any route input
- Do NOT skip transactions for multi-step DB operations
- Do NOT hard delete records — use soft delete pattern
- Do NOT use MongoDB — the DB is PostgreSQL
