# Real Estate CRM

A centralized, interactive Real Estate CRM web application designed to replace scattered spreadsheets for agencies managing sellers, properties, buyer leads, matching, running properties, follow-ups, deals, investments, and managed rentals.

> **Configurable Branding:** The agency name, tagline, currency symbol, commission defaults, property categories, and lead pipeline stages can all be customized live from **Settings** without modifying source code.

---

## Key Capabilities

- **Executive Dashboard**: Live metrics derived from relational CRM state (Total/Running/Available Properties, Leads, Sellers, Today's & Overdue Follow-ups, Active Deals), Sales & Commission overview, pipeline chart, clickable status breakdowns, upcoming site visits, and recent activity logs.
- **Properties & Combined Seller + Property Registration**:
  - Searchable central property database with **Table**, **Card**, and interactive **Map** views, multi-filters, sorting, and pagination.
  - Streamlined **Add Seller + Property** workflow supporting both new seller onboarding and attaching listings to existing sellers, with rich multiline descriptions, multi-image uploads, and document references.
  - Dedicated **Property Profile** page linking photos, documents, seller profile, site visits, follow-up history, deal history, and interested leads.
- **Sellers Management**: One-to-many owner directory (`Seller → Properties`), multi-property owner portfolio view, follow-up history, and seller document tracking.
- **Independent Leads & Buyer ↔ Property Matching**:
  - Register buyer leads independently without requiring a property up front.
  - Track leads across `New → Contacted → Qualified → Property Shared → Site Visit → Negotiation → Converted / Lost / On Hold`.
  - Many-to-many **Matching Engine** (`Find Matching Properties` / `Find Matching Leads`) explaining concrete matching reasons across location, budget, property type, area, and requirement keywords.
- **Running Properties**: Real-time operational view over central property records separating **Active Listings** from **Managed / Operating** properties.
- **Follow-ups & Calendar**: Organized across Today, Overdue, Upcoming, and Completed views with an interactive monthly calendar and chained completion + next-follow-up scheduling.
- **Deals & Sales**: Full transaction pipeline with automatic commission calculation, duplicate-sale guards, and automatic updates to property status (`Sold` / `Rented`) and lead status (`Converted`) on deal closure.
- **Investments & ROI**: Tracks capital deployed, additional expenses, expected vs. actual returns, and automatic ROI calculation (`(Net Profit / Total Investment) × 100`).
- **Stay & Rentals**: Daily stay and monthly/yearly lease operations covering check-ins, check-outs, deposits, contracts, rental income, maintenance expenses, and tenant records.
- **Reports & Exports**: 14 live analytical reports with date-range filtering, Excel (`.xls`) download, and print-ready PDF export.
- **Team & Role-Based Access Control (RBAC)**: Admin and Agent user management with live session switching to scope agent access to assigned records.
- **Infinity Symbol Preloader & Global Search**: Animated SVG infinity (`∞`) loader for initial hydration, page transitions, and exports, paired with `⌘K` / global search across all records.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Icons**: Lucide React
- **Build & Tooling**: Vite 8, `tsx`, TypeScript (`tsc --noEmit`)
- **Persistence**: Clean relational service layer (`src/services/crmService.ts`) backed by `localStorage` with realistic seeded data (`src/data/seedData.ts`), structured so a REST/database backend can be connected without rebuilding UI components.

---

## Project Structure

```text
src/
├── assets/images/        # Local property photography assets
├── components/common/    # Sidebar, TopNav, InfinityPreloader, Modal, Pagination, UI primitives
├── context/              # CRMContext (routing, role scoping, notifications, state sync)
├── data/                 # Realistic seeded CRM dataset
├── pages/                # All 15 CRM routes and profile detail pages
├── services/             # Relational data & business logic layer (crmService.ts)
├── types/                # TypeScript domain interfaces for all 16 CRM entities
└── utils/                # Currency/date/ROI formatters and Buyer-Property matching engine
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Type-check with TypeScript
npm run lint

# Build for production
npm run build
```
