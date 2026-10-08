# Aranya API

Express + MongoDB backend for the Aranya storefront and admin console
(`aranya-pure-living`).

## Setup

```bash
npm install
cp .env.example .env      # then fill in MONGODB_URI, JWT_SECRET and the admin login
npm run seed              # products, settings and the first admin account
npm run dev               # http://localhost:4000
```

`npm run seed` only creates what is missing, so it is safe to re-run.

The frontend reads the API address from `VITE_API_URL` (default
`http://localhost:4000`). Add the frontend's origin to `CORS_ORIGINS` here.

### Sample data

```bash
npm run seed:demo         # ~60 days of sample orders and customers for the charts
npm run seed:demo:clear   # remove them again
```

Sample records are flagged `demo: true` and use `@example.com` addresses.

## Endpoints

All routes are under `/api`.

| Area | Routes | Auth |
| --- | --- | --- |
| Health | `GET /health` | – |
| Storefront | `GET /store/catalog` · `GET /store/images/:id` · `POST /store/messages` · `POST /store/track` | – |
| Ordering | `POST /store/orders` | customer |
| Sign-in (both roles) | `POST /auth/login` → `{ role, token }` | – |
| Forgot password (both roles) | `POST /auth/forgot` · `POST /auth/reset` | – |
| Customer account | `POST /account/register` · `GET, PUT /account/me` · `POST /account/password` · `GET /account/orders` | register is public |
| Customer returns | `POST /account/orders/:orderId/return` | customer |
| Admin session | `GET /auth/me` · `POST /auth/password` | admin |
| Products | `GET, POST /admin/products` · `PUT, DELETE /admin/products/:id` | admin |
| Product photos | `POST /admin/uploads` (raw JPG/PNG/WebP body, 2 MB max) | admin |
| Orders | `GET /admin/orders` · `PATCH /admin/orders/:orderId/status` (`advance` or `cancel`) | admin |
| Returns | `PATCH /admin/orders/:orderId/return` (`approve`, `reject` or `refund`) | admin |
| Admin access | `GET, POST /admin/operators` · `DELETE /admin/operators/:id` | admin |
| Customers | `GET /admin/customers` · `GET /admin/customers/:id/orders` · `DELETE /admin/customers/:id` | admin |
| Inbox | `GET /admin/messages` · `PATCH, DELETE /admin/messages/:id` | admin |
| Settings | `GET, PUT /admin/settings` | admin |
| Analytics | `GET /admin/analytics?days=14` | admin |

Protected routes expect `Authorization: Bearer <token>`.

## Roles

Everyone signs in through the same endpoint, `POST /auth/login`. The account
the email belongs to decides the role, and the token is issued for that role
only — the two are not interchangeable. An email can belong to a customer or
an admin, never both.

- **Customers** register on the storefront (`/account/register`). A customer
  token can place orders and read that customer's own orders — nothing under
  `/admin`.
- **Admins** have no sign-up. The first admin is created by `npm run seed`
  from `ADMIN_EMAIL` and `ADMIN_PASSWORD`; after that an admin promotes a
  customer account (`POST /admin/operators`) or demotes an admin back to a
  customer (`DELETE /admin/operators/:id`). Email and password are kept both
  ways. An admin token is not accepted by customer routes.

## How it behaves

- **Orders are priced on the server.** The storefront sends only slugs and
  quantities; prices, shipping and totals come from the database.
- **Stock is reserved atomically** when an order is placed, so the last unit
  can't be sold twice. An order that can't be fulfilled is rejected with `409`.
- **Product status is derived**, not stored: Draft when unpublished, otherwise
  Out of stock / Low stock / Live from the stock count and the low-stock
  threshold in settings.
- **Customer tiers and totals are computed from orders** on read.
- **Product photos are stored in MongoDB** and served from
  `/store/images/:id`, so they survive redeploys. A photo is deleted when its
  product is deleted or the photo is replaced.
- **Cancellations and returns.** An order can be cancelled only before it
  ships (`Paid` or `Processing`); the full total is refunded and the stock goes
  back. After delivery, money goes back only through a return: the customer
  requests one within `returnsWindowDays` of delivery, an admin approves or
  declines it, and marks it refunded once the items arrive. Returns refund the
  item prices, not shipping, and do not restock. `refundedAmount` on the order
  records what was given back; revenue figures use `total − refundedAmount`.
- **Password resets** are emailed when `SMTP_HOST` is set. Without it nothing
  is sent; in development the link is printed to the server log instead. Links
  last one hour and work once.
- **Payments are not processed.** Card and UPI orders are recorded as `Paid`
  and cash-on-delivery as `Processing`; wire up a gateway before taking real
  orders.
- **Page views** are anonymous (a per-tab session id and a traffic source) and
  expire after 120 days.

## Layout

```
src/
  server.js          entry point
  app.js             middleware and route wiring
  config.js          environment
  models/            Mongoose schemas
  routes/            auth, storefront and admin routers
  middleware/        admin auth, error handling
  seed/              seed scripts and catalogue data
```
