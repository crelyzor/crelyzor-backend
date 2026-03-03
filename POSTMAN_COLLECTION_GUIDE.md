# Calendar Backend API - Postman Collection Guide

## 📦 Collection File
`Calendar-Backend-API.postman_collection.json`

## 🚀 Getting Started

### 1. Import the Collection
1. Open Postman
2. Click **Import** button
3. Select the `Calendar-Backend-API.postman_collection.json` file
4. The collection will be imported with all endpoints organized by category

### 2. Configure Environment Variables

The collection uses the following variables. Set them up in Postman:

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `base_url` | API base URL | `http://localhost:3000/api/v1` or `https://your-production-url.com/api/v1` |
| `access_token` | JWT access token | (obtained after login) |
| `refresh_token` | JWT refresh token | (obtained after login) |
| `organization_id` | Current organization ID | (obtained from organization list) |

### 3. Authentication Flow

#### Step 1: Login with Google OAuth
1. Use **Google OAuth > Google Login** endpoint
2. This will redirect you to Google login
3. After successful authentication, you'll receive `access_token` and `refresh_token`
4. Copy these tokens and set them in your environment variables

#### Step 2: Get Your Organizations
1. Use **Organizations > Get User Organizations**
2. Copy the `id` of the organization you want to work with
3. Set it as `organization_id` in your environment variables

#### Step 3: Start Making Requests
Now you can use all authenticated endpoints!

## 📚 API Categories

### 🔐 Authentication
- Refresh tokens
- Logout
- Get profile
- Manage sessions

### 🔑 Google OAuth
- Sign in with Google
- OAuth callbacks

### 🏢 Organizations
- CRUD operations for organizations
- Member management
- Role management
- Email configuration (Brevo)

### ⚙️ Organization Settings
- Meeting preferences
- Organization-level configurations

### 📧 Invite Tokens
- Send invitations
- Accept/decline invites
- Manage pending invites

### 👤 Users
- Update user profile

### 🔗 Google Calendar Integration
- Connect Google Calendar
- Check connection status
- Get calendar events

### 🔄 Calendar Sync
- Trigger manual sync
- Check sync status
- Get synced events
- Link events to meetings

### 📅 Meetings
- Create/update meetings
- Request meetings
- Accept/decline requests
- Cancel/complete meetings
- Reschedule meetings
- Public booking links
- Guest invitations (public - no auth)

### 📆 Availability
- Recurring availability (weekly patterns)
- Custom slots (specific dates)
- Blocked times (unavailability)
- Get available slots (smart algorithm)

### 🌐 Public Booking
- Public booking profile (no auth)
- Public meeting requests (no auth)

### 🤖 SMA (Smart Meeting Assistant)
- **Recordings**: Upload, retrieve, delete recordings
- **Transcripts**: Get transcripts and status
- **AI Features**: 
  - AI summaries
  - Action items
  - Meeting notes

### 📦 Storage
- Generate signed upload URLs
- Upload images, files, PDFs, reports
- Delete files

## 🔑 Authentication Headers

Most endpoints require authentication. The collection is configured to automatically use the `access_token` from environment variables.

### Required Headers:

1. **Authorization Header** (automatic):
   ```
   Authorization: Bearer {{access_token}}
   ```

2. **Organization Context Header** (for organization-specific endpoints):
   ```
   x-organization-id: {{organization_id}}
   ```

## 🌟 Key Features

### Role-Based Access Control
Endpoints are protected based on user roles:
- **OWNER**: Full access to all organization features
- **ADMIN**: Management access (cannot delete organization)
- **MEMBER**: Basic access to meetings and availability

### Public Endpoints (No Authentication Required)
- Google OAuth login/callback
- Public booking profile
- Public meeting requests
- Guest invitation responses
- Invite details lookup

## 📝 Example Workflows

### Workflow 1: Creating a Meeting
1. **Get User Organizations** → Get your organization ID
2. **Get Organization Members** → Get participant IDs
3. **Create Meeting** → Create meeting with participants
4. Participants automatically receive notifications

### Workflow 2: Setting Up Availability
1. **Create Recurring Availability** → Set up weekly schedule (e.g., Mon-Fri 9-5)
2. **Create Blocked Time** → Block lunch hours (12-1 PM)
3. **Create Custom Slot** → Add special availability for specific date
4. **Get Available Slots** → View computed available time slots

### Workflow 3: Public Booking
1. **Generate Public Booking Link** → Get shareable booking link
2. Share link with clients (no authentication needed)
3. Clients use **Get Public Booking Profile** to see availability
4. Clients use **Request Meeting Public** to book time

### Workflow 4: Smart Meeting Assistant
1. **Upload Recording** → Upload meeting recording
2. **Trigger AI Processing** → Start transcription & AI analysis
3. **Get Transcription Status** → Check processing status
4. **Get Transcript** → Retrieve full transcript
5. **Get Summary** → Get AI-generated summary
6. **Get Action Items** → View extracted action items
7. **Create Note** → Add manual notes

## 🔧 Tips

1. **Token Refresh**: Use the **Refresh Token** endpoint when your access token expires
2. **Error Handling**: Check response status codes and error messages
3. **Rate Limiting**: The API has rate limiting (1000 requests/hour per user)
4. **Pagination**: Some endpoints support pagination (e.g., meetings)
5. **Date Formats**: Use ISO 8601 format for dates (e.g., `2024-02-10T10:00:00Z`)

## 🐛 Troubleshooting

### "Unauthorized" Error
- Check if `access_token` is set correctly
- Try refreshing your token
- Verify you're logged in

### "Organization not found" Error
- Check if `x-organization-id` header is set
- Verify the organization ID is correct
- Ensure you're a member of that organization

### "Forbidden" Error
- Check if you have the required role for that endpoint
- Some endpoints require OWNER or ADMIN role

## 📞 Support

For issues or questions:
1. Check the API response error messages
2. Review the route files in `src/routes/`
3. Check controller implementations for detailed logic

## 🔄 Update Instructions

When APIs change:
1. Review the route files in `src/routes/`
2. Update the Postman collection accordingly
3. Re-import into Postman

---

**Happy Testing! 🚀**
