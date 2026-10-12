# Dyscalculia Backend

This portable folder contains the two backend services used by the Dyscalculia module:

- **Flask ML API** (`app.py`): number-tracing image preprocessing and TensorFlow digit recognition.
- **Node/Mongo progress API** (`src/`): activity catalog, assessment, sessions, attempts, progress, and dashboard data.

The models are included in `models/`, so the folder can be moved to its own repository without files from the frontend project. The services can be deployed independently; this is useful because TensorFlow hosting and MongoDB-backed API hosting often have different requirements.

## ML assets and retraining

`training/` contains the former frontend ML workspace, including the original
dataset, processed dataset, dataset download script, preprocessing script, and
training script. These assets are not needed to serve predictions. To retrain:

```bash
pip install -r training/requirements.txt
python training/split_dataset.py
python training/train_model.py
```

The training script now saves `digit_tracing_model.h5` directly to `models/`.
It also saves presentation-ready `training_accuracy.png`, `training_loss.png`,
and the underlying `training_history.json` to `training/reports/`.

## Requirements

- Python 3.10 or 3.11 is recommended (use a TensorFlow version compatible with your deployment platform).
- The dependencies in `requirements.txt`.

## Run both services locally

Create the Python environment once:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Then start the Node API and Flask model service together:

```bash
npm start
```

The Node API is the single public entry point at `http://localhost:4001`.
It proxies `/predict`, `/api/predict-number`, and
`/api/dyscalculia/tracing/predict` to the internally running ML service on
port `4002`. The frontend therefore only needs port `4001`. Press `Ctrl+C`
to stop both processes.

## Run the Flask digit-recognition API locally

### Windows (this repository layout)

TensorFlow contains deeply nested files. Keep its virtual environment at the
short workspace-root path below to avoid Windows path-length installation
errors:

```powershell
py -3.10 -m venv ..\..\.venv-dyscalculia
..\..\.venv-dyscalculia\Scripts\python.exe -m pip install -r requirements.txt
.\start-ml.ps1
```

Do not use `..venv\Scripts\python.exe`; that is not the same path as
`.venv\Scripts\python.exe`.

### macOS/Linux

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py
```

The API listens on `http://localhost:4002` by default. Python 3.10 or 3.11 is recommended for TensorFlow compatibility.

`FRONTEND_URL` accepts one or more comma-separated origins. For example:

```ini
FRONTEND_URL=http://localhost:5173,https://your-frontend.example.com
ML_PORT=4002
```

## API endpoints

- `GET /` — service metadata
- `GET /health` — health and model-load status
- `POST /api/dyscalculia/tracing/predict` — primary handwritten-digit prediction endpoint
- `POST /predict` — legacy prediction alias
- `POST /api/predict-number` — alias of `/predict` for compatibility

Send JSON to `/api/dyscalculia/tracing/predict` with either:

```json
{
  "image": "data:image/png;base64,...",
  "actualNumber": 5
}
```

or a square pixel array:

```json
{
  "pixels": [0, 0, 255],
  "actualNumber": 5
}
```

The API responds with `predictedNumber`, `isCorrect`, confidence, probabilities, and mirror-image information when an expected digit is supplied.

## Run the Node/Mongo progress API locally

```bash
npm install
cp .env.example .env
npm start
```

It listens on `http://localhost:4001` by default and requires `MONGODB_URI`. Its endpoint base is `/api/dyscalculia`, including:

- `GET /api/dyscalculia/overview`
- `POST /api/dyscalculia/sessions`
- `POST /api/dyscalculia/sessions/:sessionId/attempts`
- `POST /api/dyscalculia/sessions/:sessionId/complete`
- `GET /api/dyscalculia/progress/:userId`
- assessment and dashboard endpoints in `src/routes/dyscalculiaRoutes.js`

## Connect the Vite frontend

In `smart-learn-frontend/.env`, set the hosted ML API URL:

```ini
VITE_DYSCALCULIA_ML_URL=https://your-backend.onrender.com
```

For the separate Node/Mongo progress API, keep or set:

```ini
VITE_DYSCALCULIA_API_URL=https://your-progress-api.example.com/api/dyscalculia
```

For compatibility, the tracing client also accepts `VITE_DYSCALCULIA_API_URL` as a fallback. `VITE_DYSCALCULIA_ML_URL` is recommended because it avoids mixing the ML and progress API URLs.

Restart the Vite development server after changing environment variables.

## Deployment

Build command:

```bash
pip install -r requirements.txt
```

Flask start command (Render, Railway, Fly.io, or another WSGI-capable host):

```bash
gunicorn --bind 0.0.0.0:$PORT app:app
```

Set `FRONTEND_URL` to the deployed frontend origin. Ensure the repository includes `models/digit_tracing_model.h5`; do not add it to `.gitignore`.

Node progress API start command:

```bash
npm start
```

Set `MONGODB_URI` and `CLIENT_ORIGIN` when deploying the Node service.
