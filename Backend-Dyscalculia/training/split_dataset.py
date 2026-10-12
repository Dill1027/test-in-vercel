"""
split_dataset.py — Dyscalculia digit dataset preprocessor
==========================================================
Reads full-page handwritten digit images from:
    ml/dataset/{0..9}/

Extracts individual digit samples via contour detection or grid-based fallback
and writes 28x28 grayscale PNGs to:
    ml/dataset_processed/{0..9}/

Also generates contact-sheet previews at:
    ml/dataset_processed/previews/class_{digit}_preview.png

Usage:
    python ml/split_dataset.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).resolve().parent          # ml/
DATASET_DIR  = SCRIPT_DIR / 'dataset'                   # ml/dataset/
OUTPUT_DIR   = SCRIPT_DIR / 'dataset_processed'         # ml/dataset_processed/
PREVIEW_DIR  = OUTPUT_DIR / 'previews'                  # ml/dataset_processed/previews/

# ── Tuning knobs ──────────────────────────────────────────────────────────────
# Minimum pixel area for a contour to be considered a digit (not noise)
MIN_CONTOUR_AREA   = 150
# Padding (in pixels) added around each cropped bounding-box before resize
DIGIT_PADDING      = 4
# Final output size (pixels × pixels) — MNIST convention
OUTPUT_SIZE        = 28
# Grid fallback: aspect ratio of a single cell (width / height) that triggers it
# If the image is much wider than tall, we guess it's a row of digits.
GRID_ASPECT_THRESH = 1.8
# Preview contact sheet: max thumbnails per row
PREVIEW_COLS       = 10
PREVIEW_THUMB_PX   = 64      # thumbnail size in the contact sheet

# ── Supported extensions ──────────────────────────────────────────────────────
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png'}


# ═══════════════════════════════════════════════════════════════════════════════
# Helper utilities
# ═══════════════════════════════════════════════════════════════════════════════

def _is_dark_background(gray: np.ndarray) -> bool:
    """Return True if the image has a predominantly dark background."""
    return float(np.median(gray)) < 128.0


def _threshold_image(gray: np.ndarray) -> np.ndarray:
    """
    Return a binary mask where digit pixels are WHITE (255) and background is BLACK (0).
    Handles both white-on-dark and dark-on-white images automatically.
    """
    if _is_dark_background(gray):
        # Dark background → digits are lighter → threshold normally
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    else:
        # White background → digits are darker → invert after Otsu
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    return binary


def _remove_noise(binary: np.ndarray) -> np.ndarray:
    """Remove small specks with morphological opening."""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    return cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)


def _center_digit_28x28(digit_crop: np.ndarray) -> np.ndarray:
    """
    Given a grayscale/binary crop of a digit (any size, digit is white on black),
    return a 28x28 float32 array (values 0.0–1.0) with the digit centered and
    aspect-ratio-preserved inside a 20x20 region, matching MNIST style.
    """
    h, w = digit_crop.shape
    if h == 0 or w == 0:
        return np.zeros((OUTPUT_SIZE, OUTPUT_SIZE), dtype=np.float32)

    # Scale to fit inside (OUTPUT_SIZE - 2*DIGIT_PADDING)
    inner = OUTPUT_SIZE - 2 * DIGIT_PADDING   # 20
    scale = inner / max(h, w)
    new_h = max(1, int(round(h * scale)))
    new_w = max(1, int(round(w * scale)))
    resized = cv2.resize(digit_crop, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # Paste into a black OUTPUT_SIZE×OUTPUT_SIZE canvas
    canvas = np.zeros((OUTPUT_SIZE, OUTPUT_SIZE), dtype=np.uint8)
    top  = (OUTPUT_SIZE - new_h) // 2
    left = (OUTPUT_SIZE - new_w) // 2
    canvas[top:top + new_h, left:left + new_w] = resized

    return canvas.astype(np.float32) / 255.0


# ═══════════════════════════════════════════════════════════════════════════════
# Contour-based extraction
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_via_contours(
    binary: np.ndarray,
    gray: np.ndarray,
) -> tuple[list[np.ndarray], int]:
    """
    Find external contours and crop each valid digit region.
    Returns (list_of_28x28_arrays, rejected_count).
    """
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    digits: list[np.ndarray] = []
    rejected = 0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < MIN_CONTOUR_AREA:
            rejected += 1
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        # Add padding, clamped to image boundaries
        img_h, img_w = gray.shape
        x1 = max(0, x - DIGIT_PADDING)
        y1 = max(0, y - DIGIT_PADDING)
        x2 = min(img_w, x + w + DIGIT_PADDING)
        y2 = min(img_h, y + h + DIGIT_PADDING)

        crop = binary[y1:y2, x1:x2]
        if crop.size == 0:
            rejected += 1
            continue

        centered = _center_digit_28x28(crop)
        digits.append(centered)

    return digits, rejected


# ═══════════════════════════════════════════════════════════════════════════════
# Grid-based fallback extraction
# ═══════════════════════════════════════════════════════════════════════════════

def _estimate_grid(binary: np.ndarray) -> tuple[int, int] | None:
    """
    Estimate (rows, cols) by inspecting horizontal and vertical projection profiles.
    Returns None if the image appears to contain a single digit.
    """
    h, w = binary.shape

    # Horizontal projection: number of non-zero columns per row
    h_proj = np.sum(binary > 0, axis=1).astype(np.float64)
    # Vertical projection: number of non-zero rows per column
    v_proj = np.sum(binary > 0, axis=0).astype(np.float64)

    # Smooth projections
    smooth_h = np.convolve(h_proj, np.ones(5) / 5, mode='same')
    smooth_v = np.convolve(v_proj, np.ones(5) / 5, mode='same')

    def count_peaks(proj: np.ndarray, threshold_factor: float = 0.15) -> int:
        threshold = proj.max() * threshold_factor
        in_peak = False
        peaks = 0
        for val in proj:
            if val > threshold and not in_peak:
                in_peak = True
                peaks += 1
            elif val <= threshold:
                in_peak = False
        return max(peaks, 1)

    rows = count_peaks(smooth_h)
    cols = count_peaks(smooth_v)

    if rows == 1 and cols == 1:
        return None
    return rows, cols


def _extract_via_grid(
    binary: np.ndarray,
    gray: np.ndarray,
) -> tuple[list[np.ndarray], int]:
    """
    Split the image into a rows×cols grid and treat each cell as one digit.
    Returns (list_of_28x28_arrays, rejected_count).
    """
    grid = _estimate_grid(binary)
    if grid is None:
        # Single digit — treat the whole image as one sample
        centered = _center_digit_28x28(binary)
        return [centered], 0

    rows, cols = grid
    h, w = binary.shape
    cell_h = h // rows
    cell_w = w // cols

    digits: list[np.ndarray] = []
    rejected = 0

    for r in range(rows):
        for c in range(cols):
            y1 = r * cell_h
            y2 = (r + 1) * cell_h if r < rows - 1 else h
            x1 = c * cell_w
            x2 = (c + 1) * cell_w if c < cols - 1 else w
            cell = binary[y1:y2, x1:x2]

            if cell.size == 0 or np.sum(cell > 0) < MIN_CONTOUR_AREA:
                rejected += 1
                continue

            centered = _center_digit_28x28(cell)
            digits.append(centered)

    return digits, rejected


# ═══════════════════════════════════════════════════════════════════════════════
# Process a single source image
# ═══════════════════════════════════════════════════════════════════════════════

def _process_image(img_path: Path) -> tuple[list[np.ndarray], int]:
    """
    Load an image, segment digit(s) from it, and return
    (list_of_28x28_float32_arrays, rejected_count).
    """
    # cv2.imread handles non-ASCII paths poorly; use numpy frombuffer approach
    raw = np.fromfile(str(img_path), dtype=np.uint8)
    bgr = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if bgr is None:
        print(f'  ⚠  Could not decode image: {img_path.name}')
        return [], 0

    gray   = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    binary = _threshold_image(gray)
    binary = _remove_noise(binary)

    img_h, img_w = binary.shape
    aspect = img_w / max(img_h, 1)

    # Choose strategy:
    # 1. Try contour segmentation first.
    # 2. If it yields 0 digits, or image looks like a grid, fall back to grid.
    contour_digits, contour_rejected = _extract_via_contours(binary, gray)

    if len(contour_digits) == 0 or aspect >= GRID_ASPECT_THRESH:
        grid_digits, grid_rejected = _extract_via_grid(binary, gray)
        if len(grid_digits) >= len(contour_digits):
            return grid_digits, grid_rejected

    return contour_digits, contour_rejected


# ═══════════════════════════════════════════════════════════════════════════════
# Preview / contact-sheet generation
# ═══════════════════════════════════════════════════════════════════════════════

def _save_preview(digit_label: int, sample_paths: list[Path]) -> None:
    """Save a contact-sheet PNG for the given class."""
    if not sample_paths:
        return

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    n = len(sample_paths)
    cols = min(n, PREVIEW_COLS)
    rows = (n + cols - 1) // cols

    sheet_w = cols * PREVIEW_THUMB_PX
    sheet_h = rows * PREVIEW_THUMB_PX
    sheet = Image.new('L', (sheet_w, sheet_h), color=200)

    for idx, p in enumerate(sample_paths):
        img = Image.open(p).convert('L').resize(
            (PREVIEW_THUMB_PX, PREVIEW_THUMB_PX), Image.NEAREST
        )
        col = idx % cols
        row = idx // cols
        sheet.paste(img, (col * PREVIEW_THUMB_PX, row * PREVIEW_THUMB_PX))

    out_path = PREVIEW_DIR / f'class_{digit_label}_preview.png'
    sheet.save(str(out_path))
    print(f'  📋 Preview saved → {out_path.relative_to(SCRIPT_DIR)}')


# ═══════════════════════════════════════════════════════════════════════════════
# Main pipeline
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    print('=' * 65)
    print('  Dyscalculia Dataset Preprocessor')
    print('=' * 65)
    print(f'  Source  : {DATASET_DIR}')
    print(f'  Output  : {OUTPUT_DIR}')
    print()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    total_source  = 0
    total_samples = 0
    total_rejected = 0

    for digit in range(10):
        class_src_dir = DATASET_DIR / str(digit)
        class_out_dir = OUTPUT_DIR / str(digit)

        if not class_src_dir.exists():
            print(f'[Class {digit}]  ⚠  Source folder missing: {class_src_dir}')
            continue

        # Collect all supported image files (handles spaces & parentheses via pathlib)
        src_files = sorted(
            p for p in class_src_dir.rglob('*')
            if p.suffix.lower() in IMAGE_EXTENSIONS
        )

        print(f'[Class {digit}]  Found {len(src_files)} source image(s)')
        total_source += len(src_files)

        class_out_dir.mkdir(parents=True, exist_ok=True)

        sample_idx  = 0
        class_rejected = 0
        saved_paths: list[Path] = []

        for img_path in src_files:
            digits_arr, rejected = _process_image(img_path)
            class_rejected += rejected

            for arr in digits_arr:
                sample_idx += 1
                out_name = f'digit_{digit}_{sample_idx:04d}.png'
                out_path = class_out_dir / out_name

                # Convert float32 [0,1] → uint8 [0,255] for PNG
                pil_img = Image.fromarray((arr * 255).astype(np.uint8), mode='L')
                pil_img.save(str(out_path))
                saved_paths.append(out_path)

        print(f'         Extracted {sample_idx} sample(s), '
              f'rejected {class_rejected} contour(s)')

        total_samples  += sample_idx
        total_rejected += class_rejected

        _save_preview(digit, saved_paths)

    print()
    print('=' * 65)
    print(f'  Total source images : {total_source}')
    print(f'  Total samples saved : {total_samples}')
    print(f'  Total rejected      : {total_rejected}')
    print('=' * 65)

    if total_samples == 0:
        print('\n❌  No samples were extracted. '
              'Check that the dataset folder exists and contains readable images.')
        sys.exit(1)

    print('\n✅  Preprocessing complete.')
    print(f'   Processed data → {OUTPUT_DIR}')


if __name__ == '__main__':
    main()
