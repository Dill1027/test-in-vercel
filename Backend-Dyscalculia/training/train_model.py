import argparse
import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
import tensorflow as tf
from tensorflow.keras import layers, models
import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt


BACKEND_DIR = Path(__file__).resolve().parent.parent
TRAINING_DIR = Path(__file__).resolve().parent


def save_training_reports(history, output_dir: Path) -> None:
    """Save reusable training metrics and presentation-ready diagrams."""
    output_dir.mkdir(parents=True, exist_ok=True)

    metrics = {
        key: [float(value) for value in values]
        for key, values in history.history.items()
    }

    with open(output_dir / 'training_history.json', 'w', encoding='utf-8') as fh:
        json.dump(metrics, fh, indent=2)

    epochs = range(1, len(metrics['accuracy']) + 1)

    plt.figure(figsize=(10, 6))
    plt.plot(epochs, metrics['accuracy'], marker='o', linewidth=2,
             label='Training Accuracy')
    if 'val_accuracy' in metrics:
        plt.plot(epochs, metrics['val_accuracy'], marker='o', linewidth=2,
                 label='Validation Accuracy')
    plt.title('Dyscalculia Digit Recognition Model Accuracy')
    plt.xlabel('Epoch')
    plt.ylabel('Accuracy')
    plt.ylim(0, 1.02)
    plt.xticks(list(epochs))
    plt.grid(True, linestyle='--', alpha=0.35)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / 'training_accuracy.png', dpi=300)
    plt.close()

    plt.figure(figsize=(10, 6))
    plt.plot(epochs, metrics['loss'], marker='o', linewidth=2,
             label='Training Loss')
    if 'val_loss' in metrics:
        plt.plot(epochs, metrics['val_loss'], marker='o', linewidth=2,
                 label='Validation Loss')
    plt.title('Dyscalculia Digit Recognition Model Loss')
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.xticks(list(epochs))
    plt.grid(True, linestyle='--', alpha=0.35)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / 'training_loss.png', dpi=300)
    plt.close()

    print(f'\n✅  Training reports saved to {output_dir}')


def decode_base64_image(data: str) -> bytes:
    if data.startswith('data:'):
        data = data.split(',', 1)[1]
    return base64.b64decode(data)


def preprocess_image_bytes(image_bytes: bytes, target_size=(28, 28)) -> np.ndarray:
    image = Image.open(io.BytesIO(image_bytes)).convert('L')
    image = ImageOps.invert(image)
    image = image.resize(target_size, Image.LANCZOS)
    array = np.array(image, dtype=np.float32) / 255.0
    array = array.reshape(target_size[0], target_size[1], 1)
    return array


def load_local_drawing_images(export_path: Path):
    if not export_path.exists():
        print(f'LocalStorage export file not found: {export_path}')
        return [], []

    with open(export_path, 'r', encoding='utf-8') as fh:
        data = json.load(fh)

    images = []
    labels = []
    for key, value in data.items():
        if key.startswith('tracing_last_drawing_'):
            label_part = key.replace('tracing_last_drawing_', '')
            if label_part.isdigit():
                label = int(label_part)
                try:
                    image_bytes = decode_base64_image(value)
                    image_array = preprocess_image_bytes(image_bytes)
                    images.append(image_array)
                    labels.append(label)
                except Exception as exc:
                    print(f'Failed to load {key}: {exc}')

    return images, labels


def build_model(input_shape=(28, 28, 1), num_classes=10):
    model = models.Sequential([
        layers.RandomRotation(0.08, input_shape=input_shape),
        layers.RandomTranslation(0.08, 0.08),
        layers.RandomZoom((-0.08, 0.08)),
        layers.Conv2D(32, (3, 3), activation='relu'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2, 2)),
        layers.Conv2D(64, (3, 3), activation='relu'),
        layers.BatchNormalization(),
        layers.MaxPooling2D((2, 2)),
        layers.Conv2D(128, (3, 3), activation='relu'),
        layers.BatchNormalization(),
        layers.Flatten(),
        layers.Dropout(0.4),
        layers.Dense(128, activation='relu'),
        layers.BatchNormalization(),
        layers.Dense(num_classes, activation='softmax'),
    ])

    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy'],
    )
    return model


def load_mnist_data():
    (x_train, y_train), (x_test, y_test) = tf.keras.datasets.mnist.load_data()
    x_train = x_train.astype('float32') / 255.0
    x_test  = x_test.astype('float32')  / 255.0
    x_train = np.expand_dims(x_train, axis=-1)
    x_test  = np.expand_dims(x_test,  axis=-1)
    return x_train, y_train, x_test, y_test


# ── Custom dataset loader ─────────────────────────────────────────────────────

MIN_SAMPLES_PER_CLASS = 20


def load_custom_dataset(dataset_dir: Path) -> tuple[np.ndarray, np.ndarray]:
    """
    Load 28x28 grayscale PNGs from dataset_dir/{0..9}/.
    Validates:
      - all class folders 0–9 exist
      - every folder is non-empty
      - every class has at least MIN_SAMPLES_PER_CLASS images

    Returns (images, labels) as numpy arrays, or raises SystemExit on failure.
    """
    print(f'\n── Loading custom dataset from: {dataset_dir} ──')

    all_images: list[np.ndarray] = []
    all_labels: list[int] = []
    fatal = False

    for digit in range(10):
        class_dir = dataset_dir / str(digit)

        if not class_dir.exists():
            print(f'  ❌  Class {digit}: folder missing → {class_dir}')
            fatal = True
            continue

        png_files = sorted(class_dir.glob('*.png'))
        count = len(png_files)

        if count == 0:
            print(f'  ❌  Class {digit}: folder is empty')
            fatal = True
            continue

        if count < MIN_SAMPLES_PER_CLASS:
            print(
                f'  ⚠️   Class {digit}: only {count} sample(s) found '
                f'(minimum required: {MIN_SAMPLES_PER_CLASS}). '
                f'Run python training/split_dataset.py to extract more samples.'
            )
            fatal = True
            continue

        for png in png_files:
            img = Image.open(png).convert('L')
            arr = np.array(img, dtype=np.float32) / 255.0
            all_images.append(arr.reshape(28, 28, 1))
            all_labels.append(digit)

        print(f'  ✅  Class {digit}: {count} sample(s) loaded')

    if fatal:
        print('\n❌  Training aborted due to dataset validation errors above.')
        raise SystemExit(1)

    images = np.stack(all_images, axis=0)
    labels = np.array(all_labels, dtype=np.int32)
    print(f'\n  Total custom samples: {len(labels)}\n')
    return images, labels


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Train a CNN for digit tracing evaluation')
    parser.add_argument('--local-export', type=Path, default=None,
                        help='Path to a JSON export of localStorage containing tracing_last_drawing_{digit} values')
    parser.add_argument('--model-dir', type=Path, default=BACKEND_DIR / 'models',
                        help='Directory where the model will be saved')
    parser.add_argument('--epochs',     type=int,  default=12,  help='Number of training epochs')
    parser.add_argument('--batch-size', type=int,  default=128, help='Training batch size')
    parser.add_argument('--no-mnist',   action='store_true',
                        help='Skip MNIST base dataset (train only on custom data)')
    parser.add_argument('--dataset-dir', type=Path,
                        default=TRAINING_DIR / 'dataset_processed',
                        help='Path to the processed custom dataset')
    parser.add_argument('--report-dir', type=Path,
                        default=TRAINING_DIR / 'reports',
                        help='Directory for accuracy/loss diagrams and metric history')
    args = parser.parse_args()

    # ── Load MNIST base ───────────────────────────────────────────────────────
    if args.no_mnist:
        x_train = np.empty((0, 28, 28, 1), dtype=np.float32)
        y_train = np.empty((0,),           dtype=np.int32)
        x_test  = np.empty((0, 28, 28, 1), dtype=np.float32)
        y_test  = np.empty((0,),           dtype=np.int32)
        print('Skipping MNIST dataset (--no-mnist flag set).')
    else:
        x_train, y_train, x_test, y_test = load_mnist_data()
        print(f'Loaded MNIST data: train={x_train.shape}, test={x_test.shape}')

    # ── Load custom processed dataset ────────────────────────────────────────
    if args.dataset_dir.exists():
        custom_images, custom_labels = load_custom_dataset(args.dataset_dir)
        x_train = np.concatenate([x_train, custom_images], axis=0)
        y_train = np.concatenate([y_train, custom_labels], axis=0)
        print(f'Combined training set size: {len(y_train)}')
    else:
        print(
            f'\n⚠️  Custom dataset directory not found: {args.dataset_dir}\n'
            f'   Run: python training/split_dataset.py\n'
            f'   Continuing with MNIST only.\n'
        )

    # ── Optionally add LocalStorage drawings ─────────────────────────────────
    if args.local_export is not None:
        local_images, local_labels = load_local_drawing_images(args.local_export)
        if local_images:
            local_images = np.stack(local_images, axis=0)
            local_labels = np.array(local_labels, dtype=np.int32)
            print(f'Loaded {len(local_labels)} local drawing images from {args.local_export}')
            x_train = np.concatenate([x_train, local_images], axis=0)
            y_train = np.concatenate([y_train, local_labels], axis=0)
        else:
            print('No local drawings loaded from export.')

    if len(x_train) == 0:
        print('❌  No training data available. Exiting.')
        raise SystemExit(1)

    # ── Build, train, save ────────────────────────────────────────────────────
    model = build_model()
    model.summary()

    validation_data = (x_test, y_test) if len(x_test) > 0 else None

    history = model.fit(
        x_train,
        y_train,
        validation_data=validation_data,
        epochs=args.epochs,
        batch_size=args.batch_size,
        shuffle=True,
    )

    save_training_reports(history, args.report_dir)

    args.model_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.model_dir / 'digit_tracing_model.h5'
    model.save(model_path)
    print(f'\n✅  Model saved to {model_path}')


if __name__ == '__main__':
    main()
