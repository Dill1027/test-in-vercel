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
with tempfile.TemporaryDirectory() as d:
    model.export(d)  # Keras 3 SavedModel export; inference graph
    subprocess.run([
        sys.executable, '-m', 'tf2onnx.convert',
        '--saved-model', d, '--output', str(output), '--opset', '15'
    ], check=True)
print(f'Created: {output} ({output.stat().st_size / (1024*1024):.2f} MiB)')
