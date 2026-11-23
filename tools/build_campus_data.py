"""Build the ODbL campus snapshot from Overpass JSON exports, see campus-data/README.md."""
import argparse
import json
import math
import re
import subprocess
from collections import defaultdict
from pathlib import Path
from shapely.geometry import LineString, Polygon
from campus_geometry import assign_fields, osm_area

def load(path):
    export = json.loads(Path(path).read_bytes())
    if export.get("remark"):
        raise ValueError(f"Incomplete Overpass export: {path}: {export['remark']}")
    return export["elements"]

def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("campuses")
    p.add_argument("tracks")
    p.add_argument("stadiums")
    p.add_argument("--grounds", nargs="+", default=[], help="additional named grounds and multipolygon venues")
    p.add_argument("--cities")
    args = p.parse_args()
    root = Path(__file__).resolve().parents[1] / "campus-data"
    root.mkdir(exist_ok=True)
    reviews = json.loads(Path(__file__).with_name("campus-reviews.json").read_bytes())
    reviewed_sources = {r["source"] for r in reviews}
    cities = load(args.cities) if args.cities else []
    schools = []
    areas, area_schools = [], []
    for e in load(args.campuses):
        source = f"{e['type']}/{e['id']}"
        if source in reviewed_sources:
            area = osm_area(e)
            if area is not None:
                areas.append(area)
                area_schools.append(None)
            continue
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
        row = [name, city, aliases, round(lat,6), round(lon,6), bounds]
        separate = {"way/369327881":"世纪", "way/399354071":"宏福"}.get(source)
        meta = {"specificQuery": separate} if separate else {}
        area = osm_area(e)
        if area is not None:
            areas.append(area)
            area_schools.append(row)
            meta["fieldIds"] = []
        if meta:
            row.append(meta)
        schools.append(row)
    for order, r in enumerate(reviews):
        latitudes, longitudes = zip(*r["boundary"])
        box = [min(latitudes), min(longitudes), max(latitudes), max(longitudes)]
        schools.append([r["name"], r["locality"], r["aliases"], *r["center"], box,
                        {"boundary": r["boundary"], "venues": r["venues"], "order": order}])
    tiles = defaultdict(list)
    footprints, records = [], []
    seen = set()
    for e in (item for path in [args.tracks, args.stadiums, *args.grounds] for item in load(path)):
        key = (e["type"], e["id"])
        if key in seen:
            continue
        seen.add(key)
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
        if t.get("leisure") not in ("stadium", "track") and not re.search(r"操场|田径|运动场|操場|田徑|運動場",label):
            continue
        footprint = osm_area(e)
        if footprint is None:
            continue
        shells = getattr(footprint, "geoms", [footprint])
        if len(shells) != 1:
            continue
        points = [(y,x) for x,y in shells[0].exterior.coords]
        # Track surfaces can have an infield hole. Test the whole outside
        # footprint so an estimated loop cannot surround an off-campus parcel.
        footprint = Polygon(shells[0].exterior)
        if track and (len(points)<6 or points[0] != points[-1]):
            continue
        west, south, east, north = footprint.bounds
        lat, lon = (south+north)/2, (west+east)/2
        exact = track and running and e["type"] == "way" and t.get("area") != "yes"
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
        field_id = e["id"] if e["type"] == "way" else f"relation/{e['id']}"
        records.append((tile,[field_id,label,round(lat,6),round(lon,6),int(exact),coords,int(track)]))
        footprints.append(footprint)
    if not areas:
        raise ValueError("Campus export contains no complete polygons. Export using out geom.")
    named_grounds = defaultdict(list)
    matches = []
    for owner, shape, (tile, record) in zip(assign_fields(areas, footprints), footprints, records):
        if owner is None or area_schools[owner] is None:
            continue
        matches.append((owner, tile, record, shape))
        if record[1]:
            named_grounds[owner].append((shape, record[1]))
    # A track inside a named sports centre often has no name of its own.
    for owner, _, record, shape in matches:
        if record[6] and not record[1]:
            parents = [(outer.area, name) for outer, name in named_grounds[owner] if outer.covers(shape)]
            if parents:
                record[1] = min(parents)[1]
    routes = subprocess.run(["node", Path(__file__).with_name("preview_footprints.mjs")],
                            input=json.dumps([record for _,_,record,_ in matches]).encode(),
                            stdout=subprocess.PIPE, check=True)
    for (owner,tile,record,_), route in zip(matches,json.loads(routes.stdout),strict=True):
        if areas[owner].covers(LineString([(x,y) for y,x in route])):
            area_schools[owner][6]["fieldIds"].append(record[0])
            tiles[tile].append(record)
    write(root/"schools.json", {"schools":schools, "tiles":sorted(tiles)})
    for key, rows in tiles.items():
        write(root/(key+".json"),rows)
    for file in root.glob("*_*.json"):
        if re.fullmatch(r"\d+_\d+",file.stem) and file.stem not in tiles:
            file.unlink()
    print(len(schools),"school entries;",sum(map(len,tiles.values())),"venues;",len(tiles),"tiles")

if __name__ == "__main__":
    main()
