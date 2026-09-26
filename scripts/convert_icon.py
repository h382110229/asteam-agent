import os
from PIL import Image

import sys

src_img_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "build", "icon.png")
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
build_dir = os.path.join(project_root, "build")
os.makedirs(build_dir, exist_ok=True)

img = Image.open(src_img_path).convert("RGBA")

# Save 256x256 and 512x512 PNG
png_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
png_256.save(os.path.join(build_dir, "icon.png"), format="PNG")
print("[OK] Saved build/icon.png (256x256)")

# Also save into src/assets for renderer if needed
assets_dir = os.path.join(project_root, "src", "assets")
os.makedirs(assets_dir, exist_ok=True)
png_256.save(os.path.join(assets_dir, "icon.png"), format="PNG")

# Save multi-size ICO
icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(
    os.path.join(build_dir, "icon.ico"),
    format="ICO",
    sizes=icon_sizes
)
print("[OK] Saved build/icon.ico with sizes:", icon_sizes)
