# price-me-gs

Automated eBay price tracker for physical game collections. Searches eBay for CIB (Complete in Box) listings, filters them using Gemini AI, and calculates a fair market price — running on a schedule via GitHub Actions.

Built as a personal tool to track the value of a retro game collection and surface games worth adding to a wishlist.

---

## How It Works

```
Games list (DB or JSON)
        │
        ▼
  eBay Browse API  ──▶  raw listings (up to 50 per game)
        │
        ▼
  Gemini AI scorer  ──▶  keeps only CIB, relevant listings (relevance ≥ 6)
        │
        ▼
  Pricing algorithm  ──▶  removes outliers, averages cheapest 30%
        │
        ▼
  Output (DB or JSON)
```

### Pricing Algorithm

For each game, the price is calculated as:

1. **Outlier removal** — drop any listing priced above 2× the median
2. **Cheap end focus** — take the cheapest 30% of remaining listings (minimum 3)
3. **Mean of subset** — average those prices and round to 2 decimal places
4. Returns `null` if fewer than 3 listings survive filtering (insufficient data)

This targets the lower end of the market rather than the midpoint, reflecting real buying opportunity.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript (ESM) |
| eBay data | eBay Browse API |
| AI scoring | Google Gemini (structured JSON output via `@google/genai`) |
| Storage | PostgreSQL (production) or JSON files (local dev) |
| Automation | GitHub Actions — runs every 15 minutes |
| Testing | Vitest (35 tests) |

---

## Project Structure

```
src/
├── ebay/           # eBay OAuth + Browse API search
├── scoring/        # Gemini AI listing scorer
├── pricing/        # Price calculation algorithm
├── dal/            # Data access — DB (pg) and JSON file providers
│   └── db/         # PostgreSQL provider + result handler
└── output/         # Result handler interface + JSON writer
```

---

## Running Locally

### Prerequisites

- Node.js 22+
- An eBay Developer app (`EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`)
- A Google AI Studio API key (`GEMINI_API_KEY`)

### Setup

```bash
npm install
```

Create a `dev.env` file in the project root:

```env
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash   # optional
```

### JSON file mode (no database)

Create `tasks/games-input.json`:

```json
[
  { "id": 1, "title": "Sonic Adventure 2 Battle", "console": "GameCube" },
  { "id": 2, "title": "Pikmin", "console": "GameCube" },
  { "id": 3, "title": "Metroid Prime", "console": "GameCube" }
]
```

Run:

```bash
npm run dev
```

Output is written to `tasks/prices-output.json`:

```json
[
  {
    "id": 1,
    "title": "Sonic Adventure 2 Battle",
    "console": "GameCube",
    "price": 34.99,
    "currency": "GBP",
    "calculatedAt": "2026-03-28",
    "sampleSize": 12
  }
]
```

A `price` of `null` means fewer than 3 qualifying CIB listings were found.

### Database mode

Set `USE_DB=true` and provide a `DATABASE_URL` (PostgreSQL connection string). The app reads games from and writes results to the database instead of JSON files.

---

## GitHub Actions (Automated)

The workflow at `.github/workflows/fetch-pricing.yml` runs every 15 minutes and processes the game collection from the database. It type-checks, lints, and tests the project before running.

### Required Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `EBAY_CLIENT_ID` | eBay developer app client ID |
| `EBAY_CLIENT_SECRET` | eBay developer app client secret |
| `GEMINI_API_KEY` | Google Gemini API key |
| `DATABASE_URL` | PostgreSQL connection string |

---

## Development

```bash
npm test          # run all tests
npm run typecheck # TypeScript type check
npm run lint      # ESLint
```
