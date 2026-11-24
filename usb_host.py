"""Local Windows USB host for Trace Isle. Run with Python 3.12."""
import asyncio
import hashlib
import math
import os
import re
import sys
import webbrowser
from contextlib import AsyncExitStack, asynccontextmanager, suppress
from pathlib import Path

import uvicorn
from starlette.applications import Starlette
from starlette.responses import FileResponse, RedirectResponse, Response
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocketDisconnect
from pymobiledevice3 import usbmux
from pymobiledevice3.exceptions import MuxException
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.pair_records import get_local_pairing_record
from pymobiledevice3.remote import tunnel_service
from pymobiledevice3.remote.remote_service_discovery import RemoteServiceDiscoveryService
from pymobiledevice3.remote.userspace_tunnel import UserspaceDialPlane
from pymobiledevice3.services.dvt.instruments.dvt_provider import DvtProvider
from pymobiledevice3.services.dvt.instruments.location_simulation import LocationSimulation

ROOT = Path(__file__).resolve().parent
STATE = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Trace-Isle"
CACHE = Path(os.environ.get("TRACE_ISLE_PAIR_CACHE", STATE / "pairing"))
PENDING = STATE / "restore-device"
ADDRESS = "127.0.0.1:27015"
ORIGIN = "http://127.0.0.1:4179"
busy = asyncio.Lock()


class DeviceIssue(Exception):
    pass


@asynccontextmanager
async def instrument():
    devices = [d for d in await usbmux.list_devices(usbmux_address=ADDRESS) if d.is_usb]
    if len(devices) != 1:
        raise DeviceIssue("请用 USB 连接一台已解锁的 iPhone。")
    serial = devices[0].serial
    CACHE.mkdir(parents=True, exist_ok=True)
    record = get_local_pairing_record(serial, CACHE)
    options = dict(serial=serial, connection_type="USB", usbmux_address=ADDRESS,
                   pairing_records_cache_folder=CACHE, autopair=False)
    async with AsyncExitStack() as stack:
        phone = await create_using_usbmux(pair_record=record, **options)
        stack.push_async_callback(phone.close)
        if not phone.paired and record:
            phone = await create_using_usbmux(**options)
            stack.push_async_callback(phone.close)
        if not phone.paired:
            try:
                await phone.pair(timeout=35)
            except MuxException:
                # Windows can report a duplicate after saving an approved pairing.
                pass
            if not await phone.validate_pairing():
                raise DeviceIssue("请解锁 iPhone，确认「信任此电脑」后重试。")
        if phone.all_values.get("DeviceClass") != "iPhone":
            raise DeviceIssue("请连接 iPhone。")
        if not await phone.get_developer_mode_status():
            raise DeviceIssue("请在 iPhone「设置 → 隐私与安全性 → 开发者模式」开启并确认，然后重新连接。")
        identity = hashlib.sha256(serial.encode()).hexdigest()
        if PENDING.exists() and PENDING.read_text() != identity:
            raise DeviceIssue("上次测试尚待恢复，请先连接上次使用的 iPhone。")
        # Give CoreDevice the very same authenticated lockdown connection.
        proxy = await tunnel_service.CoreDeviceTunnelProxy.create(phone)
        stack.push_async_callback(proxy.close)
        tunnel_service.USE_USERSPACE_TUNNEL = True
        tunnel = await stack.enter_async_context(proxy.start_tcp_tunnel())
        tun = tunnel.client.tun
        tun.set_peer(tunnel.address)
        relay = await stack.enter_async_context(UserspaceDialPlane(tun, tunnel.address))
        rsd = RemoteServiceDiscoveryService((tunnel.address, tunnel.port), open_connection=relay.dial,
                                            auxiliary_metadata=tunnel.auxiliary_metadata)
        stack.push_async_callback(rsd.close)
        await rsd.connect()
        provider = await stack.enter_async_context(DvtProvider(rsd))
        location = await stack.enter_async_context(LocationSimulation(provider))
        yield location, identity


async def control(ws):
    if ws.headers.get("origin") != ORIGIN or ws.headers.get("host") != ORIGIN.split("//")[1]:
        await ws.close()
        return
    await ws.accept()
    if busy.locked():
        await ws.send_json({"error": "另一个窗口正在使用 iPhone，请先在那个窗口断开连接。"})
        await ws.close()
        return
    async with busy:
        try:
            async with AsyncExitStack() as resources:
                async with asyncio.timeout(55):
                    location, identity = await resources.enter_async_context(instrument())
                async def restore():
                    await asyncio.wait_for(location.clear(), 8)
                    PENDING.unlink(missing_ok=True)
                if PENDING.exists():
                    await restore()
                last_seen = asyncio.get_running_loop().time()
                try:
                    await ws.send_json({"state": "ready"})
                    while True:
                        message = await asyncio.wait_for(ws.receive_json(), 15)
                        command = message.get("action")
                        if command == "set":
                            point = message.get("point")
                            if not (isinstance(point, list) and len(point) == 2 and
                                    all(type(n) in (int, float) and math.isfinite(n) for n in point)
                                    and abs(point[0]) <= 90 and abs(point[1]) <= 180):
                                raise DeviceIssue("坐标无效。")
                            if not PENDING.exists():
                                STATE.mkdir(parents=True, exist_ok=True)
                                temp = PENDING.with_suffix(".tmp")
                                temp.write_text(identity)
                                temp.replace(PENDING)
                            await asyncio.wait_for(location.set(*point), 8)
                        elif command == "clear":
                            await restore()
                        elif command == "ping":
                            now = asyncio.get_running_loop().time()
                            if now - last_seen >= 3:
                                attached = await asyncio.wait_for(usbmux.list_devices(usbmux_address=ADDRESS), 4)
                                if not any(d.is_usb and hashlib.sha256(d.serial.encode()).hexdigest() == identity
                                           for d in attached):
                                    raise DeviceIssue("USB 已断开，请重新连接原 iPhone。")
                                last_seen = now
                        else:
                            raise DeviceIssue("无法识别的操作。")
                        await ws.send_json({"state": {"ping": "alive", "set": "sent", "clear": "cleared"}[command]})
                finally:
                    if PENDING.exists():
                        await restore()
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            detail = str(exc) if isinstance(exc, DeviceIssue) else f"请解锁手机并检查 USB 和开发者模式（{type(exc).__name__}）。"
            if PENDING.exists():
                detail += " 恢复尚未确认，请连接原手机后点「恢复真实定位」。"
            with suppress(Exception):
                await ws.send_json({"error": detail})
        finally:
            with suppress(Exception):
                await ws.close()


ASSETS = {"index.html", "app.js", "route.js", "presets.js", "usb.js", "style.css", "isle.svg",
          "vendor/leaflet.js", "vendor/leaflet.css",
          "receive.html", "guide.html"}


async def assets(request):
    name = request.path_params.get("path") or "index.html"
    dataset = re.fullmatch(r"campus-data/(?:schools|\d{1,2}_\d{1,2})\.json", name)
    if request.headers.get("host") != ORIGIN.split("//")[1]:
        return Response(status_code=404)
    # A downloaded assistant can link users back to the current published package.
    if name == "downloads/Trace-Isle-Windows-USB.zip":
        return RedirectResponse(f"https://softbread1217.github.io/trace-isle/{name}")
    if name not in ASSETS and not dataset:
        return Response(status_code=404)
    if not (ROOT / name).is_file():
        return Response(status_code=404)
    return FileResponse(ROOT / name, headers={"Cache-Control": "no-store", "X-Frame-Options": "DENY"})


@asynccontextmanager
async def lifespan(_app):
    if "--open" in sys.argv:
        asyncio.get_running_loop().call_later(0.7, webbrowser.open, ORIGIN)
    yield


app = Starlette(routes=[WebSocketRoute("/iphone", control), Route("/{path:path}", assets)], lifespan=lifespan)
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=4179, access_log=False, ws="wsproto")

