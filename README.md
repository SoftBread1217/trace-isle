[![迹屿 · Trace Isle — iOS 虚拟定位与动态轨迹模拟工具](docs/images/trace-isle-cover.png)](https://softbread1217.github.io/trace-isle/)

# 迹屿 · Trace Isle

**iOS 虚拟定位与动态轨迹模拟工具。** 在地图上选点修改 iPhone 系统定位，或规划路线、自定义配速与距离，通过 Windows USB 助手实时将模拟坐标同步到真机。

**[下载 Windows USB 助手与源码](https://github.com/SoftBread1217/trace-isle/archive/refs/heads/main.zip)** · **[打开路线地图](https://softbread1217.github.io/trace-isle/)**

## 核心功能

- **固定点定位**：在地图上选点或输入经纬度，点击「应用固定点」写入 iPhone。
- **动态模拟**：搜索校内操场、自定义打点或导入 GPX。目标距离按公里设置，配速按分:秒/公里设置。支持开始、暂停、继续、重置和查看实时进度。
- **跑道与步道**：校园跑道按逆时针方向绕圈。目标距离超过开放路线长度时沿原路折返。
- **USB 设备控制**：显示连接与同步状态，支持恢复真实定位。

## 快速上手

环境：Windows、Apple Devices、Python 3.12、支持数据传输的 USB 线。iPhone 需运行 iOS 17.4 或以上版本，并能启用开发者模式。

1. **连接 iPhone。** 解压项目，运行 `Start-Windows-USB.cmd` 并保持窗口打开。在[本机 USB 控制台](http://127.0.0.1:4179/)点右上角「iPhone」→「连接 USB iPhone」。解锁手机，按提示信任电脑并开启开发者模式。
2. **选择定位模式。** 使用「固定点定位」时，点击地图或输入坐标，再点「应用固定点」。使用「动态轨迹」时，搜索学校并选择操场，点「使用这条跑道」；也可以展开「自定义路线」，在地图上打点后点「完成画线」。
3. **设置并开始模拟。** 输入目标距离与配速，例如 `2 km`、`6:00/km`，点「开始模拟」。模拟期间保持页面在前台；暂停会停在当前位置，重置动态模拟会回到起点。结束后在 iPhone 设置弹窗点「恢复真实定位」，在手机地图确认后断开。

在线地图可用于规划路线。向真机写入定位时，需进入本机控制台并连接 iPhone。

[![迹屿界面：固定点定位、动态轨迹、目标距离、配速及 USB 设备状态](docs/images/mile-end-workspace.png)](https://softbread1217.github.io/trace-isle/?preset=mile-end)

## 数据与测试

校区和场地来自 [OpenStreetMap](https://www.openstreetmap.org/copyright)。校园匹配规则及数据许可见[校园数据说明](campus-data/README.md)。封面与截图使用伦敦玛丽女王大学 [Mile End 校区](https://www.qmul.ac.uk/about/howtofindus/mileend/)步道。地图引擎采用 [Leaflet](vendor/LICENSE)。

```sh
node --test tests/*.test.mjs
```
