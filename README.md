# Market Basket Analysis

> Local dev + deployment instructions for the Market Basket Analysis app (frontend + Flask backend).

## Quick start (local)

Requirements: Python 3.11+, Node.js 18+, npm, Git

Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
python app.py
```

Frontend

```powershell
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000 (health: `/api/health`)

## Deploy

See `DEPLOY.md` for step-by-step instructions for deploying the frontend to Vercel and the backend to Render.

## Notes & troubleshooting

- The backend will start even if `backend/data/retail.csv` is missing, but some model-backed endpoints are limited until you either place that file or run `python train.py`.
- The frontend reads backend base URL from the environment variable `VITE_API_BASE`. Locally it defaults to `http://localhost:5000`.
- `frontend/vercel.json` and `backend/Procfile` are included to simplify deployment.

## Repository layout

- `backend/` — Flask API, model training, `requirements.txt`
- `frontend/` — React + Vite dashboard
- `documentation/` — project docs and run guide
- `DEPLOY.md` — simple deployment instructions for Vercel + Render

## Next steps

- Commit and push to your GitHub repo (example commands in `documentation/06_run_guide.md`).
