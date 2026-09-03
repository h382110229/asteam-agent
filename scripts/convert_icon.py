import os
from PIL import Image

src_img_path = r"C:\Users\h3821\.gemini\antigravity\brain\a7b25b82-b675-4e27-84ee-1f50d5eaaa38\asteam_agent_app_icon_1788421471493.jpg"
build_dir = r"d:\AIProject\asteam-agent\build"
os.makedirs(build_dir, exist_ok=True)

img = Image.open(src_img_path).convert("RGBA")

# Save 256x256 and 512x512 PNG
png_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
png_256.save(os.path.join(build_dir, "icon.png"), format="PNG")
print("[OK] Saved build/icon.png (256x256)")

# Also save into src/assets for renderer if needed
assets_dir = r"d:\AIProject\asteam-agent\src\assets"
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
