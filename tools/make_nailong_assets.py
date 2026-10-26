#!/usr/bin/env python3
# 从 nailong-pet 桌宠素材生成游戏内奶龙敌人皮肤：
#   waiting      -> assets/img/nailong-idle.png  (idle / dead，dead 靠 render 的 lean 倒下)
#   waving       -> assets/img/nailong-cast.png  (telegraph 蓄力)
#   running-left -> assets/img/nailong-hurt.png  (hurt / stagger)
#   jumping      -> assets/img/nailong-rise.png  (rise 起身，需去烘焙地面灰影)
# 全部按 alpha>8 裁到内容 bbox，脚底贴输出图底边（游戏内按脚底中心锚定）。
# 用法: py -3.11 tools/make_nailong_assets.py [源 sprites 目录]
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DEFAULT_SRC = REPO.parent / "nailong-pet" / "sprites"
OUT_DIR = REPO / "assets" / "img"

JOBS = [
    ("waiting.png", "nailong-idle.png", False),
    ("waving.png", "nailong-cast.png", False),
    ("running-left.png", "nailong-hurt.png", False),
    ("jumping.png", "nailong-rise.png", True),  # 唯一带烘焙地面灰影
]

ALPHA_CROP = 8


def remove_baked_shadow(rgba):
    """jumping.png 脚下有一团烘焙的浅灰投影，游戏内 drawShadow 另有投影，必须剥掉。

    灰影特征：低饱和、半透明、偏亮；脚/身体是深色或高饱和、不透明。
    从图片底边沿「灰影像素」泛洪：身体 AA 边即使低饱和也被不透明的脚挡住，
    不会被泛洪串到。"""
    arr = np.asarray(rgba).astype(np.int16)
    r, g, b, a = (arr[:, :, i] for i in range(4))
    mx = np.maximum(np.maximum(r, g), b)
    sat = mx - np.minimum(np.minimum(r, g), b)
    # 灰影=亮而近无色（含接近不透明的暖灰实底核，sat 最高到 42）；深色的脚
    # （mx 低）与黄色身体（sat 高）都是堤坝。找亮中性连通域，凡是下探到
    # y>=200（脚底光晕带）的整域删掉；肚皮奶油色 sat≈50 过不了，且被黄色
    # 四肢挡住不接底。
    passable = (a > 0) & (sat < 45) & (mx > 200)
    labels, n = ndimage.label(passable, np.ones((3, 3)))
    flood = np.zeros(a.shape, bool)
    for i in range(1, n + 1):
        if np.where(labels == i)[0].max() >= 200:
            flood |= labels == i
    out = arr.copy()
    out[flood, 3] = 0
    return Image.fromarray(out.astype(np.uint8), "RGBA"), int(flood.sum())


def trim(rgba):
    arr = np.asarray(rgba)
    ys, xs = np.where(arr[:, :, 3] > ALPHA_CROP)
    return rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, out_name, deshadow in JOBS:
        im = Image.open(src / name).convert("RGBA")
        if deshadow:
            im, n = remove_baked_shadow(im)
            print(f"{name}: 去灰影 {n} px")
        im = trim(im)
        im.save(OUT_DIR / out_name)
        print(f"-> {out_name} {im.size}")


if __name__ == "__main__":
    main()
