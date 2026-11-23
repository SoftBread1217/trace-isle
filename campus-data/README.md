# 校园与场地索引

本目录为 OpenStreetMap 公开数据的衍生数据库，© [OpenStreetMap 贡献者](https://www.openstreetmap.org/copyright)，遵循 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。本目录的 JSON 文件可独立下载和复用。城市邻近提示使用 [Natural Earth 1:10m Populated Places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/) 公有领域数据。地名与场馆记录来自地图贡献者。

2026-11-23 快照覆盖北纬 18–54 度、东经 73–135 度检索框。学校索引收录带中文或汉字名称的大学地图条目，一个学校可以有多个校区条目；覆盖范围不等于学校或行政区边界。按中心点检索附近操场时可能出现相邻学校的场地。圈长根据轨迹几何计算，场馆边界只用于生成可调整的估算模板。

## 数据生成

北邮搜索采用[本科办学地点](https://zsc.bupt.edu.cn/info/1016/1126.htm)口径。校区边界及核对记录保存在 [campus-reviews.json](../tools/campus-reviews.json)，重新生成索引时一并合入。海淀校区的[田径场](https://www.openstreetmap.org/relation/9605496)是由内外边界组成的面，在[西土城路校区](https://www.openstreetmap.org/way/279303636)内；沙河使用[校内田径场范围](https://www.openstreetmap.org/way/685054779)。海南校区以[北邮玛丽女王海南学院](https://www.openstreetmap.org/way/1581708925)为地图锚点，标注[黎安园区共享体育场](https://www.openstreetmap.org/way/1125998153)。这些轮廓用于估算一圈，未提供实测道线。其他有校区矩形边界的条目按边界筛选；只有中心点的条目显示附近候选并提示核对归属。

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
