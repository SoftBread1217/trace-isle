"""Build the site-hosted USB assistant. Run again when its inputs change."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
DOWNLOAD = ROOT / "downloads" / "Trace-Isle-Windows-USB.zip"
FILES = (
    "Start-Windows-USB.cmd", "usb_host.py", "index.html", "guide.html",
    "app.js", "usb.js", "presets.js", "route.js", "style.css", "isle.svg",
    "receive.html", "vendor/leaflet.css", "vendor/leaflet.js", "vendor/LICENSE",
    "campus-data/README.md", "campus-data/schools.json",
)


def package_files():
    for name in (*FILES, *(f"campus-data/{p.name}" for p in sorted((ROOT / "campus-data").glob("*_*.json")))):
        data = (ROOT / name).read_bytes().replace(b"\r\n", b"\n")
        if name.endswith(".cmd"):
            data = data.replace(b"\n", b"\r\n")
        yield name, data


def build():
    DOWNLOAD.parent.mkdir(exist_ok=True)
    temp = DOWNLOAD.with_suffix(".tmp")
    with ZipFile(temp, "w") as archive:
        for name, data in package_files():
            member = ZipInfo(name)
            member.compress_type = ZIP_DEFLATED
            member.create_system = 3
            member.external_attr = 0o100644 << 16
            archive.writestr(member, data)
    temp.replace(DOWNLOAD)


def verify():
    with ZipFile(DOWNLOAD) as archive:
        files = dict(package_files())
        if sorted(archive.namelist()) != sorted(files):
            raise SystemExit("Unexpected or missing file in USB assistant ZIP")
        for name, data in files.items():
            if archive.read(name) != data:
                raise SystemExit(f"USB assistant ZIP is out of date: {name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    if not parser.parse_args().check:
        build()
    verify()
    print(f"{DOWNLOAD.name}: verified ({DOWNLOAD.stat().st_size:,} bytes)")
