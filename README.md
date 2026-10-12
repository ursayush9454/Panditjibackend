# Vaidic Sanskar Backend

Node.js + Express + MongoDB + Socket.IO backend for a pandit / astrologer / mandali booking app.

## Setup
1. `cp .env.example .env` and fill it (see comments inside).
2. MongoDB must be a **replica set** (Atlas is fine) because the wallet uses transactions.
3. `npm install`
4. `npm run seed:admin` and `npm run seed:pujas`
5. `npm run dev` (or `npm start`)
6. `npm test` runs the logic/schema tests (no database needed).

API base: `/api/partner` | Health: `GET /api/health`

## Modules
| Area | Mount |
|---|---|
| Auth (OTP) | `/auth` |
| Vendors (pandit/astrologer/mandali/merchant) | `/vendor`, `/pandit`, `/mandali`, `/astro`, `/merchant` |
| Scheduled bookings + slots | `/bookings`, `/pandit/slots` |
| **Instant booking (Uber/Rapido style)** | `/instant` |
| **Daily puja subscriptions** | `/daily-puja` |
| **Payments (Razorpay)** | `/payments` |
| Kundli / birth profiles | `/astrology` |
| Astrologer consultation (chat/audio/video) | `/consultation`, `/chat`, WebRTC sockets |
| Wallet, earnings, commission | `/wallet`, `/earnings`, `/commission` |
| Reviews, notifications, admin | `/reviews`, `/notifications`, `/admin` |

See `REVIEW.md` for the full audit, what was fixed, and the API of the new modules.
