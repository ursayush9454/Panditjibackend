# Vaidic Sanskar Backend - change log & audit

## Added in this version
- **Puja material E-Store** (`/api/partner/store`): catalog, categories, kits, cart, wishlist, addresses, coupons,
  checkout (online Razorpay + COD), multi-merchant orders, tracking, cancel/return/refund, reviews, merchant panel,
  admin panel, auto-expiry of unpaid orders, merchant settlement. See `docs/STORE_API.md`.
- **Firebase phone OTP login**: `POST /auth/firebase` (also accepts Firebase Google tokens), `POST /auth/phone/link`. `AUTH_OTP_MODE=firebase` turns the MSG91 OTP off. See `docs/AUTH_API.md`.
- **Google direct sign-in** (new users get an account without phone): `POST /auth/google`; `POST /auth/google/link` attaches Google to an account.
- `users.phone` is optional now (unique only when present; index migrates automatically). Bookings / instant puja / consultations / vendor registration require a verified phone (`needsPhone`).
- `changePhone` can no longer set an unverified number when `AUTH_OTP_MODE=firebase`.
- **Order emails** via SMTP (placed / shipped / delivered / cancelled / returned). Skipped if SMTP is not configured.
- **Booking-wise reviews**: `POST /reviews` with `bookingId` (completed bookings only, one review per booking).

## Fixed
- Horoscope: provider text language is now checked against `HOROSCOPE_LANGUAGE` (it used to save Ukrainian text).
  The `501 not configured` stub in `astrologyService.getHoroscope` now reads the stored horoscope.
- `Order.cancelReason` was nested inside `shippingAddress` and never saved.
- Duplicate route mounts (`/bookings`, `/notifications`) removed.
- Outdated `InstantRequest` test (missing `scheduledAt`) fixed.
- Legacy `/orders` endpoints: atomic stock, no overselling.
- `.env.example` added (the real `.env` is not shipped; it had `JWT_SECRET` twice).

## Needs your keys before going live
Razorpay (payments), MSG91 (real SMS OTP), Navamsha (kundli + matching), Firebase (push), Google client id, SMTP.

## Known limits
- Horoscope: if the provider ignores the `lang` parameter, wrong-language text is rejected and nothing is saved.
  Point `HOROSCOPE_PROVIDER_URL` at a Hindi/English provider or publish from the admin API.
- Rate limiting is in-memory (per server instance). Use Redis if you run several instances.
- Product search uses regex matching (fine for thousands of products; add a text index/Atlas Search for more).
- Run `npm install` after copying (adds `nodemailer` and `google-auth-library` to package.json).
- No frontend is included.
