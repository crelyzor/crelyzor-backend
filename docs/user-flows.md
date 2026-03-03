# User Types & Flows

## Overview

The application supports 5 types of users with different access levels and flows.

| Type | Has Account | Org Role | Personal Workspace | Can Invite |
|------|-------------|----------|-------------------|------------|
| Solo User | ✅ | OWNER (personal) | ✅ | ❌ (no team) |
| Org Owner | ✅ | OWNER | ✅ | ✅ (all roles) |
| Org Admin | ✅ | ADMIN | ✅ | ✅ (members) |
| Org Member | ✅ | MEMBER | ✅ | ❌ |
| External Guest | ❌ | N/A | ❌ | ❌ |

---

## 1. 👤 Solo User (Personal Workspace)

**Who:** Individual using the app for personal scheduling

### Sign Up Flow
```
Google Sign In 
    → Auto-create Personal Workspace (ownerId = userId)
    → User is OWNER of personal org
    → OrgMember created automatically
```

### Setup
- Set availability (weekly recurring slots)
- Connect Google Calendar (optional)
- Connect Zoom (optional)
- Set meeting preference (Google Meet / Zoom)
- Enable public booking link

### Daily Use
- Schedule meetings (with external guests)
- Share public booking link
- Sync with Google Calendar
- Upload recordings → Get transcripts → AI summaries
- Manage action items

### Upgrade Path
```
Create Team Org → Invite members → Becomes team admin
```

---

## 2. 👑 Org Owner (Team Creator)

**Who:** Person who creates a team organization

### Create Org Flow
```
Already has account 
    → Click "Create Organization"
    → Enter: Name, description, branding
    → Organization created (ownerId = null, team org)
    → User added as OrgMember with OWNER role
```

### Setup
- Configure org settings
- Set default meeting provider (Google Meet / Zoom)
- Configure notification preferences
- Set up Brevo for org emails

### Invite Team Flow
```
Invite by email 
    → Token created (type: INVITE)
    → Specify role (ADMIN or MEMBER)
    → Email sent with invite link
```

### Management
- View all team members
- Change member roles
- Remove members
- View all team meetings
- Access all recordings/transcripts

### Permissions
| Action | Allowed |
|--------|---------|
| Everything | ✅ Full access |

---

## 3. 🔧 Org Admin (Team Admin)

**Who:** Trusted team member with management access

### Join Flow
```
Receives invite email 
    → Click link 
    → Google Sign In
    → If new user: account created
    → OrgMember created with ADMIN role
    → Personal workspace also exists
```

### Setup
- Set personal availability
- Connect personal Google Calendar
- Connect Zoom
- Enable public booking

### Management
- Invite new members (MEMBER role only)
- View team calendar
- Schedule team meetings
- Access team recordings/transcripts

### Permissions
| Action | Allowed |
|--------|---------|
| Invite members (as MEMBER) | ✅ |
| Manage meetings | ✅ |
| View all team data | ✅ |
| Remove other admins | ❌ |
| Delete organization | ❌ |
| Change org settings | ❌ |

---

## 4. 👥 Org Member (Team Member)

**Who:** Regular team member

### Join Flow
```
Receives invite email 
    → Click link 
    → Google Sign In
    → OrgMember created with MEMBER role
    → Personal workspace also exists
```

### Setup
- Set personal availability
- Connect Google Calendar
- Enable public booking (if allowed)

### Daily Use
- View team calendar
- Schedule meetings (with team or external)
- Accept/decline meeting invites
- Upload recordings for own meetings
- View transcripts & summaries
- Manage own action items

### Permissions
| Action | Allowed |
|--------|---------|
| Own meetings (create, edit, delete) | ✅ |
| Own availability | ✅ |
| Own recordings/transcripts | ✅ |
| Invite members | ❌ |
| View others' private meetings | ❌ |
| Org settings | ❌ |

---

## 5. 🌐 External Guest (Public Booking)

**Who:** External person booking via public link (NOT a user)

### Book Meeting Flow
```
Visit public booking link (shareToken)
    → See member's available slots
    → Select slot
    → Enter: name, email, message
    → Submit
```

### Meeting Created
- Meeting with status: `PENDING_ACCEPTANCE`
- `guestEmail`, `guestName`, `guestMessage` saved
- `MeetingGuest` record created
- Notification sent to member
- Guest receives confirmation email

### Member Response Flow
```
Accept → Meeting ACCEPTED → Both get calendar invite
Decline → Meeting DECLINED → Guest notified
Reschedule → Propose new time → Guest notified
```

### Key Points
- **No account needed**
- Guest interacts only via email
- No login required

---

## Workspace Switching (Notion-style)

Users with multiple organizations can switch between workspaces:

```
┌─────────────────────────────┐
│  Switch Workspace:          │
│  ┌───────────────────────┐  │
│  │ 👤 Personal           │  │  ← Always exists
│  ├───────────────────────┤  │
│  │ 🏢 Acme Corp (Owner)  │  │  ← Created by user
│  ├───────────────────────┤  │
│  │ 🏢 Beta Inc (Member)  │  │  ← Invited to
│  ├───────────────────────┤  │
│  │ ➕ Create Team        │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

---

## Database Models Reference

| User Type | User | OrgMember | UserRole | Organization |
|-----------|------|-----------|----------|--------------|
| Solo | ✅ | ✅ (personal org) | OWNER | ✅ (ownerId set) |
| Org Owner | ✅ | ✅ | OWNER | ✅ (ownerId null) |
| Org Admin | ✅ | ✅ | ADMIN | - |
| Org Member | ✅ | ✅ | MEMBER | - |
| Guest | ❌ | ❌ | ❌ | ❌ |
