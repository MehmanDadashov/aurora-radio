#!/usr/bin/env python3
"""AURORA RADIO — генератор иконок.
Фон #12071F, виниловая пластинка: три цветные дуги (розовый/фиолетовый/циан),
дорожки, этикетка с радио-волнами, ручка справа.
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

BG = (18, 7, 31, 255)
PINK = (255, 61, 139)
VIOLET = (124, 92, 255)
CYAN = (0, 229, 255)
WHITE = (255, 255, 255)

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(BASE, 'android/app/src/main/res')
PUB = os.path.join(BASE, 'public')


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def build_master(size=1024):
    S = size
    img = Image.new('RGBA', (S, S), BG)

    # свечение
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([0.03 * S, 0.03 * S, 0.97 * S, 0.97 * S], fill=(124, 92, 255, 80))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S * 0.10)))

    cx = cy = S / 2
    R = 0.40 * S

    # корпус
    ImageDraw.Draw(img).ellipse([cx - R, cy - R, cx + R, cy + R], fill=(14, 5, 26, 255))

    # три цветные дуги поверх диска
    d = ImageDraw.Draw(img)
    arcs = [(200, 340, PINK), (300, 60, VIOLET), (40, 180, CYAN)]
    ring_w = S * 0.075
    for start, end, col in arcs:
        d.arc([cx - R * 0.92, cy - R * 0.92, cx + R * 0.92, cy + R * 0.92],
              start=start, end=end, fill=col + (255,), width=int(ring_w))
    # внутренняя часть — фиолетовая
    d.ellipse([cx - R * 0.80, cy - R * 0.80, cx + R * 0.80, cy + R * 0.80], fill=VIOLET + (255,))
    # поверх — снова дуги (чтобы перекрыть)
    for start, end, col in arcs:
        d.arc([cx - R * 0.92, cy - R * 0.92, cx + R * 0.92, cy + R * 0.92],
              start=start, end=end, fill=col + (255,), width=int(ring_w))

    # дорожки
    for k in range(9):
        rr = R * (0.55 + 0.045 * k)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(255, 255, 255, 30), width=max(1, int(S * 0.004)))

    # блик
    hl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([cx - R * 0.95, cy - R * 0.95, cx + R * 0.10, cy + R * 0.10], fill=(255, 255, 255, 26))
    img.alpha_composite(hl.filter(ImageFilter.GaussianBlur(S * 0.035)))

    # этикетка
    d = ImageDraw.Draw(img)
    lr = R * 0.36
    d.ellipse([cx - lr, cy - lr, cx + lr, cy + lr], fill=(18, 7, 31, 255))
    d.ellipse([cx - lr, cy - lr, cx + lr, cy + lr], outline=WHITE + (255,), width=max(2, int(S * 0.007)))
    for i in range(3):
        rr = lr * (0.42 + 0.24 * i)
        d.arc([cx - rr, cy - rr, cx + rr, cy + rr], start=-50, end=50,
              fill=[PINK, VIOLET, CYAN][i] + (255,), width=max(2, int(S * 0.008)))
    d.ellipse([cx - S * 0.014, cy - S * 0.014, cx + S * 0.014, cy + S * 0.014], fill=WHITE + (255,))

    # ручка справа
    arm = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ad = ImageDraw.Draw(arm)
    x0, y0 = cx + R * 0.20, cy - R * 0.72
    x1, y1 = cx + R * 0.98, cy + R * 0.30
    wd = S * 0.032
    ad.line([x0, y0, x1, y1], fill=WHITE + (245,), width=int(wd))
    ad.ellipse([x0 - wd * 0.75, y0 - wd * 0.75, x0 + wd * 0.75, y0 + wd * 0.75], fill=WHITE + (255,))
    ad.ellipse([x1 - wd * 0.9, y1 - wd * 0.9, x1 + wd * 0.9, y1 + wd * 0.9], fill=WHITE + (255,))
    img.alpha_composite(arm)
    return img


def strip_bg(im, tol=8):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if abs(r - BG[0]) <= tol and abs(g - BG[1]) <= tol and abs(b - BG[2]) <= tol:
                px[x, y] = (0, 0, 0, 0)
    return im


def circle_mask(s):
    m = Image.new('L', (s, s), 0)
    ImageDraw.Draw(m).ellipse([0, 0, s - 1, s - 1], fill=255)
    return m


def main():
    master = build_master(1024)
    os.makedirs(PUB, exist_ok=True)
    master.resize((512, 512), Image.LANCZOS).save(os.path.join(PUB, 'icon.png'))

    sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for q, s in sizes.items():
        folder = os.path.join(RES, 'mipmap-' + q)
        os.makedirs(folder, exist_ok=True)
        master.resize((s, s), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher.png'))
        rnd = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        rnd.paste(master.resize((s, s), Image.LANCZOS), (0, 0), circle_mask(s))
        rnd.save(os.path.join(folder, 'ic_launcher_round.png'))

        fg = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        inner = strip_bg(master.resize((int(s * 0.66), int(s * 0.66)), Image.LANCZOS))
        off = (s - inner.size[0]) // 2
        fg.paste(inner, (off, off), inner)
        fg.save(os.path.join(folder, 'ic_launcher_foreground.png'))

    master.resize((512, 512), Image.LANCZOS).save(os.path.join(RES, 'drawable', 'icon_radio.png'))

    for w, h in [(480, 320), (1080, 1920)]:
        sp = Image.new('RGBA', (w, h), BG)
        d = ImageDraw.Draw(sp)
        r = min(w, h) * 0.32
        d.ellipse([w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r], fill=VIOLET + (255,))
        d.ellipse([w / 2 - r * 0.84, h / 2 - r * 0.84, w / 2 + r * 0.84, h / 2 + r * 0.84], fill=(18, 7, 31, 255))
        d.ellipse([w / 2 - r * 0.28, h / 2 - r * 0.28, w / 2 + r * 0.28, h / 2 + r * 0.28], fill=(255, 255, 255, 255))
        for f in ['drawable', 'drawable-port-mdpi', 'drawable-land-mdpi']:
            sp.save(os.path.join(RES, f, 'splash.png'))
    print('icons written')


if __name__ == '__main__':
    main()
