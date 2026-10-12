import base64
import io
from pathlib import Path
from typing import Optional

import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image, ImageOps
from tensorflow.keras.models import load_model


MODEL_PATH = (
    Path(__file__).resolve().parent
    / "saved_model"
    / "digit_tracing_model.h5"
)

app = Flask(__name__)

CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=False,
)

model = None


def load_digit_model() -> None:
    """Load the trained digit recognition model."""
    global model

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model file not found at: {MODEL_PATH}"
        )

    # compile=False avoids unnecessary metric warnings for prediction-only use.
    model = load_model(str(MODEL_PATH), compile=False)
    print(f"Loaded model from {MODEL_PATH}")


def decode_base64_image(data: str) -> bytes:
    """Decode a Base64 image or data URL into raw image bytes."""
    if not isinstance(data, str) or not data.strip():
        raise ValueError("Image must be a non-empty Base64 string.")

    if data.startswith("data:"):
        if "," not in data:
            raise ValueError("Invalid image data URL.")
        data = data.split(",", 1)[1]

    try:
        return base64.b64decode(data, validate=True)
    except Exception as exc:
        raise ValueError("Invalid Base64 image data.") from exc


def center_digit_image(image: Image.Image) -> Image.Image:
    """
    Crop the drawn digit, preserve its aspect ratio, resize it into a
    20x20 area, and center it inside a 28x28 black canvas.
    """
    bbox = image.getbbox()

    if not bbox:
        raise ValueError("No drawn digit was detected.")

    cropped = image.crop(bbox)
    cropped.thumbnail((20, 20), Image.Resampling.LANCZOS)

    centered = Image.new("L", (28, 28), 0)

    offset_x = (28 - cropped.width) // 2
    offset_y = (28 - cropped.height) // 2

    centered.paste(cropped, (offset_x, offset_y))
    return centered


def preprocess_image(
    image_bytes: bytes,
) -> tuple[np.ndarray, Image.Image]:
    """
    Convert an uploaded image into the 28x28 grayscale format expected
    by the digit recognition model.

    The frontend normally produces a light canvas with a dark drawing,
    so the image is inverted to match MNIST-style white digits on a
    black background.
    """
    try:
        source = Image.open(io.BytesIO(image_bytes)).convert("L")
    except Exception as exc:
        raise ValueError("The uploaded content is not a valid image.") from exc

    inverted = ImageOps.invert(source)
    processed = center_digit_image(inverted)

    array = np.asarray(processed, dtype=np.float32) / 255.0
    array = array.reshape(1, 28, 28, 1)

    return array, processed


def pixels_to_28x28(
    pixels: list,
) -> tuple[np.ndarray, Image.Image]:
    """
    Convert a frontend pixel array into a centered 28x28 grayscale image.

    Supports:
    - Flat 20x20 array: 400 values
    - Flat 28x28 array: 784 values
    - Valid square nested arrays
    """
    if not isinstance(pixels, list) or len(pixels) == 0:
        raise ValueError('"pixels" must be a non-empty array.')

    try:
        array = np.asarray(pixels, dtype=np.float32)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            '"pixels" must contain numeric values only.'
        ) from exc

    if array.ndim == 1:
        side = int(round(array.size ** 0.5))

        if side * side != array.size:
            raise ValueError(
                "Flat pixel array length must form a square image."
            )

        array = array.reshape(side, side)

    elif array.ndim != 2:
        raise ValueError(
            '"pixels" must be a flat or two-dimensional grayscale array.'
        )

    if array.shape[0] != array.shape[1]:
        raise ValueError("Pixel array must represent a square image.")

    if not np.isfinite(array).all():
        raise ValueError("Pixel array contains invalid numeric values.")

    if float(array.max()) > 1.0:
        array = array / 255.0

    array = np.clip(array, 0.0, 1.0)

    source = Image.fromarray(
        (array * 255).astype(np.uint8),
        mode="L",
    )

    # If the digit is already white on a black background, keep it.
    # If it appears to be dark on a mostly white background, invert it.
    if np.asarray(source).mean() > 127:
        source = ImageOps.invert(source)

    try:
        processed = center_digit_image(source)
    except ValueError:
        # Fall back to direct resize when the supplied array has no
        # detectable non-zero bounding box.
        processed = source.resize(
            (28, 28),
            Image.Resampling.LANCZOS,
        )

    output = np.asarray(processed, dtype=np.float32) / 255.0
    output = output.reshape(1, 28, 28, 1)

    return output, processed


def resolve_expected_digit(payload: dict) -> Optional[int]:
    """Read the expected digit from either supported frontend field."""
    if "actualNumber" in payload:
        raw_value = payload.get("actualNumber")
    else:
        raw_value = payload.get("expected_digit")

    if raw_value is None or raw_value == "":
        return None

    try:
        value = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Expected digit must be an integer from 0 to 9."
        ) from exc

    if value < 0 or value > 9:
        raise ValueError(
            "Expected digit must be between 0 and 9."
        )

    return value


def predict_array(image_array: np.ndarray) -> tuple[int, float, list]:
    """Run the model and return digit, confidence, and probabilities."""
    if model is None:
        raise RuntimeError("Prediction model has not been loaded.")

    predictions = model.predict(image_array, verbose=0)

    probabilities = predictions[0]
    predicted_digit = int(np.argmax(probabilities))
    confidence = float(np.max(probabilities))

    return (
        predicted_digit,
        confidence,
        [round(float(value), 6) for value in probabilities],
    )


@app.route("/", methods=["GET"])
def index():
    return jsonify(
        {
            "service": "Dyscalculia Digit Recognition API",
            "status": "running",
            "predictEndpoint": "/predict",
        }
    )


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "modelLoaded": model is not None,
        }
    )


@app.route("/predict", methods=["POST"])
@app.route("/api/predict-number", methods=["POST"])
def predict():
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify(
            {
                "success": False,
                "error": "Request body must contain valid JSON.",
            }
        ), 400

    try:
        expected_digit = resolve_expected_digit(payload)
    except ValueError as exc:
        return jsonify(
            {
                "success": False,
                "error": str(exc),
            }
        ), 400

    try:
        if "pixels" in payload:
            image_array, processed_pil = pixels_to_28x28(
                payload["pixels"]
            )

        elif "image" in payload:
            image_bytes = decode_base64_image(payload["image"])
            image_array, processed_pil = preprocess_image(
                image_bytes
            )

        else:
            return jsonify(
                {
                    "success": False,
                    "error": (
                        'Request must include "pixels" as an array '
                        'or "image" as a Base64 string.'
                    ),
                }
            ), 400

    except ValueError as exc:
        return jsonify(
            {
                "success": False,
                "error": str(exc),
            }
        ), 400

    except Exception as exc:
        app.logger.exception("Image preprocessing failed.")

        return jsonify(
            {
                "success": False,
                "error": f"Image preprocessing failed: {exc}",
            }
        ), 500

    try:
        predicted_digit, confidence, probabilities = predict_array(
            image_array
        )
    except Exception as exc:
        app.logger.exception("Model prediction failed.")

        return jsonify(
            {
                "success": False,
                "error": f"Prediction failed: {exc}",
            }
        ), 500

    is_reversed = False
    mirrored_prediction = None
    mirrored_confidence = None

    if (
        expected_digit is not None
        and predicted_digit != expected_digit
    ):
        try:
            mirrored_image = ImageOps.mirror(processed_pil)

            mirrored_array = (
                np.asarray(
                    mirrored_image,
                    dtype=np.float32,
                )
                / 255.0
            )

            mirrored_array = mirrored_array.reshape(
                1,
                28,
                28,
                1,
            )

            (
                mirrored_prediction,
                mirrored_confidence,
                _,
            ) = predict_array(mirrored_array)

            is_reversed = mirrored_prediction == expected_digit

        except Exception:
            app.logger.exception(
                "Mirror-image detection failed."
            )

    if expected_digit is None:
        is_match = None
        message = "Prediction generated."

    elif is_reversed:
        is_match = False
        message = (
            f"Digit {expected_digit} may have been drawn "
            "as a mirror image."
        )

    elif predicted_digit == expected_digit:
        is_match = True
        message = "Correct."

    else:
        is_match = False
        message = (
            f"Incorrect. Predicted {predicted_digit}; "
            f"expected {expected_digit}."
        )

    response = {
        # Frontend-compatible fields
        "success": True,
        "isCorrect": is_match,
        "predictedNumber": predicted_digit,

        # Extended fields
        "predicted_digit": predicted_digit,
        "confidence": round(confidence, 4),
        "probabilities": probabilities,
        "expected_digit": expected_digit,
        "is_match": is_match,
        "is_reversed": is_reversed,
        "message": message,
    }

    if mirrored_prediction is not None:
        response["mirrored_prediction"] = mirrored_prediction
        response["mirrored_confidence"] = round(
            float(mirrored_confidence),
            4,
        )

    return jsonify(response), 200


if __name__ == "__main__":
    load_digit_model()

    app.run(
        host="0.0.0.0",
        port=5001,
        debug=True,
    )