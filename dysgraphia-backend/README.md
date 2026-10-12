# Dysgraphia Backend

Authenticated backend for the Smart Learn dysgraphia module.

This service uses Firebase Authentication for identity, Firestore for per-user persistence, and a catalog-driven Express API for dysgraphia shapes, letters, words, attempts, sessions, and dashboard overview data.

## Stack

- Node.js 20+
- Express
- Firebase Admin SDK
- Firestore
- multer
- sharp
- zod
- cors
- dotenv
- pino / pino-http
- vitest + supertest

## Project Layout

```text
src/
  app.js
  server.js
  config/
    env.js
    firebaseAdmin.js
  middleware/
    auth.js
    errorHandler.js
  modules/
    dysgraphia/
      catalog.js
      controller.js
      predictor.js
      progressMapper.js
      repository.js
      routes.js
      service.js
      validators.js
  utils/
    appError.js
tests/
```

## Setup

1. Install dependencies.

```bash
npm install
```

2. Create a local env file.

```bash
copy .env.example .env
```

3. Configure Firebase Admin credentials.

Supported loading order:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_PATH`
- `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` + `FIREBASE_PROJECT_ID`
- Application default credentials / `GOOGLE_APPLICATION_CREDENTIALS`

4. Set the dysgraphia frontend origin in `CORS_ORIGIN` and the module API URL in the frontend as `VITE_DYSGRAPHIA_API_URL`.

5. Start the backend.

```bash
npm run dev
```

Default health endpoint: `http://localhost:5000/health`

## Environment Variables

Required for production:

- `PORT`
- `HOST`
- `CORS_ORIGIN`
- `FIREBASE_PROJECT_ID`
- One Firebase Admin credential source

Predictor-related:

- `PREDICTOR_PROVIDER=python|mock`
- `PREDICTOR_URL` when `PREDICTOR_PROVIDER=python`
- `PREDICTOR_HEALTH_URL` optionally overrides the Python readiness endpoint
- `PREDICTOR_HEALTH_TIMEOUT_MS` controls the readiness-check timeout
- `MODEL_STARTUP_TIMEOUT_MS` controls how long Node waits for the model to load
- `MODEL_STARTUP_POLL_INTERVAL_MS` controls how frequently readiness is checked
- `MODEL_IMAGE_SIZE` controls YOLO input resolution (`416` is the speed-focused default)
- `MODEL_DEVICE` selects inference hardware (`cpu`, `cuda`, and so on)
- `MODEL_MAX_DETECTIONS` limits post-processing work for each handwriting image
- `ML_CONFIDENCE_THRESHOLD`
- `MAX_IMAGE_SIZE_MB`
- `ALLOW_MOCK_TARGET_ECHO`

Operational:

- `LOG_LEVEL`
- `ENABLE_DEV_RESET`
- `DYSGRAPHIA_CATALOG_VERSION`

See [.env.example](./.env.example) for the full template.

## Authentication

All dysgraphia API routes except `/health` require:

```http
Authorization: Bearer <firebase-id-token>
```

Backend behavior:

- Verifies the Firebase ID token with Firebase Admin
- Attaches `req.user.uid`, `req.user.email`, and `req.user.role`
- Uses the role claim from the token when present
- Falls back to `userProfiles/{uid}` in Firestore when the role is not embedded in the token

## Firestore Model

User data is stored under the existing Firebase user profile document.

```text
userProfiles/{uid}
userProfiles/{uid}/moduleProgress/dysgraphiaSummary
userProfiles/{uid}/dysgraphiaAttempts/{attemptId}
userProfiles/{uid}/dysgraphiaSessions/{sessionId}
```

`dysgraphiaSummary` contains:

- canonical catalog version
- shapes progress
- letters progress for levels 1-3
- words progress for `twoLetters` and `threeLetters`
- total stars, total minutes, sessions completed, last session date, total items completed
- server-computed achievements
- latest 30 recent sessions

## Canonical Catalog

The backend catalog is the source of truth for counts and validation.

Current totals:

- Shapes: 9
- Letters: 16
  - Level 1: `ta`, `ra`, `ya`, `ga`, `la`
  - Level 2: `pa`, `u`, `na`, `tha`, `ha`
  - Level 3: `ba`, `dha`, `ka`, `a`, `ma`, `sa`
- Two-letter words: 8
- Three-letter words: 7

## Predictor Adapter

The backend exposes a predictor abstraction in `src/modules/dysgraphia/predictor.js`.

When the Python provider is enabled, the Node process starts the model server and
waits for its `/health` endpoint before opening the public API port. Startup fails
cleanly if the model process exits or does not become ready before the configured
timeout. The Python process is skipped when the mock provider is selected.

Interface:

- `predictSingleCharacter(imageBuffer)`
- `predictWord(imageBuffer, expectedLength)`

Behavior:

- `python` provider: normalizes the image and forwards it to `PREDICTOR_URL`
- `mock` provider: keeps the persistence and API flow wired for local development
- word prediction performs segmentation on the backend before per-character prediction

Standardized prediction shape returned to the rest of the app:

- `predicted`
- `confidence`
- `rawPrediction`

For words:

- `predictedLetters`
- `predictedWord`
- `confidences`
- `segmentation`

## API

### `GET /health`

Returns API and predictor readiness. When the Python provider is enabled, the
backend calls the predictor health endpoint and returns `503` until it is ready.
The predictor URL defaults to `PREDICTOR_URL` with `/predict` replaced by
`/health`.

Example response:

```json
{
  "status": "ok",
  "service": "dysgraphia-backend",
  "environment": "production",
  "checks": {
    "api": { "status": "ready" },
    "predictor": {
      "status": "ready",
      "provider": "python",
      "detail": "Python predictor is ready."
    }
  }
}
```

### `GET /api/dysgraphia/catalog`

Returns the canonical shapes, letters, words, and catalog counts for the authenticated user context.

### `GET /api/dysgraphia/overview`

Returns the server-computed dysgraphia dashboard data.

Example response shape:

```json
{
  "module": "dysgraphia",
  "catalogVersion": "2026-06-03",
  "catalogTotals": {
    "shapes": 9,
    "letters": { "total": 16, "level1": 5, "level2": 5, "level3": 6 },
    "words": { "total": 15, "twoLetters": 8, "threeLetters": 7 }
  },
  "progress": {
    "shapes": { "completed": 0, "total": 9, "stars": 0, "itemProgress": {} },
    "letters": { "level1": {}, "level2": {}, "level3": {} },
    "words": { "twoLetters": {}, "threeLetters": {} }
  },
  "stats": {
    "totalStars": 0,
    "totalMinutesSpent": 0,
    "sessionsCompleted": 0,
    "lastSessionDate": null,
    "totalItemsCompleted": 0
  },
  "achievements": [],
  "recentSessions": []
}
```

### `POST /api/dysgraphia/attempts/shape`

JSON body:

```json
{
  "shapeId": "circle",
  "coverage": 88,
  "strayRatio": 0.12,
  "starsEarned": 0,
  "durationSeconds": 18,
  "clientMetrics": {
    "brushSize": 6
  }
}
```

Backend scoring:

- `coverage > 85` => 3 stars
- `coverage > 60` => 2 stars
- `coverage > 50` => 1 star
- else 0

### `POST /api/dysgraphia/attempts/letter`

Multipart fields:

- `letterId`
- `targetChar`
- `mode`
- `durationSeconds`
- `image`

Success response shape:

```json
{
  "attemptId": "...",
  "predicted": "ට",
  "confidence": 0.94,
  "isCorrect": true,
  "starsEarned": 1,
  "itemProgress": {},
  "overviewSummary": {}
}
```

### `POST /api/dysgraphia/attempts/word`

Multipart fields:

- `group`
- `wordId`
- `targetWord`
- `expectedLength`
- `durationSeconds`
- `image`

If segmentation fails, the backend still logs the attempt and returns `422` with a structured error.

### `POST /api/dysgraphia/sessions`

JSON body:

```json
{
  "activityType": "letter",
  "startedAt": "2026-06-03T10:00:00.000Z",
  "endedAt": "2026-06-03T10:01:00.000Z",
  "durationMinutes": 1,
  "itemsCompleted": 1,
  "starsEarned": 1,
  "itemIds": ["ta"]
}
```

### `GET /api/dysgraphia/activity/recent?limit=5`

Returns recent session/activity records.

### `POST /api/dysgraphia/reset`

Resets the authenticated user’s dysgraphia data.

Allowed when:

- the user role is `admin`, or
- `ENABLE_DEV_RESET=true` in a non-production environment

`ENABLE_DEV_RESET` defaults to `false` and is always disabled when
`NODE_ENV=production`.

## Error Format

Validation, auth, and prediction errors use this envelope:

```json
{
  "error": {
    "code": "PREDICTION_FAILED",
    "message": "Unable to evaluate handwriting for this image."
  }
}
```

Possible status codes:

- `400` validation errors
- `401` missing or invalid auth
- `403` forbidden actions
- `404` unknown catalog items
- `422` prediction / segmentation failures
- `500` unexpected errors

## Testing

Run the backend test suite:

```bash
npm test
```

The current suite covers:

- auth middleware token validation
- overview building
- progress aggregation
- no double-award behavior
- shape scoring thresholds
- letter attempt persistence
- word attempt persistence
- reset authorization
- integration coverage for overview and attempt routes

## Verified Commands

Commands validated while implementing this backend:

- `npm install`
- `npm test`

## Notes

- This backend is Firestore-backed and does not create a separate login system.
- The frontend is expected to send Firebase ID tokens through the dysgraphia axios client.
- In local development, `PREDICTOR_PROVIDER=mock` keeps the API and persistence flow available while a real model service is unavailable.
