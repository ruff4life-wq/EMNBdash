# Restaurant Operations Dashboard — Project continuity Document
## Session Date: May 14, 2026
## Continue From Here in Next Session

---

## PROJECT OVERVIEW

Building a production-grade Restaurant Operations Intelligence Dashboard
for ghost kitchen / home kitchen operators who track their delivery
business across platforms like DoorDash, Uber Eats, Grubhub, and others.

**App Owner / Operator:** Ember & Bloom Soulfire Kitchen (EBSFK)
**Developer:** Building via AI-assisted development (Cursor + Claude)
**Project Lead:** User in this conversation

---

## REPOSITORY LOCATIONS

| Repo | Path | Status |
|---|---|---|
| Dashboard App | `C:\Dev\restaurant-ops-dashboard` | ✅ Active |
| GCSI Platform | `C:\Dev\gcsi-platform` | ✅ Clean — dashboard removed |

**Dashboard runs at:** `http://localhost:3002/dashboard`
**Deployment target:** Vercel (standalone project)

---

## TECH STACK

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict mode) |
| Styling | TailwindCSS |
| Charts | Recharts |
| State | Zustand + localStorage middleware |
| Spreadsheet Parser | SheetJS (`xlsx`) |
| File Support | `.csv`, `.xlsx`, `.xlsm`, `.xls` |
| Persistence (MVP) | localStorage (`ebsfk_*` keys) |
| Persistence (Phase 3) | Supabase (not yet implemented) |
| AI Layer (Phase 3) | Next.js API routes → OpenAI/Gemini (not yet implemented) |
| Deployment | Vercel |

---

## ARCHITECTURE — CRITICAL RULE

### Two-Zone Boundary (NEVER violate this)

**Zone 1: `src/lib/operations/`**
- Framework-agnostic pure TypeScript
- Zero React, Next.js, or browser API imports
- Contains: adapters, ingestion, normalization, analytics, persistence interface
- ESLint rule enforces this boundary — build fails on violation

**Zone 2: `src/app/` and `src/components/`**
- Next.js shell, React components, Zustand store
- All external API calls go through `src/app/api/` routes only
- API keys never reach the browser — server-side only

### Why This Matters
- Core library is portable to mobile/React Native without changes
- Supabase swap at Phase 3 = one file change only
- API keys are secure by architecture, not by convention

---

## DIRECTORY STRUCTURE

```
restaurant-ops-dashboard/
├── src/
│   ├── app/
│   │   ├── dashboard/page.tsx
│   │   ├── menu/page.tsx
│   │   ├── customers/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── dev/page.tsx (Dev panel tab)
│   │   └── api/
│   │       ├── ai/query/route.ts       ← Phase 3 stub
│   │       └── export/route.ts         ← Phase 3 stub
│   ├── components/
│   │   ├── dashboard/
│   │   ├── menu/
│   │   ├── customers/
│   │   ├── import/
│   │   │   ├── DropZone.tsx
│   │   │   ├── MappingModal.tsx        ← NOT YET BUILT
│   │   │   └── ImportSummary.tsx
│   │   ├── filters/
│   │   ├── settings/
│   │   └── ui/
│   ├── lib/
│   │   └── operations/                 ← ZONE 1
│   │       ├── types/
│   │       ├── adapters/
│   │       │   ├── registry.ts
│   │       │   ├── doordash.ts         ← matches EBSFK workbook structure
│   │       │   └── generic.ts          ← fuzzy fallback
│   │       ├── ingestion/
│   │       ├── normalization/
│   │       ├── analytics/
│   │       └── persistence/
│   └── store/
│       ├── index.ts
│       ├── slices/
│       └── middleware/
├── .env.local                          ← gitignored, blank Phase 3 keys
├── .env.example                        ← committed, blank values
└── package.json
```

---

## CURRENT STATE — WHAT IS BUILT AND WORKING

### ✅ Working Correctly
- Next.js app scaffold with App Router
- Zone 1 ESLint boundary rule configured and passing
- `npm run build` passes
- `npm run lint` passes
- DoorDash adapter (maps EBSFK workbook column variations)
- Sheet classifier (scores sheets for operational data)
- Ingestion engine (parses workbook, detects headers)
- Customer name forward-fill across multi-row orders
- Excel serial date conversion (works on macro-enabled `.xlsm`)
- Normalization engine (produces `lineItems[]` and `orders[]`)
- Zustand store with localStorage persistence (`ebsfk_*` keys)
- Global filter system (date range, weeks, platform, customers, items)
- All filters derived from live data — zero hardcoded values
- Executive Overview KPIs (revenue, payout, orders, AOV, fee burden)
- Revenue over time chart (4 weekly peaks visible)
- VIP Customer Leaderboard with tier badges
- Menu Intelligence section (basic)
- Profit Simulator (fee override slider, live recalculation)
- Customer Directory with tier editing
- Menu Manager with auto-discovery notifications
- Settings page (all 7 configurable values, Export/Import/Reset)
- Dev panel (store size, filter state, mapping audit, ingestion log,
  normalized data preview, order reconstruction log)
- Phase 3 API route stubs
- `.env.example` committed with blank keys
- `.gitignore` correctly excludes `.env.local`

### ⚠️ Built But Needs Fix
- "Reset all data" button exists but is in the wrong location
  (currently in global header — needs to move to Settings page)
- Date filter initializes to `mm/dd/2026` instead of data min/max
- Menu item names have some casing variants in Items filter
  (FRIED FISH COMBO vs FRIED FISH HOAGIE COMBO — these are
  genuinely different strings, need alias resolution by operator)

### ❌ Not Yet Built
- Manual Mapping Modal (blocking modal for unknown column formats)
- First-use disclaimer modal
- DoorDash native CSV adapter (current adapter matches EBSFK
  workbook structure, not raw DoorDash platform export)
- UberEats / Grubhub adapters
- Week-over-week comparisons (Phase 2)
- Menu Engineering Matrix (Phase 2)
- Operational Insights Engine (Phase 2)
- Supabase persistence adapter (Phase 3)
- AI query layer (Phase 3)

---

## KNOWN DATA FACTS — EBSFK WORKBOOK

**File:** `EBSFK_Operations_Overview_02APR_03MAY.xlsm`
**CRITICAL:** Must use the MACRO-ENABLED `.xlsm` version for import.
The macro-stripped version produces wrong sheet names ("Sheet1"),
wrong dates (2001), and incomplete data. Do not use stripped version.

**Source workbook sheets:**
| Sheet | Type |
|---|---|
| `Menu_Prices` | menu_reference |
| `Week of 02APR_04APR` | operational_data |
| `Week of 16APR_19APR` | operational_data |
| `Week of 23APR_26APR` | operational_data |
| `Week of 30APR_03MAY` | operational_data |
| `Top 3 Summary` | summary_dashboard |
| `Order History Report` | order_history |
| `Executive Snapshot` | summary_dashboard |

**Verified full-dataset numbers (macro-enabled import):**
| KPI | Value |
|---|---|
| Total Gross Revenue | $800.50 |
| Total Net Payout | $487.68 |
| Total Orders | 56 |
| Line Items | 106 |
| Customers | ~48 (some may be case variants) |
| Active Date Range | Apr 2 – May 3 |
| Weeks Covered | 4 |

**Note on revenue variance:** Source Executive Snapshot shows $817.50
gross / $480.80 net. Dashboard shows $800.50 / $487.68. Variance
investigation (Fix 1 in fix phase) has not been completed yet.
Opposite-direction variance suggests Executive Snapshot includes
out-of-sheet adjustments not in weekly operational sheets.

**Known menu items (canonical uppercase):**
ADD FISH, BLACK GOLD CURRY GOAT, CHICKEN TENDERS & FRIES,
CURRY CHICKEN PLATE, EMBER STYLE HOUSE OXTAILS, FRIED FISH HOAGIE
COMBO, ISLAND BRAISED CHICKEN, MK'S MIX, PASSION FRUIT GTC,
SIDE OF FRIES/HOUSE CHIPS, SIDE OF PLANTAINS, SODA, SOULFIRE RASTA
PASTA, SOULFIRE RASTA PASTA: CHICKEN, SOULFIRE RASTA PASTA: CHICKEN
& SHRIMP, SOULFIRE RASTA PASTA: SHRIMP, SOUTHERN FRIED CHICKEN TACOS

**Repeat customers (2+ orders):**
DEE C. (loyal), Cevad H. (loyal), Karon H. (loyal), Jarius C.

---

## KNOWN SPREADSHEET QUIRKS (Handled in DoorDashAdapter)

1. **Customer forward-fill** — customer name only in first row of
   multi-item order. Subsequent rows blank. Fill forward until new
   non-blank customer + date combination appears.

2. **Excel date serials** — DATE column stores integers (e.g., 46114).
   Convert: `new Date(Math.round((serial - 25569) * 86400 * 1000))`
   Only apply when cell value is `typeof number` AND < 1e11.
   SheetJS may return pre-parsed Date objects for .xlsm — check type first.

3. **Weekly Totals row** — skip rows where customer cell matches
   `/weekly totals/i`

4. **Inline fee note rows** — skip rows where date, customer, menu
   item, and quantity are all blank

5. **Title rows at sheet top** — scan first 20 rows for header.
   Header = first row with ≥ 4 of: date, customer, item, revenue,
   payout, fee, quantity

6. **Inconsistent column names** — handled by DoorDashAdapter.columnMap

7. **Zero gross revenue rows** — flag as `dataQuality: 'missing_revenue'`
   but do not exclude

8. **Blank spacer rows** — skip silently

---

## FIX PHASE 1 — OUTSTANDING ITEMS

Reference document: `EBSFK_Fix_Phase_1.md` (in outputs)

Status of each fix:

| Fix | Description | Status |
|---|---|---|
| Fix 1 | Revenue variance investigation | ❌ Not started |
| Fix 2 | Menu item uppercase normalization | ⚠️ Partial — casing improved but variants remain |
| Fix 3 | Excel serial date year offset (2026→2025) | ❌ Not started |
| Fix 4 | Menu Manager UX (bulk confirm, deduplication) | ❌ Not started |
| Fix 5 | Date filter default initialization from data | ❌ Not started |
| Fix 6 | Menu Intelligence chart item labels | ❌ Not started |

**Do Fix 1 first** — revenue variance must be understood before
normalization changes that shift row counts.

---

## SECURITY ITEMS — OUTSTANDING

| Item | Priority | Status |
|---|---|---|
| Move "Reset all data" to Settings page | High — do before owner review | ❌ Not done |
| Add confirmation dialog to clear button | High | ❌ Not done (unknown if current button has one) |
| First-use disclaimer modal | High — do before owner review | ❌ Not built |
| File upload MIME type validation | Medium | ❌ Not built |
| File size limit on upload | Medium | ❌ Not built |
| Add "Clear All Data" warning text | Low | ❌ Not built |
| npm audit — resolve 4 flagged vulnerabilities | Medium | ❌ Not done |

**Cursor prompts for the two high-priority items are written and
ready to use — see conversation history.**

---

## DATA WORKFLOW — CRITICAL FINDING

**Current working workflow:**
Operator uses macro-enabled `.xlsm` workbook → drops into app →
DoorDash adapter auto-maps → dashboard populates

**Macro-stripped version does NOT work:**
Produces "Sheet1" sheet name, year-2001 dates, and partial data.
Never test with or instruct operator to use stripped version.

**Future workflow question (UNRESOLVED):**
The app owner may want to import raw DoorDash CSV exports directly
instead of maintaining the workbook manually. Three paths identified:

- **Path 1 (Best):** Build a native DoorDash CSV adapter
  Requires: actual DoorDash order export CSV from operator's
  merchant portal. Cannot be built without this file.

- **Path 2:** Build Manual Mapping Modal first
  Any CSV works, operator maps columns once, app remembers.
  Already in backlog as a required feature.

- **Path 3 (Bridge):** Provide operator a clean Excel template
  with correct column names. Paste DoorDash data in.
  Existing adapter handles it. No new code needed.

**Action needed:** Ask app owner whether they manually maintain the
workbook or want to use raw DoorDash exports. If exports, get a
sample DoorDash CSV file to build the adapter against.

---

## PHASE ROADMAP

### Fix Phase 1 (Current — before owner review)
- Fix revenue variance (investigate first)
- Normalize menu item names
- Fix date year offset
- Menu Manager bulk confirm UX
- Date filter initialization
- Menu Intelligence chart labels
- Move Reset button to Settings
- Add disclaimer modal
- Run npm audit

### Owner Review (After Fix Phase 1)
- Share app with EBSFK operator
- Collect feedback on:
  - Data accuracy vs their manual records
  - Menu Manager usability
  - Customer tier accuracy
  - Missing features they need immediately
  - Workflow question (workbook vs raw CSV)

### Phase 2 (After owner feedback)
- Manual Mapping Modal (blocking — required for CSV imports)
- Data Quality Panel
- Week-over-week comparisons
- Menu Engineering Matrix
- Operational Insights Engine
- DoorDash native CSV adapter (if operator wants raw exports)

### Phase 3 (After Phase 2 stable)
- Supabase migration (swap persistence adapter)
- User authentication
- AI query layer (Next.js API routes → OpenAI/Gemini)
- Multi-tenant support (multiple kitchens)
- UberEats / Grubhub adapters
- Mobile layout optimization

---

## PROMPT DOCUMENTS PRODUCED THIS SESSION

All saved to `/mnt/user-data/outputs/`:

| File | Description |
|---|---|
| `EBSFK_Dashboard_Build_Prompt_v2.md` | Dataset-informed prompt (superseded) |
| `EBSFK_Dashboard_Build_Prompt_v3.md` | Zero-hardcoding, multi-platform (superseded) |
| `EBSFK_Dashboard_Build_Prompt_v4.md` | Current canonical build prompt (Option 3) |
| `EBSFK_Fix_Phase_1.md` | Fix phase with builder instructions + owner test checklist |
| `project.md` | This document |

**Canonical build prompt is v4.** Use that for any new builder sessions.

---

## KEY DECISIONS MADE THIS SESSION

1. **Standalone Next.js app** — not Vite, not inside GCSI platform.
   Next.js chosen for API route security (Phase 3 AI keys),
   multi-tenant readiness, and SSR capability.

2. **Option 3 architecture** — standalone Next.js + framework-agnostic
   core library. Zone 1 boundary enforced by ESLint.

3. **Zero hardcoding rule** — every filter, label, date range, and
   chart axis must be derived from live data. No exceptions.

4. **Macro-enabled .xlsm is the test file** — stripped version does
   not work and should not be used for testing.

5. **localStorage MVP → Supabase Phase 3** — persistence adapter
   pattern means the swap is one file change.

6. **Platform adapter registry** — adding new platforms = one new
   adapter file. Nothing else changes.

7. **GCSI platform is clean** — all dashboard files and dependencies
   removed. Both repos build independently.

---

## HOW TO START NEXT SESSION

Paste this into Claude at the start of the next conversation:

"I'm continuing work on the Ember & Bloom Soulfire Kitchen restaurant
operations dashboard. The app is a standalone Next.js app at
C:\Dev\restaurant-ops-dashboard running at localhost:3002/dashboard.
Here is the project continuity document from my last session:"

Then paste this entire file.

The most important context to re-establish:
1. Zone 1 boundary rule — lib/operations is framework-agnostic
2. Macro-enabled .xlsm only for testing
3. Fix Phase 1 is the current active work
4. "Reset all data" button and disclaimer modal are the two
   security items needed before owner review
5. Revenue variance (Fix 1) must be investigated before other fixes
