-- CreateEnum
CREATE TYPE "LoginMethod" AS ENUM ('OAUTH');

-- CreateEnum
CREATE TYPE "ProviderEnum" AS ENUM ('GOOGLE', 'ZOOM');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('CREATED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('SCHEDULED', 'RECORDED', 'VOICE_NOTE');

-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('ORGANIZER', 'ATTENDEE');

-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('NONE', 'UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('AI_EXTRACTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "AIContentType" AS ENUM ('MEETING_REPORT', 'TWEET', 'BLOG_POST', 'EMAIL');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('FILE', 'LINK', 'PHOTO');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'BUSINESS');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "countryCode" TEXT,
    "phoneNumber" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeSessionId" UUID,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "deviceInfo" TEXT NOT NULL,
    "loginTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "failureReason" TEXT,
    "loginMethod" "LoginMethod" NOT NULL DEFAULT 'OAUTH',
    "provider" "ProviderEnum",

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deviceInfo" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" UUID NOT NULL,
    "provider" "ProviderEnum" NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiry" INTEGER NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "MeetingType" NOT NULL DEFAULT 'SCHEDULED',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "MeetingStatus" NOT NULL DEFAULT 'CREATED',
    "location" TEXT,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "transcriptionStatus" "TranscriptionStatus" NOT NULL DEFAULT 'NONE',
    "recallBotId" TEXT,
    "meetLink" TEXT,
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID,
    "guestEmail" TEXT,
    "participantType" "ParticipantType" NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "cardId" UUID,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingStateHistory" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "fromStatus" "MeetingStatus",
    "toStatus" "MeetingStatus" NOT NULL,
    "changedById" UUID NOT NULL,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingStateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRecording" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "gcsPath" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingTranscript" (
    "id" UUID NOT NULL,
    "recordingId" UUID NOT NULL,
    "fullText" TEXT NOT NULL,
    "deepgramJobId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" UUID NOT NULL,
    "transcriptId" UUID NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startTime" DOUBLE PRECISION NOT NULL,
    "endTime" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSpeaker" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "speakerLabel" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSpeaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "meetingId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "scheduledTime" TIMESTAMP(3),
    "priority" "TaskPriority",
    "source" "TaskSource" NOT NULL DEFAULT 'MANUAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentTaskId" UUID,
    "cardId" UUID,
    "transcriptContext" TEXT,
    "durationMinutes" INTEGER DEFAULT 30,
    "googleEventId" TEXT,
    "recurringRule" TEXT,
    "recurringParentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTag" (
    "taskId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTag_pkey" PRIMARY KEY ("taskId","tagId")
);

-- CreateTable
CREATE TABLE "MeetingNote" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "author" UUID NOT NULL,
    "timestamp" DOUBLE PRECISION,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAISummary" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "keyPoints" TEXT[],
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingAISummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAIContent" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "type" "AIContentType" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAIContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskAIConversation" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AskAIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskAIMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskAIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GCalSyncState" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channelId" TEXT NOT NULL,
    "resourceId" TEXT,
    "expiration" TIMESTAMP(3) NOT NULL,
    "syncToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GCalSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingShare" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "shortId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "showTranscript" BOOLEAN NOT NULL DEFAULT true,
    "showSummary" BOOLEAN NOT NULL DEFAULT true,
    "showTasks" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "title" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "contactFields" JSONB NOT NULL DEFAULT '{}',
    "theme" JSONB NOT NULL DEFAULT '{}',
    "templateId" TEXT NOT NULL DEFAULT 'executive',
    "showQr" BOOLEAN NOT NULL DEFAULT true,
    "htmlContent" TEXT,
    "htmlBackContent" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardContact" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedByScanner" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CardContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardView" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "country" TEXT,
    "city" TEXT,
    "clickedLink" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttachment" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "gcsPath" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingTag" (
    "meetingId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingTag_pkey" PRIMARY KEY ("meetingId","tagId")
);

-- CreateTable
CREATE TABLE "CardTag" (
    "cardId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardTag_pkey" PRIMARY KEY ("cardId","tagId")
);

-- CreateTable
CREATE TABLE "ContactTag" (
    "contactId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "schedulingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxWindowDays" INTEGER NOT NULL DEFAULT 60,
    "defaultBufferMins" INTEGER NOT NULL DEFAULT 15,
    "googleCalendarSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleCalendarEmail" TEXT,
    "recallEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoTranscribe" BOOLEAN NOT NULL DEFAULT true,
    "autoAIProcess" BOOLEAN NOT NULL DEFAULT true,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bookingEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "meetingReadyEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventType" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL,
    "locationType" "LocationType" NOT NULL DEFAULT 'IN_PERSON',
    "meetingLink" TEXT,
    "bufferBefore" INTEGER NOT NULL DEFAULT 0,
    "bufferAfter" INTEGER NOT NULL DEFAULT 0,
    "minNoticeHours" INTEGER NOT NULL DEFAULT 24,
    "maxPerDay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availabilityScheduleId" UUID,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySchedule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilitySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityOverride" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "isBlocked" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "eventTypeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "meetingId" UUID,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestNote" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "googleEventId" TEXT,
    "cancelReason" TEXT,
    "canceledAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUsage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "transcriptionMinutesUsed" INTEGER NOT NULL DEFAULT 0,
    "recallHoursUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "storageGbUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "razorpayCustomerId" TEXT NOT NULL,
    "razorpaySubscriptionId" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_activeSessionId_idx" ON "User"("activeSessionId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_plan_idx" ON "User"("plan");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiredAt_idx" ON "Session"("expiredAt");

-- CreateIndex
CREATE INDEX "LoginHistory_userId_loginTime_idx" ON "LoginHistory"("userId", "loginTime");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerId_key" ON "OAuthAccount"("provider", "providerId");

-- CreateIndex
CREATE INDEX "Meeting_createdById_idx" ON "Meeting"("createdById");

-- CreateIndex
CREATE INDEX "Meeting_createdAt_idx" ON "Meeting"("createdAt");

-- CreateIndex
CREATE INDEX "Meeting_startTime_idx" ON "Meeting"("startTime");

-- CreateIndex
CREATE INDEX "Meeting_status_isDeleted_idx" ON "Meeting"("status", "isDeleted");

-- CreateIndex
CREATE INDEX "Meeting_transcriptionStatus_idx" ON "Meeting"("transcriptionStatus");

-- CreateIndex
CREATE INDEX "Meeting_type_isDeleted_idx" ON "Meeting"("type", "isDeleted");

-- CreateIndex
CREATE INDEX "Meeting_recallBotId_idx" ON "Meeting"("recallBotId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_guestEmail_idx" ON "MeetingParticipant"("guestEmail");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_cardId_idx" ON "MeetingParticipant"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_guestEmail_key" ON "MeetingParticipant"("meetingId", "userId", "guestEmail");

-- CreateIndex
CREATE INDEX "MeetingStateHistory_meetingId_idx" ON "MeetingStateHistory"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingStateHistory_toStatus_idx" ON "MeetingStateHistory"("toStatus");

-- CreateIndex
CREATE INDEX "MeetingStateHistory_changedById_idx" ON "MeetingStateHistory"("changedById");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRecording_meetingId_key" ON "MeetingRecording"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingRecording_meetingId_idx" ON "MeetingRecording"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingTranscript_recordingId_key" ON "MeetingTranscript"("recordingId");

-- CreateIndex
CREATE INDEX "MeetingTranscript_recordingId_idx" ON "MeetingTranscript"("recordingId");

-- CreateIndex
CREATE INDEX "MeetingTranscript_recordingId_isDeleted_idx" ON "MeetingTranscript"("recordingId", "isDeleted");

-- CreateIndex
CREATE INDEX "TranscriptSegment_transcriptId_idx" ON "TranscriptSegment"("transcriptId");

-- CreateIndex
CREATE INDEX "TranscriptSegment_speaker_idx" ON "TranscriptSegment"("speaker");

-- CreateIndex
CREATE INDEX "TranscriptSegment_startTime_idx" ON "TranscriptSegment"("startTime");

-- CreateIndex
CREATE INDEX "MeetingSpeaker_meetingId_idx" ON "MeetingSpeaker"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingSpeaker_userId_idx" ON "MeetingSpeaker"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSpeaker_meetingId_speakerLabel_key" ON "MeetingSpeaker"("meetingId", "speakerLabel");

-- CreateIndex
CREATE INDEX "Task_userId_idx" ON "Task"("userId");

-- CreateIndex
CREATE INDEX "Task_meetingId_idx" ON "Task"("meetingId");

-- CreateIndex
CREATE INDEX "Task_userId_isDeleted_idx" ON "Task"("userId", "isDeleted");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_scheduledTime_idx" ON "Task"("scheduledTime");

-- CreateIndex
CREATE INDEX "Task_isCompleted_idx" ON "Task"("isCompleted");

-- CreateIndex
CREATE INDEX "Task_source_idx" ON "Task"("source");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_userId_sortOrder_idx" ON "Task"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- CreateIndex
CREATE INDEX "Task_cardId_idx" ON "Task"("cardId");

-- CreateIndex
CREATE INDEX "Task_userId_status_isDeleted_idx" ON "Task"("userId", "status", "isDeleted");

-- CreateIndex
CREATE INDEX "Task_userId_cardId_isDeleted_idx" ON "Task"("userId", "cardId", "isDeleted");

-- CreateIndex
CREATE INDEX "Task_googleEventId_idx" ON "Task"("googleEventId");

-- CreateIndex
CREATE INDEX "Task_recurringParentId_idx" ON "Task"("recurringParentId");

-- CreateIndex
CREATE INDEX "TaskTag_taskId_idx" ON "TaskTag"("taskId");

-- CreateIndex
CREATE INDEX "TaskTag_tagId_idx" ON "TaskTag"("tagId");

-- CreateIndex
CREATE INDEX "MeetingNote_meetingId_idx" ON "MeetingNote"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingNote_author_idx" ON "MeetingNote"("author");

-- CreateIndex
CREATE INDEX "MeetingNote_meetingId_isDeleted_idx" ON "MeetingNote"("meetingId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAISummary_meetingId_key" ON "MeetingAISummary"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAISummary_meetingId_idx" ON "MeetingAISummary"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAISummary_meetingId_isDeleted_idx" ON "MeetingAISummary"("meetingId", "isDeleted");

-- CreateIndex
CREATE INDEX "MeetingAIContent_meetingId_idx" ON "MeetingAIContent"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAIContent_meetingId_type_key" ON "MeetingAIContent"("meetingId", "type");

-- CreateIndex
CREATE INDEX "AskAIConversation_meetingId_idx" ON "AskAIConversation"("meetingId");

-- CreateIndex
CREATE INDEX "AskAIConversation_userId_idx" ON "AskAIConversation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AskAIConversation_meetingId_userId_key" ON "AskAIConversation"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "AskAIMessage_conversationId_idx" ON "AskAIMessage"("conversationId");

-- CreateIndex
CREATE INDEX "AskAIMessage_conversationId_createdAt_idx" ON "AskAIMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GCalSyncState_userId_key" ON "GCalSyncState"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GCalSyncState_channelId_key" ON "GCalSyncState"("channelId");

-- CreateIndex
CREATE INDEX "GCalSyncState_expiration_idx" ON "GCalSyncState"("expiration");

-- CreateIndex
CREATE INDEX "GCalSyncState_channelId_idx" ON "GCalSyncState"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingShare_meetingId_key" ON "MeetingShare"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingShare_shortId_key" ON "MeetingShare"("shortId");

-- CreateIndex
CREATE INDEX "MeetingShare_shortId_idx" ON "MeetingShare"("shortId");

-- CreateIndex
CREATE INDEX "MeetingShare_meetingId_idx" ON "MeetingShare"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingShare_userId_idx" ON "MeetingShare"("userId");

-- CreateIndex
CREATE INDEX "MeetingShare_isPublic_idx" ON "MeetingShare"("isPublic");

-- CreateIndex
CREATE INDEX "Card_slug_idx" ON "Card"("slug");

-- CreateIndex
CREATE INDEX "Card_userId_idx" ON "Card"("userId");

-- CreateIndex
CREATE INDEX "Card_userId_isActive_idx" ON "Card"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Card_userId_isDefault_idx" ON "Card"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Card_userId_slug_key" ON "Card"("userId", "slug");

-- CreateIndex
CREATE INDEX "CardContact_cardId_idx" ON "CardContact"("cardId");

-- CreateIndex
CREATE INDEX "CardContact_userId_scannedAt_idx" ON "CardContact"("userId", "scannedAt");

-- CreateIndex
CREATE INDEX "CardContact_email_idx" ON "CardContact"("email");

-- CreateIndex
CREATE INDEX "CardContact_userId_isDeleted_idx" ON "CardContact"("userId", "isDeleted");

-- CreateIndex
CREATE INDEX "CardView_cardId_viewedAt_idx" ON "CardView"("cardId", "viewedAt");

-- CreateIndex
CREATE INDEX "CardView_cardId_clickedLink_idx" ON "CardView"("cardId", "clickedLink");

-- CreateIndex
CREATE INDEX "MeetingAttachment_meetingId_isDeleted_idx" ON "MeetingAttachment"("meetingId", "isDeleted");

-- CreateIndex
CREATE INDEX "MeetingAttachment_userId_idx" ON "MeetingAttachment"("userId");

-- CreateIndex
CREATE INDEX "Tag_userId_idx" ON "Tag"("userId");

-- CreateIndex
CREATE INDEX "Tag_userId_isDeleted_idx" ON "Tag"("userId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX "MeetingTag_meetingId_idx" ON "MeetingTag"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingTag_tagId_idx" ON "MeetingTag"("tagId");

-- CreateIndex
CREATE INDEX "CardTag_cardId_idx" ON "CardTag"("cardId");

-- CreateIndex
CREATE INDEX "CardTag_tagId_idx" ON "CardTag"("tagId");

-- CreateIndex
CREATE INDEX "ContactTag_contactId_idx" ON "ContactTag"("contactId");

-- CreateIndex
CREATE INDEX "ContactTag_tagId_idx" ON "ContactTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "UserSettings_userId_idx" ON "UserSettings"("userId");

-- CreateIndex
CREATE INDEX "EventType_userId_isActive_isDeleted_idx" ON "EventType"("userId", "isActive", "isDeleted");

-- CreateIndex
CREATE INDEX "EventType_availabilityScheduleId_idx" ON "EventType"("availabilityScheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_userId_slug_key" ON "EventType"("userId", "slug");

-- CreateIndex
CREATE INDEX "AvailabilitySchedule_userId_isDeleted_idx" ON "AvailabilitySchedule"("userId", "isDeleted");

-- CreateIndex
CREATE INDEX "AvailabilitySchedule_userId_isDefault_idx" ON "AvailabilitySchedule"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "Availability_scheduleId_dayOfWeek_isDeleted_idx" ON "Availability"("scheduleId", "dayOfWeek", "isDeleted");

-- CreateIndex
CREATE INDEX "AvailabilityOverride_scheduleId_idx" ON "AvailabilityOverride"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityOverride_scheduleId_date_key" ON "AvailabilityOverride"("scheduleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_meetingId_key" ON "Booking"("meetingId");

-- CreateIndex
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- CreateIndex
CREATE INDEX "Booking_eventTypeId_idx" ON "Booking"("eventTypeId");

-- CreateIndex
CREATE INDEX "Booking_guestEmail_idx" ON "Booking"("guestEmail");

-- CreateIndex
CREATE INDEX "Booking_startTime_idx" ON "Booking"("startTime");

-- CreateIndex
CREATE INDEX "Booking_status_isDeleted_idx" ON "Booking"("status", "isDeleted");

-- CreateIndex
CREATE INDEX "Booking_userId_isDeleted_idx" ON "Booking"("userId", "isDeleted");

-- CreateIndex
CREATE INDEX "Booking_startTime_isDeleted_idx" ON "Booking"("startTime", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "UserUsage_userId_key" ON "UserUsage"("userId");

-- CreateIndex
CREATE INDEX "UserUsage_userId_idx" ON "UserUsage"("userId");

-- CreateIndex
CREATE INDEX "UserUsage_resetAt_idx" ON "UserUsage"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_razorpayCustomerId_key" ON "Subscription"("razorpayCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_razorpaySubscriptionId_key" ON "Subscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_razorpayCustomerId_idx" ON "Subscription"("razorpayCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_plan_idx" ON "Subscription"("plan");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingStateHistory" ADD CONSTRAINT "MeetingStateHistory_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingStateHistory" ADD CONSTRAINT "MeetingStateHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecording" ADD CONSTRAINT "MeetingRecording_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTranscript" ADD CONSTRAINT "MeetingTranscript_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "MeetingRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "MeetingTranscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSpeaker" ADD CONSTRAINT "MeetingSpeaker_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSpeaker" ADD CONSTRAINT "MeetingSpeaker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurringParentId_fkey" FOREIGN KEY ("recurringParentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTag" ADD CONSTRAINT "TaskTag_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTag" ADD CONSTRAINT "TaskTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAISummary" ADD CONSTRAINT "MeetingAISummary_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAIContent" ADD CONSTRAINT "MeetingAIContent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskAIConversation" ADD CONSTRAINT "AskAIConversation_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskAIConversation" ADD CONSTRAINT "AskAIConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskAIMessage" ADD CONSTRAINT "AskAIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AskAIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GCalSyncState" ADD CONSTRAINT "GCalSyncState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingShare" ADD CONSTRAINT "MeetingShare_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingShare" ADD CONSTRAINT "MeetingShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardContact" ADD CONSTRAINT "CardContact_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardContact" ADD CONSTRAINT "CardContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardView" ADD CONSTRAINT "CardView_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttachment" ADD CONSTRAINT "MeetingAttachment_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttachment" ADD CONSTRAINT "MeetingAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTag" ADD CONSTRAINT "MeetingTag_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTag" ADD CONSTRAINT "MeetingTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTag" ADD CONSTRAINT "CardTag_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTag" ADD CONSTRAINT "CardTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CardContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventType" ADD CONSTRAINT "EventType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventType" ADD CONSTRAINT "EventType_availabilityScheduleId_fkey" FOREIGN KEY ("availabilityScheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySchedule" ADD CONSTRAINT "AvailabilitySchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityOverride" ADD CONSTRAINT "AvailabilityOverride_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUsage" ADD CONSTRAINT "UserUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
