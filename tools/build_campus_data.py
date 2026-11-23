"""Build the ODbL campus snapshot from Overpass JSON exports, see campus-data/README.md."""
import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

def load(path):
    return json.loads(Path(path).read_bytes())["elements"]

def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("campuses")
    p.add_argument("tracks")
    p.add_argument("stadiums")
    p.add_argument("--cities")
    args = p.parse_args()
    root = Path(__file__).resolve().parents[1] / "campus-data"
    root.mkdir(exist_ok=True)
    cities = load(args.cities) if args.cities else []
    schools = []
    for e in load(args.campuses):
        tags = e["tags"]
        name = tags.get("name:zh-Hans") or tags.get("name:zh") or tags["name"]
        if not re.search(r"[\u3400-\u9fff]", name):
            continue
        pt = e.get("center", e)
        box = e.get("bounds", {})
        if "lat" in pt:
            lat, lon = pt["lat"], pt["lon"]
        else:
            lat = (box["minlat"] + box["maxlat"]) / 2
            lon = (box["minlon"] + box["maxlon"]) / 2
        keys = ["short_name", "short_name:zh", "alt_name", "official_name", "name:zh", "name"]
        aliases = ";".join(dict.fromkeys(tags[k] for k in keys if k in tags and tags[k] != name))
        city = tags.get("addr:city", "")
        if not city and cities:
            dist = lambda c: (c["lat"]-lat)**2 + ((c["lon"]-lon)*math.cos(math.radians(lat)))**2
            nearest = min(cities,key=dist)
            if dist(nearest) < .6**2:
                city = nearest["tags"].get("name:zh",nearest["tags"]["name"])+"附近"
        bounds = [round(box[k],5) for k in ("minlat","minlon","maxlat","maxlon")] if box else []
        schools.append([name, city, aliases, round(lat,6), round(lon,6), bounds])
    tiles = defaultdict(list)
    for e in load(args.tracks) + load(args.stadiums):
        t = e["tags"]
        track = t.get("leisure") == "track"
        sports = set(t.get("sport","").split(";"))
        running = bool(sports & {"running","athletics"})
        label = t.get("name:zh") or t.get("name","")
        if not track and (t.get("indoor") == "yes" or re.search(r"体育馆|游泳馆|冰场|球馆|篮球馆|會館|體育館",label)):
            continue
        if not track and sports & {"swimming","ice_hockey","basketball","tennis","baseball","equestrian","motor","karting"} and not running:
            continue
        if track and t.get("sport") and not running:
            continue
        geom = e.get("geometry", [])
        points = [(g["lat"],g["lon"]) for g in geom]
        if track and (len(points)<6 or points[0] != points[-1]):
            continue
        pt = e.get("center") or {}
        if points:
            lat = (min(q[0] for q in points)+max(q[0] for q in points))/2
            lon = (min(q[1] for q in points)+max(q[1] for q in points))/2
        elif "lat" in pt:
            lat,lon = pt["lat"],pt["lon"]
        else:
            continue
        exact = track and running and t.get("area") != "yes"
        if exact:
            factor = math.cos(math.radians(lat))
            length = sum(math.hypot(b[0]-a[0], (b[1]-a[1])*factor)*111195 for a,b in zip(points,points[1:]))
            if not 80 <= length <= 1600:
                continue
        # Bound link size even on densely mapped tracks.
        if len(points)>146:
            points = [points[round(i*(len(points)-1)/145)] for i in range(146)]
        coords = [v for a,b in points for v in (round((a-lat)*1e6),round((b-lon)*1e6))]
        tile = f"{math.floor(lat/3)}_{math.floor(lon/3)}"
        tiles[tile].append([e["id"],label,round(lat,6),round(lon,6),int(exact),coords])
    write(root/"schools.json", {"schools":schools, "tiles":sorted(tiles)})
    for key, rows in tiles.items():
        write(root/(key+".json"),rows)
    for file in root.glob("*_*.json"):
        if re.fullmatch(r"\d+_\d+",file.stem) and file.stem not in tiles:
            file.unlink()
    print(len(schools),"school entries;",sum(map(len,tiles.values())),"venues;",len(tiles),"tiles")

if __name__ == "__main__":
    main()
