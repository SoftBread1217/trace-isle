# 迹屿 · Trace Isle

在 Windows 和 iPhone 浏览器里画路线、导入 GPX，并观察测试接收器如何逐点收到模拟位置。

## 使用

1. 打开网站，点击「播放」体验悉尼海港示例。
2. 点击「清空」后用「地图加点」画新路线，也可以直接导入 GPX。单个坐标点可以用「发送固定点」测试。
3. 设置速度和播放倍率。拖动进度条可查看任意时刻的坐标。
4. 用「分享测试链接」把较短的路线发送到 iPhone Safari。较长的路线请导出 GPX，再在手机导入。

模拟数据由页面里的「定位接收器」读取。共享链接在打开时复现同一份路线，各设备分别控制播放。它适合测试地图、速度和定位显示；系统定位保持由 iOS 管理。

GPX 导入支持一段轨迹、一条路线或一组航点，最多 4,000 点、2 MB。导入坐标后按界面设定的匀速播放，GPX 时间戳和高度不用来计算播放。路线文件在浏览器读取；分享链接会携带路线坐标。开启在线底图时，由浏览器向 OpenStreetMap 请求当前视野的图块，关掉底图仍可画线和回放。

## 本地运行

在项目目录运行 Python 3 的静态服务器，然后访问 `http://127.0.0.1:4178/`。

```sh
python -m http.server 4178 --bind 127.0.0.1
```

## 验证及发布

```sh
node --test tests/route.test.mjs
```

GitHub Pages 可从 `main` 分支根目录发布。仓库包含运行所需的静态文件，无需打包或安装 npm 依赖。

地图引擎 [Leaflet 1.9.4](https://leafletjs.com/)，许可见 [vendor/LICENSE](vendor/LICENSE)。在线底图由 [OpenStreetMap](https://www.openstreetmap.org/copyright) 提供。
