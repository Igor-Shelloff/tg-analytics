import os
import shutil
import sys
from pathlib import Path

import PyInstaller.__main__


APP_NAME = "TGAnalytics"
MAIN_SCRIPT = "main.py"

SEP = ";" if os.name == "nt" else ":"

ROOT = Path(__file__).parent.resolve()
WEB_DIR = ROOT / "web"


def find_icon():
    if sys.platform == "win32":
        candidates = [ROOT / "icon.ico", ROOT / "icon.png"]
    elif sys.platform == "darwin":
        candidates = [ROOT / "icon.icns", ROOT / "icon.png"]
    else:
        candidates = [ROOT / "icon.png"]

    for c in candidates:
        if c.exists():
            return c
    return None


def clean_previous():
    print("Cleaning previous builds...")
    for folder in ("build", "dist"):
        p = ROOT / folder
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)
    for spec in ROOT.glob("*.spec"):
        try:
            spec.unlink()
        except OSError:
            pass


def build_params():
    params = [
        f"--name={APP_NAME}",
        "--windowed",
        "--clean",
        "--noconfirm",
        "--log-level=INFO",
    ]

    params.append(f"--add-data={WEB_DIR}{SEP}web")

    params += [
        "--collect-all=webview",
        "--hidden-import=webview",
        "--hidden-import=webview.platforms.edgechromium",
        "--hidden-import=webview.platforms.mshtml",
        "--hidden-import=webview.platforms.gtk",
        "--hidden-import=webview.platforms.cocoa",
    ]

    params += [
        "--collect-all=telethon",
        "--hidden-import=telethon",
        "--hidden-import=telethon.crypto",
    ]

    params += [
        "--collect-all=cryptg",
        "--hidden-import=cryptg",
    ]

    params += [
        "--collect-all=qrcode",
        "--hidden-import=qrcode",
        "--collect-all=PIL",
        "--hidden-import=PIL",
        "--hidden-import=PIL.Image",
    ]

    params += [
        "--collect-all=reportlab",
        "--hidden-import=reportlab",
        "--collect-all=matplotlib",
        "--hidden-import=matplotlib",
        "--hidden-import=matplotlib.backends.backend_agg",
    ]

    params += [
        "--hidden-import=ssl",
        "--hidden-import=_ssl",
        "--hidden-import=asyncio",
        "--hidden-import=sqlite3",
        "--hidden-import=json",
        "--hidden-import=queue",
    ]

    icon = find_icon()
    if icon:
        params.append(f"--icon={icon}")
        print(f"Using icon: {icon}")

    if sys.platform == "win32":
        params.append("--onefile")
    elif sys.platform == "darwin":
        params.append("--onedir")
        params.append("--osx-bundle-identifier=com.igorshelloff.tganalytics")
    else:
        params.append("--onefile")

    params.append(MAIN_SCRIPT)
    return params


def build():
    clean_previous()
    params = build_params()

    print("Building with PyInstaller...")
    print("Params:", " ".join(params))
    print()

    PyInstaller.__main__.run(params)

    print()
    if sys.platform == "win32":
        print(f"Build complete: dist/{APP_NAME}.exe")
    elif sys.platform == "darwin":
        print(f"Build complete: dist/{APP_NAME}.app")
    else:
        print(f"Build complete: dist/{APP_NAME}")


if __name__ == "__main__":
    build()