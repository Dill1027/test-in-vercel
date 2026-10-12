"""Lightweight ONNX Runtime FastAPI inference for Sinhala handwriting YOLO detection."""
import json
import os
import threading
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI()
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / 'best.onnx'
CLASSES_PATH = BASE_DIR / 'class_names.json'
MODEL_IMAGE_SIZE = int(os.getenv('MODEL_IMAGE_SIZE', '416'))
MODEL_MAX_DETECTIONS = int(os.getenv('MODEL_MAX_DETECTIONS', '10'))
MODEL_CONF = float(os.getenv('MODEL_CONF', '0.25'))
MODEL_IOU = float(os.getenv('MODEL_IOU', '0.7'))

LABEL_MAP = {
    'sinhala_ak': 'අ', 'sinhala_ba': 'බ', 'sinhala_dha': 'ද',
    'sinhala_ga': 'ග', 'sinhala_ha': 'හ', 'sinhala_i': 'ඉ',
    'sinhala_ka': 'ක', 'sinhala_la': 'ල', 'sinhala_ma': 'ම',
    'sinhala_na': 'න', 'sinhala_pa': 'ප', 'sinhala_ra': 'ර',
    'sinhala_sa': 'ස', 'sinhala_ta': 'ට', 'sinhala_tha': 'ත',
    'sinhala_u': 'උ', 'sinhala_ya': 'ය',
}

if not MODEL_PATH.is_file():
    raise FileNotFoundError(f'Missing ONNX model: {MODEL_PATH}')
if not CLASSES_PATH.is_file():
    raise FileNotFoundError(f'Missing class names: {CLASSES_PATH}')
with CLASSES_PATH.open(encoding='utf-8') as file:
    class_names = json.load(file)
if isinstance(class_names, dict):
    class_names = [v for k, v in sorted(class_names.items(), key=lambda item: int(item[0]))]
if not isinstance(class_names, list) or not class_names:
    raise ValueError('class_names.json must contain an ordered list of classes')

session = ort.InferenceSession(str(MODEL_PATH), providers=['CPUExecutionProvider'])
input_info = session.get_inputs()[0]
input_name = input_info.name
output_name = session.get_outputs()[0].name
input_shape = input_info.shape
if isinstance(input_shape[-1], int) and input_shape[-1] > 0:
    MODEL_IMAGE_SIZE = input_shape[-1]
inference_lock = threading.Lock()


def prepare_image(image: np.ndarray) -> np.ndarray:
    """Ultralytics-style letterbox: preserve aspect ratio and pad with 114."""
    h, w = image.shape[:2]
    ratio = min(MODEL_IMAGE_SIZE / h, MODEL_IMAGE_SIZE / w)
    new_w, new_h = round(w * ratio), round(h * ratio)
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    dw, dh = MODEL_IMAGE_SIZE - new_w, MODEL_IMAGE_SIZE - new_h
    left, top = round(dw / 2 - 0.1), round(dh / 2 - 0.1)
    right, bottom = dw - left, dh - top
    padded = cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(114, 114, 114))
    rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)
    return np.ascontiguousarray(rgb.transpose(2, 0, 1)[None], dtype=np.float32) / 255.0


def extract_candidates(output: np.ndarray) -> list[dict]:
    """Postprocess raw Ultralytics YOLOv8/YOLO11 detection output, without built-in NMS."""
    pred = np.asarray(output)
    if pred.ndim != 3 or pred.shape[0] != 1:
        raise ValueError(f'Unsupported ONNX output shape {pred.shape}. Export with nms=False.')
    pred = pred[0]
    expected_channels = 4 + len(class_names)
    if pred.shape[0] == expected_channels:
        pred = pred.T
    elif pred.shape[1] != expected_channels:
        raise ValueError(f'Expected {expected_channels} output channels; received {pred.shape}. Check model type/classes.')

    scores = pred[:, 4:]
    classes = scores.argmax(axis=1)
    confs = scores[np.arange(len(classes)), classes]
    mask = confs >= MODEL_CONF
    boxes_xywh = pred[mask, :4]
    classes = classes[mask]
    confs = confs[mask]
    if not len(confs):
        return []

    # NMS per class matches the default class-aware Ultralytics behavior.
    retained = []
    for class_id in np.unique(classes):
        indices = np.flatnonzero(classes == class_id)
        coords = boxes_xywh[indices]
        xywh = np.column_stack((coords[:, :2] - coords[:, 2:] / 2, coords[:, 2:]))
        keep = cv2.dnn.NMSBoxes(xywh.tolist(), confs[indices].tolist(), MODEL_CONF, MODEL_IOU)
        for i in np.asarray(keep).reshape(-1).tolist():
            retained.append(int(indices[int(i)]))
    retained.sort(key=lambda idx: float(confs[idx]), reverse=True)
    retained = retained[:MODEL_MAX_DETECTIONS]
    return [
        {
            'label': str(class_names[int(classes[i])]),
            'sinhala': LABEL_MAP.get(str(class_names[int(classes[i])]), str(class_names[int(classes[i])])),
            'confidence': float(confs[i]),
        }
        for i in retained
    ]


@app.get('/health')
async def health():
    return {'success': True, 'message': 'Sinhala handwriting model is running'}


@app.post('/predict')
def predict(file: UploadFile = File(...)):
    started = time.perf_counter()
    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail='Uploaded file is empty.')
    image = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail='Uploaded file is not a valid image.')
    decoded_at = time.perf_counter()
    input_tensor = prepare_image(image)
    with inference_lock:
        raw_predictions = session.run([output_name], {input_name: input_tensor})[0]
    candidates = extract_candidates(raw_predictions)
    inferred_at = time.perf_counter()

    timing = {
        'decodeMs': round((decoded_at - started) * 1000, 2),
        'inferenceMs': round((inferred_at - decoded_at) * 1000, 2),
        'totalMs': round((time.perf_counter() - started) * 1000, 2),
        'imageSize': MODEL_IMAGE_SIZE,
        'device': 'cpu',
    }
    if not candidates:
        return {'success': False, 'label': '', 'sinhala': '', 'confidence': 0, 'candidates': [], 'timing': timing}
    return {'success': True, 'label': candidates[0]['label'], 'sinhala': candidates[0]['sinhala'], 'confidence': candidates[0]['confidence'], 'candidates': candidates, 'timing': timing}
