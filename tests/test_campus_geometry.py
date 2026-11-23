import sys
import unittest
from pathlib import Path
from shapely.geometry import Polygon, box

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from campus_geometry import assign_fields, osm_area


class CampusGeometryTests(unittest.TestCase):
    def test_concave_boundary_and_hole(self):
        campus = Polygon([(0,0),(12,0),(12,12),(8,12),(8,4),(4,4),(4,12),(0,12)],
                         holes=[[(1,1),(2,1),(2,2),(1,2)]])
        fields = [box(.2,4,3,6), box(5,6,6,7), box(.8,.8,2.2,2.2),
                  box(3,6,9,7), box(-.1,2,1,3)]
        self.assertEqual(list(assign_fields([campus], fields)), [0,None,None,None,None])

    def test_nested_or_overlapping_schools(self):
        areas = [box(0,0,10,10),box(1,1,3,3),box(8,3,12,6)]
        self.assertEqual(list(assign_fields(areas,[box(1.2,1.2,2,2),box(8.5,4,9,5)])), [1,None])

    def test_disjoint_components_and_incomplete_relations(self):
        def member(points, role="outer"):
            return {"type":"way","role":role,"geometry":[{"lon":x,"lat":y} for x,y in points]}
        members = [member([(4,4),(0,4),(0,0)]), member([(4,4),(4,0),(0,0)]),
                   member([(10,0),(12,0),(12,2),(10,2),(10,0)]),
                   member([(1,1),(2,1),(2,2),(1,2),(1,1)], "inner")]
        relation = {"type":"relation","tags":{"type":"multipolygon"},"members":members}
        area = osm_area(relation)
        self.assertEqual(list(assign_fields([area],[box(10.1,.1,11,1),box(6,1,7,2),box(1.1,1.1,1.5,1.5)])),
                         [0,None,None])
        self.assertIsNone(osm_area({**relation,"members":members[1:]}))
