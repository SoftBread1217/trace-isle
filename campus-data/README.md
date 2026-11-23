# 校园与场地索引

本目录为 OpenStreetMap 公开数据的衍生数据库，© [OpenStreetMap 贡献者](https://www.openstreetmap.org/copyright)，遵循 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。本目录的 JSON 文件可独立下载和复用。城市邻近提示使用 [Natural Earth 1:10m Populated Places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/) 公有领域数据。地名与场馆记录来自地图贡献者。

2026-11-23 快照覆盖北纬 18–54 度、东经 73–135 度检索框。学校索引收录带中文或汉字名称的大学地图条目，一个学校可以有多个校区条目；覆盖范围不等于学校或行政区边界。按中心点检索附近操场时可能出现相邻学校的场地。圈长根据轨迹几何计算，场馆边界只用于生成可调整的估算模板。

## 数据生成

用 Overpass 导出以下查询的 JSON 文件。学校查询支持附带 bounds，中心位置由 center 或 bounds 获取。

```overpass
[out:json][timeout:80];nwr(18,73,54,135)[amenity=university][name];out tags center;
```

```overpass
[out:json][timeout:80];way(18,73,54,135)[leisure=track];out geom;
```

```overpass
[out:json][timeout:80];way(18,73,54,135)[leisure=stadium];out geom;
```

运行 `python tools/build_campus_data.py schools-export.json tracks-export.json stadiums-export.json`。可用 `--cities` 指定含 `elements` 数组的城市点 JSON，点含经纬度和名称。区域分片按 3 度网格编号，坐标偏移以百万分之一度表示。每条场地记录的首项为 OSM way ID。
