"""Compile school/ground membership using complete OSM outlines (Shapely 2)."""
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.ops import linemerge


def coordinates(element):
    return [(p["lon"], p["lat"]) for p in element.get("geometry", []) if p]


def osm_area(element):
    if element["type"] == "way":
        points = coordinates(element)
        if len(points) < 4 or len(points) != len(element["geometry"]) or points[0] != points[-1]:
            return None
        polygon = Polygon(points)
        return polygon if polygon.is_valid and polygon.area else None
    if element.get("tags", {}).get("type") != "multipolygon":
        return None
    parts = {"outer": [], "inner": []}
    for m in element.get("members", []):
        role = m.get("role") or "outer"
        if role not in parts or m["type"] == "node":
            continue
        points = coordinates(m)
        if m["type"] != "way" or len(points) < 2 or len(points) != len(m.get("geometry", [])):
            return None
        parts[role].append(LineString(points))
    rings = {}
    for role, lines in parts.items():
        rings[role] = []
        if lines:
            merged = linemerge(lines)
            for line in getattr(merged, "geoms", [merged]):
                if not line.is_ring:
                    return None
                rings[role].append(Polygon(line))
    shells = rings["outer"]
    if not shells:
        return None
    holes = [[] for _ in shells]
    for hole in rings["inner"]:
        indices = [i for i, shell in enumerate(shells) if shell.covers(hole)]
        if not indices:
            return None
        holes[min(indices, key=lambda i: shells[i].area)].append(hole.exterior.coords)
    polygon = MultiPolygon([Polygon(s.exterior.coords, h) for s, h in zip(shells, holes)])
    return polygon if polygon.is_valid and polygon.area else None


def assign_fields(areas, fields):
    """Index only complete footprints inside one identifiable campus."""
    tree = STRtree(areas)
    for footprint in fields:
        owners = tree.query(footprint, predicate="covered_by")
        # A single enclosing campus is unambiguous. For nested campuses use the
        # innermost one; overlapping unrelated campus polygons are ambiguous.
        if len(owners):
            smallest = min(owners, key=lambda i: areas[i].area)
            if all(i == smallest or (areas[i].area > areas[smallest].area and
                                     areas[i].covers(areas[smallest])) for i in owners):
                yield int(smallest)
                continue
        yield None
