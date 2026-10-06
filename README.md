# Shagun Beauty Backend

Node.js / Express / MongoDB backend for Shagun Beauty.

---

## Shiprocket Shipping Integration

This backend integrates with the [Shiprocket API (v1 external)](https://apidocs.shiprocket.in/) for automated shipping fulfillment, courier serviceability checks, AWB assignment, pickup scheduling, label generation, manifest generation, tracking, and status synchronizations via webhooks.

### 1. Required Environment Variables

Add the following variables to your local `.env` file (see `env.example` for placeholders):

```env
# Shiprocket Credentials
SHIPROCKET_EMAIL=your-shiprocket-account-email@domain.com
SHIPROCKET_PASSWORD=your-shiprocket-password
SHIPROCKET_BASE_URL=https://apiv2.shiprocket.in/v1/external
SHIPROCKET_PICKUP_LOCATION=Primary
SHIPROCKET_WEBHOOK_TOKEN=your-optional-webhook-secret-token
```

> **Security Note:** Never commit real credentials or passwords to version control. Passwords and bearer tokens are never logged or exposed in client responses.

---

### 2. How Authentication & Token Management Works

- The backend logs in to Shiprocket via `POST /auth/login` using `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD`.
- The access token is cached securely server-side in memory with expiration tracking.
- All subsequent calls reuse the cached token.
- If Shiprocket returns `401 Unauthorized` (token expired), the service automatically invalidates the cached token, logs in to obtain a fresh token, and retries the request seamlessly.
- Tokens and passwords are never returned in API responses or printed to logs.

---

### 3. Order Flow & Synchronization

1. **Order Creation / Payment Verification:**
   - When a COD order is placed (`createOrder` / `createGuestOrder`) or an online payment is confirmed via Razorpay (`verifyRazorpayPayment` / payment webhook), the order is saved in MongoDB.
   - The backend automatically initiates order synchronization with Shiprocket in the background (`POST /orders/create/adhoc`).
   - The resulting `shiprocketOrderId`, `shipmentId`, and `status` are saved to the `Order.shipping` subdocument.
2. **Idempotency & Duplicate Protection:**
   - Before creating a Shiprocket order, the system checks whether `shipping.shiprocketOrderId` is already present.
   - If present, no duplicate order is sent to Shiprocket.
   - The same idempotency guarantees apply to AWB assignment (`shipping.awbCode`) and pickup generation (`shipping.pickupScheduledAt`).
3. **Failure Recovery:**
   - If Shiprocket API is temporarily down, customer order placement is never rolled back or broken.
   - The error is recorded under `order.shipping.error`, and admins can retry synchronization at any time using `POST /api/order/:id/shiprocket/create`.

---

### 4. Admin Shipping Endpoints

All admin shipping routes are protected with `adminOrSuperAdmin` JWT role authentication (`Authorization: Bearer <token>`).

| Method | Endpoint | Description | Request Body / Query |
|---|---|---|---|
| `GET` | `/api/order/shiprocket/serviceability` | Check available couriers & ETAs | Query: `pickup_postcode`, `delivery_postcode`, `weight`, `cod` |
| `POST` | `/api/order/:id/shiprocket/create` | Sync / create order in Shiprocket | Body: `{ "pickup_location": "Primary" }` (optional) |
| `POST` | `/api/order/:id/shiprocket/assign-awb` | Assign courier & generate AWB code | Body: `{ "courier_id": 123 }` (optional) |
| `POST` | `/api/order/:id/shiprocket/pickup` | Schedule pickup with courier | Body: `{ "pickup_date": "YYYY-MM-DD" }` (optional) |
| `POST` | `/api/order/:id/shiprocket/label` | Generate shipping label PDF URL | None |
| `POST` | `/api/order/:id/shiprocket/manifest` | Generate shipment manifest | None |
| `POST` | `/api/order/:id/shiprocket/print-manifest` | Print shipment manifest | None |
| `GET` | `/api/order/:id/shiprocket/tracking` | Get live tracking details from Shiprocket | None |
| `POST` | `/api/order/:id/shiprocket/cancel` | Cancel shipment/order in Shiprocket | None |

---

### 5. Webhook Notifications

Shiprocket push notifications for tracking and status updates are received at:

```http
POST /api/webhook/shiprocket
```

- **Authentication:** Validates `SHIPROCKET_WEBHOOK_TOKEN` via `x-api-key`, `Authorization: Bearer <token>`, or query param `?token=...` if configured.
- **Processing:** Locates order by AWB code, shipment ID, or order ID.
- **Status Sync:** Automatically synchronizes statuses (e.g. `shipped`, `out_for_delivery`, `delivered`, `returned`, `cancelled`) and triggers customer email notifications when status changes.
- **Idempotency:** Repeated webhook deliveries are safely processed without duplicating side effects.
