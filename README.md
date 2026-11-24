# Teakees Real Estate CRM & Public Property Portal

A full-stack, role-based Real Estate CRM and public property showcase platform built with **React 19**, **TypeScript**, **Tailwind CSS v4**, **Express**, **Drizzle ORM**, **Cloud SQL (PostgreSQL)**, and **Firebase Authentication**.

---

## Key Capabilities

### 1. Public Portal (No Account Required)
- **Public Showcase (`/`)**: Displays exclusively **approved and explicitly published** properties with search, property type filtering, location filtering, price range filters, and pagination. Strictly sanitizes DTOs (never exposes seller phone numbers, internal notes, or agent assignments).
- **Public Property Detail (`/properties/:id`)**: High-resolution photo gallery, HTML5 `<video>` walkthrough playback, property specifications, and Teakees Advisory inquiry details.
- **Public Seller Property Submission (`/submit-property`)**: Mobile-first intake form requiring only Seller Name, Mobile Number, Property Type, Property Location, and Short Description — plus optional specifications, desktop/gallery uploads, and mobile camera photo/video capture (`capture="environment"`). Returns a unique `SUB-YYYYMMDD-XXXX` reference number and 48-hour callback guarantee.

### 2. Three-Role Access Control (`ADMIN`, `TELECALLER`, `AGENT`)
- **Admin (`ADMIN`)**:
  - **Property Submissions Queue**: Review incoming public and telecaller submissions, inspect/download photos & videos, edit details, approve, request info, reject (with mandatory reason — rejected submissions are preserved for audit), and transactionally convert approved submissions into unpublished CRM properties.
  - **48-Hour Seller Contact SLA**: Tracks `PENDING`, `OVERDUE` (>48h), and `CONTACTED` (updated only on explicit logged contact interactions, never merely from viewing).
  - **Explicit Publishing Controls**: Properties start **unpublished** (`is_published = false`) after approval/conversion and only go live on explicit Admin publish action (`Publish` / `Unpublish` with confirmation & publication history).
  - **Salesperson Assignment & Media Manager**: Assign properties to active advisors with full assignment history, upload photos/videos, reorder media, set cover images, and delete media.
  - **Governance, Notifications & User Administration**: Real-time unread notifications bell, immutable `audit_logs`, and PostgreSQL team member management across `ADMIN`, `TELECALLER`, and `AGENT`.
- **Telecaller (`TELECALLER`)**:
  - Strictly isolated intake workspace displaying only the property submission form (with photo/video uploads) and **My Submitted Properties** list.
- **Agent / Salesperson (`AGENT`)**:
  - Scoped to assigned properties only (`GET /api/agent/properties`): view seller contact numbers, upload/manage property media on assigned properties, update field availability/notes, and log follow-up tasks. Blocked from publishing, reassignment, submissions admin queue, and settings.

### 3. CRM Operations Workspace (`/crm`)
- Complete agency modules including Executive Dashboard, Interactive Leaflet Property Map, Leads & Buyer-Property Matching Engine, Sellers Directory, Running Properties, Follow-ups Calendar, Deals & Sales, Investments & ROI, Stay & Rentals, and Reports.

---

## Media Storage & Environment Configuration

All media uploads are inspected for true **magic bytes** (blocking disguised executables/scripts), stripped of EXIF metadata, processed into WebP derivatives + `480×320` thumbnails via `sharp`, and served with HMAC-signed private tokens or strict public published checks + HTTP `206 Range` video streaming.

Configure in environment variables (see `.env.example`):

- `STORAGE_DRIVER`: `local` (default persistent disk) or `s3` (auto-selected when `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` are configured).
- `MEDIA_STORAGE_DIR`: Directory path for persisted media (`./storage/media` in local dev; point to a mounted persistent disk such as `/var/data/media` in production).
- `STORAGE_REQUIRE_DURABLE`: Set `true` in production to refuse ephemeral `/tmp` storage.
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`: S3-compatible object storage credentials (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO) signed with AWS SigV4.
- `CORS_ALLOWED_ORIGINS`: Comma-separated allowed frontend origins for `/api/*` requests.
- `MAX_PHOTO_SIZE_MB`: Maximum photo upload size (default `10`).
- `MAX_VIDEO_SIZE_MB`: Maximum video upload size (default `100`).
- `MAX_PHOTOS_PER_SUBMISSION`: Default `12`.
- `MAX_VIDEOS_PER_SUBMISSION`: Default `3`.
- `MEDIA_TOKEN_SECRET`: Secret used to sign short-lived internal media preview/download URLs.
- Cloud SQL PostgreSQL connection environment variables (`SQL_HOST`, `SQL_DB_NAME`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`) provided automatically at runtime.

---

## Commands

```bash
# Start full-stack Express + Vite development server (port 3000)
npm run dev

# Type-check with TypeScript
npm run lint

# Build frontend for production
npm run build

# Start production Express server
npm start

# Run automated workflow & RBAC tests
npx tsx --test tests/apiWorkflow.test.ts
```
