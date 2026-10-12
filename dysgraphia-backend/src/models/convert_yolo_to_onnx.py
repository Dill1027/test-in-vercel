"""Run LOCALLY, not on Vercel. Requires ultralytics, torch, and onnx installed locally."""
import json
from pathlib import Path
from ultralytics import YOLO

folder = Path(__file__).resolve().parent
source = folder / 'best.pt'
if not source.is_file():
    raise FileNotFoundError(f'Copy your trained model to {source}')
model = YOLO(str(source))
with (folder / 'class_names.json').open('w', encoding='utf-8') as out:
    json.dump([model.names[i] for i in range(len(model.names))], out, ensure_ascii=False, indent=2)
exported = Path(model.export(format='onnx', imgsz=416, simplify=False, nms=False, dynamic=False, opset=17))
target = folder / 'best.onnx'
if exported.resolve() != target.resolve():
    import shutil
    shutil.copy2(exported, target)
print(f'ONNX model: {target}\nClasses: {folder / "class_names.json"}')
