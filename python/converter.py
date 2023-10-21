import subprocess

from ultralytics import YOLO

model_name = "yolov8n"

model = YOLO(f"{model_name}.pt")
model.export(format="onnx", opset=12, imgsz=[640, 640])

# move to onnx folder
subprocess.run(["mv", f"{model_name}.onnx", "../data"])
