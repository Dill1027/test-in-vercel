"""Run locally in an environment with TensorFlow and tf2onnx installed."""
from pathlib import Path
import subprocess
import sys
import tempfile
import tensorflow as tf

root = Path(__file__).resolve().parent
source = root / 'digit_tracing_model.h5'
output = root / 'digit_tracing_model.onnx'

if not source.exists():
    raise SystemExit(f'Put {source.name} beside this script first.')

model = tf.keras.models.load_model(str(source), compile=False)

# The training model includes random image augmentation layers. They are no-op
# layers during TensorFlow inference, but tf2onnx otherwise exports their random
# operations and produces an ONNX graph unsupported by ONNX Runtime. Build a
# prediction-only graph that reuses every trained layer and weight except those
# augmentation-only layers.
augmentation_layers = (
    tf.keras.layers.RandomRotation,
    tf.keras.layers.RandomTranslation,
    tf.keras.layers.RandomZoom,
)
inputs = tf.keras.Input(shape=(28, 28, 1), name='input_layer')
outputs = inputs
for layer in model.layers:
    if isinstance(layer, augmentation_layers):
        continue
    outputs = layer(outputs, training=False)
inference_model = tf.keras.Model(inputs=inputs, outputs=outputs, name='digit_tracing_inference')

with tempfile.TemporaryDirectory() as d:
    inference_model.export(d)  # Keras 3 SavedModel export; inference graph
    subprocess.run([
        sys.executable, '-m', 'tf2onnx.convert',
        '--saved-model', d, '--output', str(output), '--opset', '15'
    ], check=True)
print(f'Created: {output} ({output.stat().st_size / (1024*1024):.2f} MiB)')
