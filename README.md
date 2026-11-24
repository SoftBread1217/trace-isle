<p align="center">
  <a href="https://softbread1217.github.io/trace-isle/"><img src="docs/images/trace-isle-cover.png" width="100%" alt="迹屿 · Trace Isle，iOS 虚拟定位与动态轨迹模拟工具"></a>
</p>

<p align="center"><strong>搜到自己的校区，选一条操场跑道，让 iPhone 按设定的距离和配速移动。</strong><br>
也可以在地图上选一个点，通过 Windows USB 助手直接修改 iPhone 系统定位。</p>

<p align="center"><kbd>Windows</kbd> &nbsp; <kbd>iOS 17.4+</kbd> &nbsp; <kbd>USB 真机连接</kbd></p>

<p align="center">
  <strong><a href="https://softbread1217.github.io/trace-isle/">打开地图找操场 ↗</a></strong>
  &nbsp; · &nbsp; <strong><a href="https://github.com/SoftBread1217/trace-isle/archive/refs/heads/main.zip">下载 Windows USB 助手</a></strong>
  &nbsp; · &nbsp; <a href="#快速上手">快速上手 ↓</a>
</p>

## 按校区找操场

搜「北邮」，可以分别选择海淀、沙河和海南校区。选海淀，就能载入**西土城路校区田径场**；选海南，则会看到标有**园区共享**的黎安园区体育场。选好场地即可载入路线，省去沿弯道逐点描线的工夫。

| 校园数据 | 收录情况 |
| :--- | :--- |
| **3,598** 条学校或校区记录 | 同一所大学可以按校区分别查找 |
| **939** 条记录关联了场地 | 可选择已收录的操场，使用地图跑道或可调整的估算路线 |

自动推荐会核对场地完整轮廓和初始路线是否都在所选校区的地图边界内，避免把隔壁学校的操场算进来。归属有歧义时会跳过该候选；缺少校界或场地数据时，可以手动指定操场。以上数字取自 2026-11-23 的索引。[校园数据与匹配规则](campus-data/README.md)

## 核心功能

| 功能 | 在 iPhone 上可以做什么 |
| :--- | :--- |
| 📍 **固定点定位** | 点击地图或输入经纬度，把所选位置设为 iPhone 的系统定位。 |
| 🏟️ **动态轨迹** | 选校园跑道、自定义打点或导入 GPX。闭合跑道支持逆时针绕圈，开放路线可沿原路折返。 |
| ⏱️ **距离与配速** | 按公里设置目标距离，按分:秒/公里设置配速。模拟时可查看进度、暂停、继续或重置。 |
| 🔌 **USB 设备控制** | 查看连接与同步状态，结束测试后恢复真实定位。 |

[![迹屿的路线地图与模拟控制面板，显示伦敦玛丽女王大学 Mile End 校园步道](docs/images/mile-end-workspace.png)](https://softbread1217.github.io/trace-isle/?preset=mile-end)

## 快速上手

准备一台装有 **Apple Devices** 和 **Python 3.12** 的 Windows 电脑、一部支持开发者模式的 **iOS 17.4 或以上版本**的 iPhone，以及一根能传输数据的 USB 线。

1. **连接 iPhone。** 解压下载的项目，运行 `Start-Windows-USB.cmd` 并保持窗口打开。在[本机 USB 控制台](http://127.0.0.1:4179/)点右上角「iPhone」→「连接 USB iPhone」。解锁手机，按提示信任电脑并开启开发者模式。
2. **选点或选路线。** 定点时在地图上选点或输入坐标，再点「应用固定点」。动态模拟时搜索学校、选择操场，点「使用这条跑道」；也可以展开「自定义路线」，打点后点「完成画线」。
3. **开始动态模拟。** 填入目标距离和配速，点「开始模拟」，并保持电脑上的控制台页面在前台。暂停会停在当前位置，重置会回到起点。结束时在 iPhone 设置弹窗点「恢复真实定位」，在手机地图确认后断开。

在线地图可直接用于规划路线；向真机写入位置需连接本机 USB 控制台。

## 校园跑应用测试

**武汉大学 · 桂园操场**　｜　目标 **2 公里**　｜　配速 **6:00/公里**　｜　预计 **12 分钟**

在 iPhone 上打开待测校园跑 App，使用这组参数沿跑道逆时针模拟。每次经过起点时，检查 App 的累计里程是否连续；结束后，将记录轨迹与操场位置对照。升级 App 后用相同路线和参数再测一次，就能比较两个版本的记录结果。

## 数据与测试

校区和场地来自 OpenStreetMap 贡献者。校园索引可按 ODbL 1.0 复用，地图使用 Leaflet。界面截图取自伦敦玛丽女王大学 Mile End 校区步道。[地图数据署名](https://www.openstreetmap.org/copyright) · [校园数据说明](campus-data/README.md) · [Leaflet 许可](vendor/LICENSE) · [Mile End 校区](https://www.qmul.ac.uk/about/howtofindus/mileend/)

```sh
node --test tests/*.test.mjs
```

---

<p align="center"><strong>感谢使用迹屿！</strong><br>
如果迹屿帮你找到了学校的跑道，或帮你测好了一个定位功能，欢迎点一下仓库右上角的 <a href="https://github.com/SoftBread1217/trace-isle"><strong>☆ Star</strong></a>。<br>
发现操场标错了？欢迎在 <a href="https://github.com/SoftBread1217/trace-isle/issues">Issues</a> 留下学校、校区和场地名称。</p>
