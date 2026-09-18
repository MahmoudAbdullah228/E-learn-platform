# Backend

Minimal Node.js and Express starter for the E-Learning Platform.

## Run locally

Requires Node.js 22 or newer.

```powershell
cd O:\E-learning-platform\backend
npm install
Copy-Item .env.example .env
npm run dev
```

The health endpoint is `GET http://localhost:5000/api/v1/health`.

This starter has no database connection or product features yet.
