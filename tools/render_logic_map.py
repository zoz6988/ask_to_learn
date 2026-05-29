import json
import math
import os
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def find_font():
    candidates = [
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return None


FONT_PATH = find_font()


def font(size, bold=False):
    if FONT_PATH:
        return ImageFont.truetype(FONT_PATH, size=size)
    return ImageFont.load_default()


def stringify(item):
    if item is None:
        return ""
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return "；".join(f"{k}: {stringify(v)}" for k, v in item.items())
    if isinstance(item, list):
        return "；".join(stringify(v) for v in item)
    return str(item)


def normalize_list(value, limit=8):
    if value is None:
        return []
    if not isinstance(value, list):
        value = [value]
    return [stringify(item).strip() for item in value if stringify(item).strip()][:limit]


def wrap_text(text, width):
    wrapped = []
    for paragraph in str(text).splitlines():
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        # Chinese text does not wrap well with textwrap, so count wide chars
        line = ""
        count = 0
        for char in paragraph:
            char_width = 2 if ord(char) > 127 else 1
            if count + char_width > width:
                wrapped.append(line)
                line = char
                count = char_width
            else:
                line += char
                count += char_width
        if line:
            wrapped.append(line)
    return wrapped or [""]


def draw_round_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_section(draw, x, y, w, title, items, accent, max_lines=13):
    title_font = font(30)
    body_font = font(23)
    small_font = font(18)
    padding = 24
    line_h = 33
    title_h = 46
    lines = []
    for idx, item in enumerate(items, 1):
        prefix = f"{idx}. "
        for line_index, line in enumerate(wrap_text(item, 32)):
            lines.append((prefix if line_index == 0 else "   ", line))
            if len(lines) >= max_lines:
                break
        if len(lines) >= max_lines:
            break
    if len(items) > len(lines):
        lines.append(("   ", "..."))
    h = padding * 2 + title_h + max(1, len(lines)) * line_h + 12
    draw_round_rect(draw, (x, y, x + w, y + h), 22, "#ffffff", "#dbe5df", 2)
    draw_round_rect(draw, (x, y, x + w, y + 10), 6, accent)
    draw.text((x + padding, y + padding), title, fill="#17231f", font=title_font)
    draw.line((x + padding, y + padding + 46, x + w - padding, y + padding + 46), fill="#e6eee9", width=2)
    cursor_y = y + padding + title_h + 14
    for prefix, line in lines:
        draw.text((x + padding, cursor_y), prefix, fill=accent, font=small_font)
        draw.text((x + padding + 38, cursor_y - 2), line, fill="#2b3732", font=body_font)
        cursor_y += line_h
    return h


def render(payload):
    title = payload.get("title") or "学习逻辑图"
    map_data = payload.get("map") or {}
    knowledge = normalize_list(map_data.get("knowledgeTree"), 10)
    path = normalize_list(map_data.get("learningPath"), 8)
    argument = normalize_list(map_data.get("argumentMap"), 8)
    weak = normalize_list(map_data.get("weakPoints"), 8)

    width = 1800
    margin = 80
    gap = 34
    card_w = (width - margin * 2 - gap) // 2

    sections = [
        ("核心知识树", knowledge, "#176b5d"),
        ("学习路径", path, "#b95d2a"),
        ("论证思路", argument, "#365f9c"),
        ("仍需复习", weak or ["当前记录中未发现明显薄弱点。"], "#9b3f4c"),
    ]

    dummy = Image.new("RGB", (width, 100), "#f5f7f2")
    d = ImageDraw.Draw(dummy)
    heights = [draw_section(d, 0, 0, card_w, title, items, accent) for title, items, accent in sections]
    row1 = max(heights[0], heights[1])
    row2 = max(heights[2], heights[3])
    height = margin + 150 + row1 + gap + row2 + margin

    image = Image.new("RGB", (width, height), "#f5f7f2")
    draw = ImageDraw.Draw(image)

    # Subtle background bands.
    draw.rectangle((0, 0, width, 220), fill="#eaf2ed")
    draw.ellipse((-220, -260, 360, 320), fill="#dfece5")
    draw.ellipse((width - 260, 30, width + 180, 470), fill="#f0dfc3")

    title_font = font(54)
    sub_font = font(25)
    draw.text((margin, 52), title, fill="#15241f", font=title_font)
    draw.text(
        (margin, 122),
        "按原理、机制、路径和薄弱点整理的结构化知识体系",
        fill="#5f6f68",
        font=sub_font,
    )

    y0 = margin + 150
    draw_section(draw, margin, y0, card_w, sections[0][0], sections[0][1], sections[0][2])
    draw_section(draw, margin + card_w + gap, y0, card_w, sections[1][0], sections[1][1], sections[1][2])
    y1 = y0 + row1 + gap
    draw_section(draw, margin, y1, card_w, sections[2][0], sections[2][1], sections[2][2])
    draw_section(draw, margin + card_w + gap, y1, card_w, sections[3][0], sections[3][1], sections[3][2])

    return image


def main():
    raw = sys.stdin.buffer.read().decode("utf-8")
    payload = json.loads(raw)
    output = Path(payload["output"])
    output.parent.mkdir(parents=True, exist_ok=True)
    image = render(payload)
    image.save(output, "PNG", optimize=True)
    print(str(output))


if __name__ == "__main__":
    main()
