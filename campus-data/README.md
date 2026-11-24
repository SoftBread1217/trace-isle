# 校园与场地索引

本目录为 OpenStreetMap 公开数据的衍生数据库，© [OpenStreetMap 贡献者](https://www.openstreetmap.org/copyright)，遵循 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。本目录的 JSON 文件可独立下载和复用。城市邻近提示使用 [Natural Earth 1:10m Populated Places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/) 公有领域数据。地名与场馆记录来自地图贡献者。

2026-11-23 快照覆盖北纬 18–54 度、东经 73–135 度检索框。学校索引收录带中文或汉字名称的大学地图条目，一个学校可以有多个校区条目；覆盖范围不等于学校或行政区边界。自动推荐会核对场地完整外轮廓和初始模拟路线是否都在所选校区的地图边界内。圈长根据轨迹几何计算，场馆边界只用于生成可调整的估算模板。

## 数据生成

北邮搜索采用[本科办学地点](https://zsc.bupt.edu.cn/info/1016/1126.htm)口径。校区边界及核对记录保存在 [campus-reviews.json](../tools/campus-reviews.json)，重新生成索引时一并合入。海淀校区的[田径场](https://www.openstreetmap.org/relation/9605496)是由内外边界组成的面，在[西土城路校区](https://www.openstreetmap.org/way/279303636)内；沙河使用[校内田径场范围](https://www.openstreetmap.org/way/685054779)。海南校区以[北邮玛丽女王海南学院](https://www.openstreetmap.org/way/1581708925)为地图锚点，标注[黎安园区共享体育场](https://www.openstreetmap.org/way/1125998153)。这些轮廓用于估算一圈，未提供实测道线。其他学校按完整校界匹配，保留多片校区及边界内的空洞。嵌套校区优先采用内层校区；有多个归属且无法区分时跳过。只有学校中心点或不完整边界的条目保留搜索和手动选点。校界由地图贡献者绘制，表示空间关系。

用 Overpass 导出以下查询的 JSON 文件。学校和场地均需完整几何数据。

```overpass
[out:json][timeout:80];nwr(18,73,54,135)[amenity=university][name];out geom;
```

```overpass
[out:json][timeout:80];way(18,73,54,135)[leisure=track];out geom;
```

```overpass
[out:json][timeout:80];way(18,73,54,135)[leisure=stadium];out geom;
```

学校体育中心和由多条线组成的场地另外导出两份资料：

```overpass
[out:json][timeout:150];relation(18,73,54,135)[leisure~"^(track|stadium)$"];out geom;
```

```overpass
[out:json][timeout:150];way(18,73,54,135)[leisure=sports_centre][name~"操场|田径|运动场|操場|田徑|運動場"];out geom;
```

生成索引需要 Python 3.10+、Shapely 2 和 Node.js。网页使用预先计算的结果。

```sh
python tools/build_campus_data.py campuses.json tracks.json stadiums.json --grounds relations.json sports-centres.json --cities cities.json
```

城市点文件可选，格式为含 `elements` 数组的 JSON。区域分片按 3 度网格编号，坐标偏移以百万分之一度表示。场地 ID 以数字表示 OSM way，以 `relation/编号` 表示关系。每个有完整边界的学校条目带有 `fieldIds`，只列出通过空间校验的场地。手工核对的共享场地单独注明。
