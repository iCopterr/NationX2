# NationX Backend — Architecture Reference

## Tech Stack
- **Runtime**: Node.js + TypeScript (strict mode)
- **Framework**: Express 4
- **Database**: PostgreSQL (via `pg` pool)
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **Validation**: express-validator

---

## Directory Structure

```
src/
├── types/index.ts            # All shared types, enums, interfaces
├── config/index.ts           # Env-driven config (no hardcoding)
├── database/
│   ├── pool.ts               # pg Pool + query helpers
│   ├── migrate.ts            # Full schema migration
│   └── seed.ts               # Item recipe seed data
├── models/
│   ├── User.ts               # User CRUD + password hashing
│   ├── Country.ts            # Country CRUD + stat updates
│   ├── Resource.ts           # Resource with capacity enforcement
│   ├── Knowledge.ts          # XP-based level system
│   ├── Policy.ts             # Policy + allocation management
│   ├── Production.ts         # Recipes + production orders
│   ├── Market.ts             # Listings + transactions + dynamic price
│   └── GlobalEvent.ts        # World events + country responses
├── services/
│   ├── AuthService.ts        # Register/login, bootstrap new nation
│   ├── ResourceService.ts    # Produce, consume, explore
│   ├── KnowledgeService.ts   # Research + passive XP from allocation
│   ├── PolicyService.ts      # Enact/repeal, cost deduction, multipliers
│   ├── ProductionService.ts  # Craft validation → order → completion
│   ├── MarketService.ts      # List, buy (escrow + tax), cancel
│   ├── EconomyLoopService.ts # THE TICK ENGINE — orchestrates everything
│   └── GlobalEventService.ts # Random events, effects, responses
├── middleware/
│   ├── auth.ts               # JWT authenticate + ownCountryOnly
│   └── error.ts              # AppError + global error handler
├── controllers/
│   ├── helpers.ts            # extractErrors helper
│   ├── AuthController.ts
│   ├── CountryController.ts
│   ├── ResourceController.ts
│   ├── KnowledgeController.ts
│   ├── PolicyController.ts
│   ├── ProductionController.ts
│   ├── MarketController.ts
│   ├── EconomyController.ts
│   └── GlobalEventController.ts
├── routes/index.ts           # All routes wired together
├── app.ts                    # Express app factory
└── server.ts                 # Entry point + schedulers
```

---

## Economy Tick Flow (per country, every `TICK_INTERVAL_MS`)

```
Tax Revenue
    ↓
Policy Per-Tick Costs Deducted
    ↓
Resource Production (multiplied by policies)
    ↓
Resource Consumption (deficits → happiness penalty)
    ↓
Passive Knowledge XP (from budget allocation)
    ↓
Completed Production Orders → resource delivery
    ↓
GDP Growth Calculation
    ↓
Happiness / Unemployment Update
    ↓
Tick Logged (economy_ticks table)
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | — | Register + create country |
| POST | `/api/v1/auth/login` | — | Login, get JWT |
| GET | `/api/v1/auth/me` | ✅ | My user payload |
| GET | `/api/v1/countries` | — | Leaderboard (by GDP) |
| GET | `/api/v1/countries/me` | ✅ | My country + last tick |
| GET | `/api/v1/countries/me/history` | ✅ | Economy tick history |
| GET | `/api/v1/countries/:id` | — | Any country detail |
| GET | `/api/v1/resources` | ✅ | My resources |
| POST | `/api/v1/resources/explore` | ✅ | Invest money to find resources |
| GET | `/api/v1/knowledge` | ✅ | My knowledge levels |
| POST | `/api/v1/knowledge/research` | ✅ | Active research (costs money) |
| GET | `/api/v1/policies` | ✅ | My policies |
| GET | `/api/v1/policies/catalog` | ✅ | Available policy catalog |
| GET | `/api/v1/policies/allocation` | ✅ | Budget allocation |
| PUT | `/api/v1/policies/allocation` | ✅ | Update allocation (≤100%) |
| POST | `/api/v1/policies/propose` | ✅ | Propose policy from catalog |
| POST | `/api/v1/policies/:id/enact` | ✅ | Enact (costs money) |
| POST | `/api/v1/policies/:id/repeal` | ✅ | Repeal active policy |
| GET | `/api/v1/production/recipes` | ✅ | All item recipes |
| GET | `/api/v1/production/orders` | ✅ | My production orders |
| GET | `/api/v1/production/orders/active` | ✅ | Active orders |
| POST | `/api/v1/production/craft` | ✅ | Start production |
| GET | `/api/v1/market` | ✅ | All active listings |
| GET | `/api/v1/market/my` | ✅ | My listings |
| GET | `/api/v1/market/transactions` | ✅ | My trade history |
| GET | `/api/v1/market/price/:type` | ✅ | Dynamic price for resource |
| POST | `/api/v1/market/list` | ✅ | List item (escrow) |
| POST | `/api/v1/market/buy/:id` | ✅ | Buy listing (10% tax) |
| DELETE | `/api/v1/market/:id` | ✅ | Cancel listing (refund) |
| GET | `/api/v1/events` | ✅ | Active global events |
| GET | `/api/v1/events/:id` | ✅ | Event detail |
| POST | `/api/v1/events/:id/respond` | ✅ | Respond to event |
| POST | `/api/v1/economy/tick` | ✅ | Manual global tick (dev) |
| POST | `/api/v1/economy/tick/me` | ✅ | Manual tick my country (dev) |
| POST | `/api/v1/events/trigger` | ✅ | Trigger random event (dev) |

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit DB credentials in .env

# 3. Run database migration
npm run db:migrate

# 4. Seed item recipes
npm run db:seed

# 5. Start dev server
npm run dev
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Every action costs money/resources | No free gains — scarcity enforced |
| Knowledge uses exponential XP curve | Diminishing returns, no runaway advantage |
| Market uses escrow model | Resources deducted on list, not on sale |
| 10% market tax on every trade | Encourages direct deals, funds "global" |
| Policy allocation drives passive XP | Budget = long-term strategy choice |
| Resource deficits → happiness penalty | Consequences chain across systems |
| Tick logging | Full audit trail for economy history |
| Factory pattern for app | Clean testability, no side effects at import |