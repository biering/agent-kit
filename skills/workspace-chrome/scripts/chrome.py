#!/usr/bin/env python3
"""Title-bar + status-bar colors from one accent hex. Stdlib only."""

from __future__ import annotations

import argparse
import json
import re
import sys
from colorsys import hls_to_rgb, rgb_to_hls
from pathlib import Path

CHROME_KEYS = (
    "titleBar.activeBackground",
    "titleBar.activeForeground",
    "titleBar.inactiveBackground",
    "titleBar.inactiveForeground",
    "titleBar.border",
    "commandCenter.foreground",
    "commandCenter.activeForeground",
    "commandCenter.inactiveForeground",
    "commandCenter.border",
    "commandCenter.activeBorder",
    "statusBar.background",
    "statusBar.foreground",
    "statusBar.border",
    "statusBar.noFolderBackground",
    "statusBar.debuggingBackground",
    "statusBar.debuggingForeground",
    "statusBarItem.remoteBackground",
    "statusBarItem.remoteForeground",
    "statusBarItem.activeBackground",
    "statusBarItem.hoverBackground",
    "statusBarItem.prominentBackground",
    "statusBarItem.prominentForeground",
    "statusBarItem.errorBackground",
    "statusBarItem.errorForeground",
    "statusBarItem.warningBackground",
    "statusBarItem.warningForeground",
)

DEBUG_BG = "#fbbf24"
ERROR_BG = "#f87171"
WARNING_BG = "#fbbf24"


def parse_hex(value: str) -> tuple[float, float, float]:
    text = value.strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6 or any(ch not in "0123456789abcdefABCDEF" for ch in text):
        raise ValueError(f"expected #RRGGBB, got {value!r}")
    return tuple(int(text[i : i + 2], 16) / 255 for i in (0, 2, 4))


def to_hex(rgb: tuple[float, float, float]) -> str:
    return "#{:02x}{:02x}{:02x}".format(
        *[max(0, min(255, round(c * 255))) for c in rgb]
    )


def shift(hex_color: str, *, lightness: float, saturation: float | None = None) -> str:
    r, g, b = parse_hex(hex_color)
    h, l, s = rgb_to_hls(r, g, b)
    if saturation is None:
        saturation = min(s, 0.72)
    return to_hex(hls_to_rgb(h, lightness, saturation))


def channel(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    r, g, b = parse_hex(hex_color)
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast(a: str, b: str) -> float:
    lighter, darker = sorted((luminance(a), luminance(b)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def on_color(background: str, accent: str) -> str:
    light = shift(accent, lightness=0.88, saturation=0.85)
    dark = shift(accent, lightness=0.12, saturation=0.45)
    white, black = "#ffffff", "#141414"
    candidates = (light, dark, white, black)
    return max(candidates, key=lambda color: contrast(color, background))


def chrome(accent: str) -> dict[str, str]:
    accent = to_hex(parse_hex(accent))
    active_bg = shift(accent, lightness=0.28)
    inactive_bg = shift(accent, lightness=0.16)
    hover_bg = shift(accent, lightness=0.40)
    active_fg = on_color(active_bg, accent)
    inactive_fg = on_color(inactive_bg, accent)
    accent_fg = on_color(accent, accent)
    debug_fg = on_color(DEBUG_BG, accent)
    error_fg = on_color(ERROR_BG, accent)
    warning_fg = on_color(WARNING_BG, accent)
    colors = {
        "titleBar.activeBackground": active_bg,
        "titleBar.activeForeground": active_fg,
        "titleBar.inactiveBackground": inactive_bg,
        "titleBar.inactiveForeground": inactive_fg,
        "titleBar.border": accent,
        "commandCenter.foreground": active_fg,
        "commandCenter.activeForeground": active_fg,
        "commandCenter.inactiveForeground": inactive_fg,
        "commandCenter.border": accent,
        "commandCenter.activeBorder": accent,
        "statusBar.background": active_bg,
        "statusBar.foreground": active_fg,
        "statusBar.border": accent,
        "statusBar.noFolderBackground": inactive_bg,
        "statusBar.debuggingBackground": DEBUG_BG,
        "statusBar.debuggingForeground": debug_fg,
        "statusBarItem.remoteBackground": accent,
        "statusBarItem.remoteForeground": accent_fg,
        "statusBarItem.activeBackground": hover_bg,
        "statusBarItem.hoverBackground": hover_bg,
        "statusBarItem.prominentBackground": accent,
        "statusBarItem.prominentForeground": accent_fg,
        "statusBarItem.errorBackground": ERROR_BG,
        "statusBarItem.errorForeground": error_fg,
        "statusBarItem.warningBackground": WARNING_BG,
        "statusBarItem.warningForeground": warning_fg,
    }
    missing = [key for key in CHROME_KEYS if key not in colors]
    extra = [key for key in colors if key not in CHROME_KEYS]
    if missing or extra:
        raise RuntimeError(f"chrome key mismatch missing={missing} extra={extra}")
    return colors


def strip_jsonc(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"(^|[^:])//.*?$", r"\1", text, flags=re.M)
    return text


def load_settings(path: Path) -> dict:
    if not path.exists():
        return {}
    raw = strip_jsonc(path.read_text())
    if not raw.strip():
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError(f"{path} is not a JSON object")
    return data


def write_settings(path: Path, accent: str, keep_other: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    settings = load_settings(path)
    colors = chrome(accent)
    existing = settings.get("workbench.colorCustomizations")
    if keep_other and isinstance(existing, dict):
        merged = dict(existing)
        merged.update(colors)
        settings["workbench.colorCustomizations"] = merged
    else:
        settings["workbench.colorCustomizations"] = colors
    path.write_text(json.dumps(settings, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Derive title-bar and status-bar colors from one accent."
    )
    parser.add_argument("accent", help="Accent color as #RRGGBB or RRGGBB")
    parser.add_argument(
        "--write",
        metavar="SETTINGS",
        help="Merge into this .vscode/settings.json (creates the file if needed)",
    )
    parser.add_argument(
        "--keep-other-chrome",
        action="store_true",
        help="Keep existing colorCustomizations keys outside title/status bars",
    )
    args = parser.parse_args()
    try:
        colors = chrome(args.accent)
        if args.write:
            write_settings(Path(args.write), args.accent, args.keep_other_chrome)
        print(json.dumps(colors, indent=2))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"chrome.py: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
