"""앱 아이콘(icon.ico, PNG들)을 만든다.  사용법: python tools/make-icon.py
청록 바탕의 둥근 사각형 위에 명조체 '漢'. Windows에 설치된 바탕체(batang.ttc)를 쓴다.
필요한 것: Pillow (pip install pillow)
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
FONT = "C:/Windows/Fonts/batang.ttc"
GLYPH = "漢"
TOP, BOTTOM = (74, 148, 130), (40, 92, 78)  # 위쪽 밝은 청록, 아래쪽 어두운 청록
PAPER = (254, 246, 228)  # 한지 같은 연한 노랑


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        color = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = color
    return img


def draw_icon(size=1024, padding=0.0):
    """padding > 0이면 바탕을 안쪽으로 줄인다(안드로이드 maskable용 안전 영역)."""
    scale = 4  # 부드러운 가장자리를 위해 4배로 그린 뒤 줄인다
    big = size * scale
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    inset = int(big * padding)
    box = (inset, inset, big - inset, big - inset)
    inner = big - 2 * inset

    # 둥근 사각형 바탕(그라데이션)
    bg = gradient(inner).convert("RGBA")
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner - 1, inner - 1), radius=int(inner * 0.22), fill=255)
    canvas.paste(bg, (inset, inset), mask)

    # 위쪽의 은은한 빛
    glow = Image.new("RGBA", (inner, inner), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((-inner * 0.2, -inner * 0.75, inner * 1.2, inner * 0.55), fill=(255, 255, 255, 38))
    glow = glow.filter(ImageFilter.GaussianBlur(inner * 0.03))
    clipped = Image.new("RGBA", (inner, inner), (0, 0, 0, 0))
    clipped.paste(glow, (0, 0), mask)
    canvas.alpha_composite(clipped, (inset, inset))

    # 글자 '漢'
    font_size = int(inner * 0.66)
    font = ImageFont.truetype(FONT, font_size, index=0)
    left, top, right, bottom = font.getbbox(GLYPH)
    gw, gh = right - left, bottom - top
    gx = inset + (inner - gw) // 2 - left
    gy = inset + (inner - gh) // 2 - top - int(inner * 0.015)

    shadow = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((gx, gy + int(inner * 0.02)), GLYPH, font=font, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(inner * 0.012))
    canvas.alpha_composite(shadow)
    # 작은 크기에서도 보이도록 획을 조금 두껍게 한다
    bold = max(1, int(inner * 0.012))
    ImageDraw.Draw(canvas).text((gx, gy), GLYPH, font=font, fill=PAPER + (255,), stroke_width=bold, stroke_fill=PAPER + (255,))

    return canvas.resize((size, size), Image.LANCZOS)


def main():
    master = draw_icon(1024)
    # Windows 아이콘: 한 파일에 여러 크기
    sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    master.save(os.path.join(ROOT, "icon.ico"), sizes=sizes)
    # 웹/홈 화면용 PNG
    for name, size, pad in (("icon-192.png", 192, 0.0), ("icon-512.png", 512, 0.0), ("icon-maskable-512.png", 512, 0.1), ("apple-touch-icon.png", 180, 0.0)):
        draw_icon(1024, pad).resize((size, size), Image.LANCZOS).save(os.path.join(ROOT, name))
    print("만든 파일: icon.ico, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png")


if __name__ == "__main__":
    main()
