# Digital Cards — Product Spec

## Overview

A standalone digital business card platform that shares auth, username, and infrastructure with the Calendar product. Users create customizable digital cards, share them via QR code or link, and collect contact info from people who scan.

**Architecture**: Separate frontend (`cards-frontend`) for public card pages. Card management lives inside `calendar-frontend` dashboard. Single shared backend (`calendar-backend/src/modules/cards/`). Shared database, auth, and username system.

**URL Structure**:
- `card.yourdomain.com/:username` — default public card
- `card.yourdomain.com/:username/:slug` — specific card by slug
- `app.yourdomain.com/cards` — card management in dashboard

---

## Features

### MVP

#### Card Editor
- Create/edit a digital card with: name, title, bio, avatar, social links, contact fields (phone, email, location)
- Live preview while editing
- One default card per user

#### Public Card Page
- Clean, mobile-first profile page at `card.yourdomain.com/:username`
- Click-to-action: tap phone to call, tap email to compose, tap location for maps
- Responsive design, fast load, no auth required

#### QR Code
- Generated client-side from card URL (no stored images)
- Downloadable as PNG/SVG
- Styled with optional logo in center

#### Save to Contacts
- vCard (.vcf) download button on public card page
- One-tap save to phone contacts

#### Contact Exchange
- "Share my details" form on public card page
- Scanner submits: name, email, phone, company, optional note
- Submitted contacts appear in card owner's dashboard

#### Dashboard (Card Management)
- Card list with basic stats (total scans)
- Contact inbox — chronological feed of people who shared their info
- Card status toggle — active/paused

---

### V1

#### Multiple Cards
- Create multiple cards for different contexts (personal, work, freelance, event)
- Custom slug per card (`/username/work`, `/username/startup`)
- Set one as default (shown at `/username`)
- Duplicate card — clone and tweak for a new event

#### Themes & Customization
- Color themes, font styles, layout options
- Dark/light mode per card
- Custom accent colors and background styles

#### Analytics
- Scan count per card
- Scan timeline — when people view your card
- Geo data — city/country of scans (IP-based, privacy-friendly)
- Link click tracking — which links get tapped most
- Contact conversion rate — views vs people who shared info back
- Top performing cards comparison

#### Calendar Integration
- "Book a meeting" button on public card — links to user's availability page
- Scan -> contact saved -> suggest meeting flow
- Auto follow-up reminders — "You met John 3 days ago, schedule a call?"

#### Contact Management
- Tag/label contacts (e.g., event name, category)
- Search and filter contacts
- CSV/Excel export
- Bulk actions (export, tag, delete)

#### Email Signature
- Generate HTML email signature with card link + mini QR
- Copy-paste ready for Gmail, Outlook, etc.

---

### V2

#### Wallet Passes
- Apple Wallet / Google Wallet pass generation
- Save card as a wallet pass for quick access

#### Event Mode
- Activate for conferences/events
- Auto-tag all contacts captured during event with event name + date
- Post-event digest — "You met 12 people at TechConf, summary below"

#### Team Cards
- Organization-level card templates for employees
- Admins create base template, members customize within constraints
- Consistent branding across a company

#### NFC Support
- Tap phone to share (opens card URL)
- No custom hardware needed, uses phone's native NFC

#### Advanced Personalization
- Animated/gradient backgrounds
- Video intro — short clip on the card
- Portfolio/work section — images, project links
- Testimonials section — social proof

#### Custom Domain
- `card.mycompany.com/john` instead of platform domain
- Premium feature

#### Integrations
- CRM push — send contacts to HubSpot, Salesforce
- Zapier/webhook support for contact capture events

#### Social / Network
- Card collections — save other people's cards you've scanned
- Mutual connections — "You and John both know Sarah"
- Card exchange history timeline

---

## Monetization

| Tier | Features |
|------|----------|
| Free | 1 card, basic theme, limited analytics (scan count only) |
| Pro | Unlimited cards, all themes, full analytics, custom slug, email signature, export |
| Business | Team cards, custom domain, CRM integrations, admin controls, event mode |

---

## Data Model

```
User (existing)
  ├── username (shared with calendar)
  │
  ├── Card[]
  │     ├── id
  │     ├── userId
  │     ├── slug            — "default", "work", "startup"
  │     ├── title           — "Software Engineer @ Acme"
  │     ├── bio
  │     ├── avatarUrl
  │     ├── links[]         — JSON [{type, url, label}]
  │     ├── contactFields   — JSON {phone, email, location, website}
  │     ├── theme           — JSON {colors, font, layout}
  │     ├── isDefault       — shown at /username
  │     ├── isActive        — can be paused
  │     ├── createdAt
  │     └── updatedAt
  │
  └── CardContact[]
        ├── id
        ├── cardId          — which card was scanned
        ├── userId          — card owner
        ├── name
        ├── email
        ├── phone
        ├── company
        ├── note
        ├── tags[]          — JSON array for labels/event names
        ├── scannedAt
        └── savedByScanner  — did they save the card too?
```

---

## Infrastructure

- **Backend**: Single Express server, new `modules/cards/` directory (controller, service, routes, validators)
- **Database**: Same PostgreSQL, new tables in same Prisma schema
- **Frontend (public)**: `cards-frontend/` — lightweight, SSR-friendly, no auth, mobile-first
- **Frontend (management)**: New "Cards" section in `calendar-frontend` sidebar
- **QR**: Client-side generation (no storage)
- **vCard**: Server-side `.vcf` generation endpoint
- **Analytics**: Event tracking table, aggregated on read

---

## Implementation Order

1. Schema — Card + CardContact tables in Prisma
2. Backend — CRUD endpoints for cards, contact submission endpoint, vCard generation
3. Public card viewer — `cards-frontend` with SSR
4. Dashboard — card management pages in `calendar-frontend`
5. QR code generation (client-side)
6. Analytics tracking + dashboard
7. Calendar integration (book meeting button)
8. V1 features (multiple cards, themes, export)
9. V2 features (wallet, events, teams, integrations)
