from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)


def make_icon(size: int) -> Image.Image:
    scale = size / 256
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    margin = round(16 * scale)
    radius = round(62 * scale)
    draw.rounded_rectangle(
        (margin, margin, size - margin, size - margin),
        radius=radius,
        fill=(45, 113, 83, 255),
    )
    draw.line(
        [
            (round(66 * scale), round(133 * scale)),
            (round(108 * scale), round(174 * scale)),
            (round(194 * scale), round(79 * scale)),
        ],
        fill=(250, 251, 247, 255),
        width=max(2, round(22 * scale)),
        joint="curve",
    )
    return image


icon = make_icon(256)
icon.save(ASSETS / "icon.png")
icon.save(
    ASSETS / "icon.ico",
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
make_icon(32).save(ASSETS / "tray.png")
