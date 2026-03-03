# Route Restructuring - API Path Migration Guide

## Overview
The API routes have been reorganized for better structure, separation of concerns, and consistent naming conventions.

---

## 🔐 Authentication Routes

### Google OAuth (Sign-In)
| Old Path | New Path | Notes |
|----------|----------|-------|
| `GET /google/login` | `GET /auth/google/login` | Google OAuth login redirect |
| `GET /google/login/callback` | `GET /auth/google/login/callback` | Google OAuth callback |

**File**: `src/routes/auth/googleOAuthRoutes.ts` (NEW)

---

## 🔗 Integration Routes

### Google Calendar Integration
| Old Path | New Path | Notes |
|----------|----------|-------|
| `GET /google/oauth` | `GET /integrations/calendar/connect` | Connect Google Calendar (renamed from oauth) |
| `GET /google/oauth/callback` | `GET /integrations/calendar/connect/callback` | Calendar connection callback |
| `GET /google/calendar/status` | `GET /integrations/calendar/status` | Check calendar access status |
| `GET /google/scopes/status` | `GET /integrations/calendar/scopes/status` | Check Google scopes status |
| `POST /google/calendar/events-by-date` | `POST /integrations/calendar/events-by-date` | Get events by date |
| `GET /google/calendar/synced-events` | `GET /integrations/calendar/synced-events` | Get synced events |
| `POST /google/calendar/sync` | `POST /integrations/calendar/sync` | Manual sync trigger |

**File**: `src/routes/integrations/googleCalendarRoutes.ts` (NEW)

### Calendar Sync (Previously separate)
| Old Path | New Path | Notes |
|----------|----------|-------|
| `POST /sync/start` | `POST /integrations/calendar/sync/start` | Start calendar sync |
| `POST /sync/stop` | `POST /integrations/calendar/sync/stop` | Stop calendar sync |
| `GET /sync/status` | `GET /integrations/calendar/sync/status` | Get sync status |

**File**: `src/routes/syncRoutes.ts` (moved under integrations path)

---

## 🏢 Organization Routes

### Organization Management
| Old Path | New Path | Notes |
|----------|----------|-------|
| `/organization/*` | `/organizations/*` | Plural noun for consistency |

### Organization Settings
| Old Path | New Path | Notes |
|----------|----------|-------|
| `/organization-settings/*` | `/organizations/settings/*` | Nested under organizations |

### Invite Tokens
| Old Path | New Path | Notes |
|----------|----------|-------|
| `/invite-tokens/*` | `/organizations/invite-tokens/*` | Nested under organizations |

---

## 👤 User Routes

| Old Path | New Path | Notes |
|----------|----------|-------|
| `PATCH /update-user/profile` | `PATCH /users/profile` | Simplified naming |

**File**: `src/routes/userRoutes.ts` (renamed from userUpdateRoutes.ts)

---

## 🤖 SMA (Smart Meeting Assistant) Routes

**All SMA routes merged into single router**: `src/routes/smaRoutes.ts`

### Recording Routes
| Old Path | New Path | Notes |
|----------|----------|-------|
| `POST /sma/meetings/:meetingId/recordings` | **No change** | Upload recording |
| `GET /sma/meetings/:meetingId/recordings` | **No change** | Get recordings |
| `DELETE /sma/recordings/:recordingId` | **No change** | Delete recording |
| `POST /sma/meetings/:meetingId/process-ai` | **No change** | Trigger AI processing |

### Transcript Routes
| Old Path | New Path | Notes |
|----------|----------|-------|
| `GET /sma/meetings/:meetingId/transcript` | **No change** | Get transcript |
| `GET /sma/meetings/:meetingId/transcript/status` | **No change** | Get transcription status |

### AI Routes
| Old Path | New Path | Notes |
|----------|----------|-------|
| `GET /sma/meetings/:meetingId/summary` | **No change** | Get AI summary |
| `POST /sma/meetings/:meetingId/summary/regenerate` | **No change** | Regenerate summary |
| `GET /sma/meetings/:meetingId/action-items` | **No change** | Get action items |
| `POST /sma/meetings/:meetingId/action-items` | **No change** | Create action item |
| `PATCH /sma/action-items/:actionItemId` | **No change** | Update action item |
| `GET /sma/meetings/:meetingId/notes` | **No change** | Get notes |
| `POST /sma/meetings/:meetingId/notes` | **No change** | Create note |
| `DELETE /sma/notes/:noteId` | **No change** | Delete note |

---

## 📅 Meeting & Availability Routes

| Prefix | Change | Notes |
|--------|--------|-------|
| `/meetings/*` | **No change** | Already well-organized |
| `/availability/*` | **No change** | Already well-organized |

---

## 🌐 Public & Storage Routes

| Prefix | Change | Notes |
|--------|--------|-------|
| `/public/*` | **No change** | Public booking routes |
| `/storage/*` | **No change** | Storage routes |

---

## 📁 File Structure Changes

### New Files
- `src/routes/auth/googleOAuthRoutes.ts` - Google OAuth authentication
- `src/routes/integrations/googleCalendarRoutes.ts` - Google Calendar integration
- `src/routes/smaRoutes.ts` - Merged SMA routes (recordings, transcripts, AI)
- `src/routes/userRoutes.ts` - User management routes

### Removed Files
- `src/routes/googleRoutes.ts` - Split into auth and integrations
- `src/routes/recordingRoutes.ts` - Merged into smaRoutes.ts
- `src/routes/transcriptRoutes.ts` - Merged into smaRoutes.ts
- `src/routes/aiRoutes.ts` - Merged into smaRoutes.ts
- `src/routes/userUpdateRoutes.ts` - Renamed to userRoutes.ts

### Modified Files
- `src/routes/indexRouter.ts` - Updated to use new route structure with organized sections

---

## 🎯 Key Improvements

1. **Clear Separation**: Auth routes separated from integration routes
2. **Consistent Naming**: Using plural nouns (`/users`, `/organizations`)
3. **Logical Nesting**: Related routes nested appropriately (`/organizations/settings`)
4. **Reduced Files**: 3 SMA routers merged into 1
5. **Better Organization**: Routes organized by domain/feature

---

## 🔄 Migration Checklist for Frontend/API Consumers

- [ ] Update all Google OAuth endpoints to use `/auth/google/*`
- [ ] Update Google Calendar integration endpoints to use `/integrations/calendar/*`
- [ ] Update sync endpoints to use `/integrations/calendar/sync/*`
- [ ] Update organization endpoints to use `/organizations/*` (plural)
- [ ] Update organization settings endpoints to use `/organizations/settings/*`
- [ ] Update invite token endpoints to use `/organizations/invite-tokens/*`
- [ ] Update user update endpoints to use `/users/*`
- [ ] SMA endpoints remain unchanged at `/sma/*`

---

## ⚠️ Breaking Changes

All path changes listed above are **breaking changes** and require API consumer updates.

### Quick Reference - Most Common Changes

```diff
# Authentication
- GET /google/login
+ GET /auth/google/login

# Calendar Integration
- GET /google/oauth
+ GET /integrations/calendar/connect

- POST /google/calendar/sync
+ POST /integrations/calendar/sync

# Organization
- GET /organization/:orgId
+ GET /organizations/:orgId

- GET /organization-settings/:orgId
+ GET /organizations/settings/:orgId

# User
- PATCH /update-user/profile
+ PATCH /users/profile

# Sync
- POST /sync/start
+ POST /integrations/calendar/sync/start
```

---

**Date**: 2026-02-06
**Version**: Route Restructuring v1.0
