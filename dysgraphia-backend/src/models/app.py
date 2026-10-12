from fastapi import FastAPI, File, HTTPException, UploadFile
from ultralytics import YOLO
from pathlib import Path
import cv2
import numpy as np
import os
import threading
import time

app = FastAPI()


# ============================================
# PATHS
# ============================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "best.pt"

MODEL_IMAGE_SIZE = int(os.getenv("MODEL_IMAGE_SIZE", "416"))
MODEL_DEVICE = os.getenv("MODEL_DEVICE", "cpu")
MODEL_MAX_DETECTIONS = int(os.getenv("MODEL_MAX_DETECTIONS", "10"))


# ============================================
# SINHALA LABEL MAP
# ============================================

LABEL_MAP = {
    "sinhala_ak": "අ",
    "sinhala_ba": "බ",
    "sinhala_dha": "ද",
    "sinhala_ga": "ග",
    "sinhala_ha": "හ",
    "sinhala_i": "ඉ",
    "sinhala_ka": "ක",
    "sinhala_la": "ල",
    "sinhala_ma": "ම",
    "sinhala_na": "න",
    "sinhala_pa": "ප",
    "sinhala_ra": "ර",
    "sinhala_sa": "ස",
    "sinhala_ta": "ට",
    "sinhala_tha": "ත",
    "sinhala_u": "උ",
    "sinhala_ya": "ය",
}


# ============================================
# LOAD YOLO MODEL
# ============================================

print("Starting Sinhala handwriting model...")
print(f"Model path: {MODEL_PATH}")

model = YOLO(str(MODEL_PATH))
inference_lock = threading.Lock()

# Perform model setup and tensor allocation during startup instead of making
# the first student request pay the cold-inference cost.
warmup_image = np.full(
    (MODEL_IMAGE_SIZE, MODEL_IMAGE_SIZE, 3),
    255,
    dtype=np.uint8,
)
model.predict(
    warmup_image,
    imgsz=MODEL_IMAGE_SIZE,
    device=MODEL_DEVICE,
    max_det=MODEL_MAX_DETECTIONS,
    verbose=False,
)

print("Sinhala handwriting model loaded successfully.")
print("Model classes:", model.names)


# ============================================
# HEALTH CHECK
# ============================================

@app.get("/health")
async def health():

    return {
        "success": True,
        "message": "Sinhala handwriting model is running"
    }


# ============================================
# PREDICTION
# ============================================

@app.post("/predict")
def predict(file: UploadFile = File(...)):
    request_started = time.perf_counter()
    contents = file.file.read()
    encoded_image = np.frombuffer(contents, dtype=np.uint8)
    image = cv2.imdecode(encoded_image, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.")

    decode_finished = time.perf_counter()

    # The synchronous endpoint runs outside FastAPI's event loop, keeping the
    # health endpoint responsive while CPU inference is running. The lock keeps
    # the shared YOLO model safe from overlapping inference calls.
    with inference_lock:
        results = model.predict(
            image,
            imgsz=MODEL_IMAGE_SIZE,
            device=MODEL_DEVICE,
            max_det=MODEL_MAX_DETECTIONS,
            verbose=False,
        )

    inference_finished = time.perf_counter()

    candidates = []

    for result in results:

        if result.boxes is None:
            continue

        for box in result.boxes:

            class_id = int(box.cls[0])
            confidence = float(box.conf[0])

            class_name = model.names[class_id]

            sinhala_letter = LABEL_MAP.get(
                class_name,
                class_name
            )

            candidates.append({
                "label": class_name,
                "sinhala": sinhala_letter,
                "confidence": confidence
            })

    candidates.sort(
        key=lambda x: x["confidence"],
        reverse=True
    )

    timing = {
        "decodeMs": round((decode_finished - request_started) * 1000, 2),
        "inferenceMs": round((inference_finished - decode_finished) * 1000, 2),
        "totalMs": round((time.perf_counter() - request_started) * 1000, 2),
        "imageSize": MODEL_IMAGE_SIZE,
        "device": MODEL_DEVICE,
    }

    if not candidates:
        return {
            "success": False,
            "label": "",
            "sinhala": "",
            "confidence": 0,
            "candidates": [],
            "timing": timing,
        }

    best = candidates[0]

    return {
        "success": True,

        # Original YOLO class
        "label": best["label"],

        # Sinhala character
        "sinhala": best["sinhala"],

        # Confidence
        "confidence": best["confidence"],

        # All candidates
        "candidates": candidates,
        "timing": timing,
    }
