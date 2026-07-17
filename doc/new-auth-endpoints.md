# New Auth Endpoints — Phone + PIN Login/Register

Three new/changed endpoints under `/api/auth/user` implementing a phone + PIN login/register flow (replaces the old email/password login; Google OAuth via `/google` is unaffected).

Source: `routes/auth/user/index.js`, `controllers/auth/user/index.js`, model `models/userModel.js`.

**Flow overview**:
1. Client calls `POST /login` with just `phoneNumber`.
2. If the response says `is_new_user: true` → client collects a PIN (+ optional name/email) and calls `POST /register`.
3. If the response says `is_new_user: false` → client prompts for the PIN and calls `POST /verify-login`.
4. Either path 2 or 3 ends with a JWT (`token`) to use as `Authorization: Bearer <token>` on user-authenticated routes.

---

## POST /api/auth/user/login

Step 1. The client sends only a phone number; the server tells it whether to continue to `/register` (new/incomplete signup) or `/verify-login` (existing, fully-registered account).

### Auth

None — this is the public entry point of the flow.

### Headers

| Header | Required | Value |
|---|---|---|
| Content-Type | Yes | `application/json` |

### Path / Query params

None.

### Request body

```json
{
  "phoneNumber": "string (required)"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| phoneNumber | string | Yes | Looked up as-is against `User.phone` (no normalization/formatting is applied). |

### Response

**Success `200`**:

```json
{
  "statusCode": 200,
  "data": { "is_new_user": true },
  "message": "New user, please complete registration",
  "success": true
}
```

or, for a phone number that has already completed registration:

```json
{
  "statusCode": 200,
  "data": { "is_new_user": false },
  "message": "Enter your PIN to continue",
  "success": true
}
```

| Field | Type | Description |
|---|---|---|
| data.is_new_user | boolean | `true` → call `POST /register` next. `false` → call `POST /verify-login` next. |

No token is issued at this step.

**Errors**:

| Status | Body | Cause |
|---|---|---|
| 400 | `{ "message": "Phone number is required" }` | `phoneNumber` missing/empty in the request body |

### Notable behavior

- If no `User` document exists for `phoneNumber`, one is created immediately with only `{ phone }` set — no `pin`, `name`, or `email` yet. Calling `/login` always persists something for a new number, even before the user finishes registration.
- `is_new_user` is derived from whether the matched (or just-created) user has a `pin` set — this covers both a brand-new phone number and a phone number that started registration previously but never called `/register` to finish it (abandoned signup).
- This endpoint does not accept or check a PIN; it is purely a lookup/branch step.

---

## POST /api/auth/user/verify-login

Step 2 for **existing, fully-registered** users (i.e. `POST /login` returned `is_new_user: false`). Verifies the 4-digit PIN and, on success, logs the user in.

### Auth

None — this endpoint itself is the authentication step and returns the JWT to use afterward.

### Headers

| Header | Required | Value |
|---|---|---|
| Content-Type | Yes | `application/json` |

### Path / Query params

None.

### Request body

```json
{
  "phoneNumber": "string (required)",
  "pin": "string, 4 digits (required)"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| phoneNumber | string | Yes | Must match a `User.phone` that has already completed registration (has a `pin` set). |
| pin | string | Yes | Compared against the stored bcrypt hash via `user.matchPin()`. |

### Response

**Success `200`**:

```json
{
  "statusCode": 200,
  "data": {
    "id": "...",
    "name": "Alice Test",
    "email": "alice@example.com",
    "phone": "9999900001",
    "token": "<jwt>"
  },
  "message": "Login successful",
  "success": true
}
```

`token` is a JWT (`{ id: userId }`, signed with `JWT_SECRET`, no expiry).

**Errors**:

| Status | Body | Cause |
|---|---|---|
| 400 | `{ "message": "Phone number and pin are required" }` | `phoneNumber` or `pin` missing |
| 404 | `{ "message": "User not found. Please register first." }` | No user for that phone, or user exists but has no `pin` yet (registration incomplete — call `/register` instead) |
| 401 | `{ "message": "Invalid PIN" }` | Phone found, PIN doesn't match (counts against the rate limit below) |
| 429 | `{ "message": "Too many incorrect attempts. Please try again in an hour." }` | 10 wrong attempts already recorded within the current rolling 1-hour window |

### Notable behavior — PIN attempt rate limiting

- Each user tracks `pinAttempts` (Number) and `pinAttemptsWindowStart` (Date) on their document.
- A wrong PIN increments `pinAttempts`; if no window is currently running, one starts (`pinAttemptsWindowStart = now`).
- If the window has been running for **more than 1 hour**, it is reset (`pinAttempts = 0`, a fresh window starts) before the current attempt is evaluated.
- Once `pinAttempts` reaches **10** inside a live window, every further call — including one with the *correct* PIN — is rejected with `429` until the window expires.
- A correct PIN resets `pinAttempts` to `0` and clears `pinAttemptsWindowStart`.
- **Known limitation**: this endpoint identifies the account purely by `phoneNumber` in the body (no session/token from `/login` is required first) — anyone who knows a registered phone number can call `/verify-login` directly. The 10-attempts-per-hour limit is the only brute-force protection on the 4-digit PIN.

---

## POST /api/auth/user/register

Step 2 for **new users** (i.e. `POST /login` returned `is_new_user: true`). Sets the PIN — and optionally `name`/`email` — on the stub user record, completing registration and logging the user in.

### Auth

None.

### Headers

| Header | Required | Value |
|---|---|---|
| Content-Type | Yes | `application/json` |

### Path / Query params

None.

### Request body

```json
{
  "phoneNumber": "string (required)",
  "pin": "string, exactly 4 digits (required)",
  "name": "string (optional)",
  "email": "string (optional)"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| phoneNumber | string | Yes | Identifies the stub user created by `POST /login`. If no user exists for this phone yet (client called `/register` without `/login` first), one is created here. |
| pin | string | Yes | Must match `/^\d{4}$/` (exactly 4 digits). Stored bcrypt-hashed. |
| name | string | No | |
| email | string | No | If provided, must be unique across users; also triggers a welcome email. |

### Response

**Success `201`** (see note on HTTP status below):

```json
{
  "statusCode": 201,
  "data": {
    "id": "...",
    "name": "Alice Test",
    "email": "alice@example.com",
    "phone": "9999900001",
    "token": "<jwt>"
  },
  "message": "Registration successful",
  "success": true
}
```

`token` is a JWT (`{ id: userId }`, signed with `JWT_SECRET`, no expiry).

**Note**: the success path calls `res.json(new ApiResponse(201, ...))` without also calling `.status(201)`, so the actual HTTP status code returned is `200`, even though the JSON body's `statusCode` field says `201`. Check `success`/`data.token` in the body rather than the HTTP status code to detect success.

**Errors**:

| Status | Body | Cause |
|---|---|---|
| 400 | `{ "message": "Phone number and pin are required" }` | `phoneNumber` or `pin` missing |
| 400 | `{ "message": "Pin must be exactly 4 digits" }` | `pin` fails `/^\d{4}$/` |
| 400 | `{ "message": "User already registered. Please login." }` | A user already exists for this phone **and** already has a `pin` set — call `/login` → `/verify-login` instead |
| 400 | `{ "message": "Email already exists" }` | `email` was supplied and is already used by a different user |

### Notable behavior

- Looks up the existing stub record for `phoneNumber` (normally created by `POST /login`); if none exists, creates one on the fly.
- The email-uniqueness check excludes the current user's own `_id`, so re-submitting the same email for the same in-progress stub doesn't false-positive as a duplicate.
- Sends a welcome email asynchronously (`sendWelcomeEmail`, fire-and-forget via `setImmediate`) **only if `email` was provided** — no email means no welcome email, and no error either way (failures are only logged, they never affect the response).
- This is a one-time completion step: once `pin` is set, calling `/register` again for the same phone returns the `400 "User already registered"` error above.
