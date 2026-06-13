Deployment guide: Vercel (frontend) + Render (backend)

Frontend (Vercel)

1. In Vercel dashboard, create a new project and select the `frontend` folder in this repo.
2. Set build command: `npm run build` and output directory: `dist`.
3. Add Environment Variable `VITE_API_BASE` with your backend URL (e.g. `https://your-backend.onrender.com`).
4. Deploy. Vercel will serve the built `dist` folder and the SPA routing is configured in `frontend/vercel.json`.

Backend (Render)

1. Create a new Web Service on Render and connect your repo.
2. Set the root to the `backend` folder.
3. Select runtime: Python 3.11+.
4. Build command: `pip install -r requirements.txt` (Render will run this automatically).
5. Start command: `gunicorn --bind 0.0.0.0:$PORT app:app` (or use the provided `Procfile`).
6. Add any required environment variables (for example `GEMINI_API_KEY`, `GEMINI_MODEL`).

Notes

- The frontend reads the backend base URL from `VITE_API_BASE` (defaults to `http://localhost:5000` locally).
- The backend requires `backend/data/retail.csv` only for training; app will start without it but model-backed endpoints may be limited.
- CORS is enabled in the Flask app so cross-origin requests from Vercel should work.
