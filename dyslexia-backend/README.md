# Dyslexia Backend

Express and MongoDB backend for the dyslexia module.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file from `.env.example` and set `MONGODB_URI`.

3. Start the server:
   ```bash
   npm run dev
   ```

## Endpoints

- `GET /health`
- `GET /api/dyslexia/overview`
- `GET /api/dyslexia/catalog`
- `POST /api/dyslexia/sessions`
- `GET /api/dyslexia/sessions`
- `GET /api/dyslexia/sessions/:sessionId`
- `POST /api/dyslexia/sessions/:sessionId/attempts`
- `POST /api/dyslexia/sessions/:sessionId/complete`
- `GET /api/dyslexia/progress/:userId`
