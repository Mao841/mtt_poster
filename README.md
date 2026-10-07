# 奶茶店滚动屏（多图连续滚动 · 离线可运行 · Vercel 部署）

多张图片拼接成一条长条，**匀速连续向下滚动**，滚完无缝回到第一张。
首次成功加载后即可**断网运行**（断电重启也能靠本地缓存恢复）。
电视/液晶显示器浏览器打开即全屏展示，无需投屏、无需付费激活。

## 生产 URL

```
https://milk-tea-poster.vercel.app
```

> 电视上请使用这个 **生产别名（production alias）** 地址。
> 不要使用形如 `milk-tea-poster-xxxx-maosy841-3053s-projects.vercel.app` 的「单次部署地址」——
> 它默认受 Vercel Authentication 保护，打开会跳到 vercel.com 登录页。

## 项目文件树

```
milk-tea-poster/
├── index.html                    # 全屏连续滚动页面（核心逻辑）
├── posters.json                  # 图片清单（加图只改这里）
├── 1.jpg                         # 海报（1706×1280 横）
├── 2.jpg                         # 菜单（1567×1004 横）
├── sw.js                         # Service Worker：离线缓存
├── vercel.json                   # 缓存策略 + 禁止搜索引擎收录
├── robots.txt                    # 同样用于禁止收录
├── tools/patch-vercel-cli.mjs    # 中文计算机名导致的 CLI 报错修复脚本
└── README.md
```

## 一、滚动是怎么实现的

- 所有图片**统一按屏幕宽度缩放**：宽度都等于屏宽，高度 = 屏宽 ÷ 图片自身宽高比。
  所以横图矮、竖图高，首尾相接成一条竖向长条。
- 长条用 `transform: translate3d()` 平移（GPU 合成，电视上比改 `scrollTop` 顺滑）。
- 长条内容**复制了一份接在后面**，位移到「一组高度」时画面与起点像素级一致，
  于是取模回绕时看不到任何跳变 —— 这就是无缝循环。
- 速度恒定：`时长 = 一组高度 ÷ 速度`。**图片变多时速度不变**，只是循环一圈更久。

## 二、当前参数（实测值）

| 项目 | 数值 |
| --- | --- |
| 滚动速度 | **54 px/s**（原 36 的 1.5 倍） |
| 当前海报数量 | **5 张**（1.jpg~5.jpg 全部横向统一步调） |
| 缓存版本 | **v6** |


改速度：打开 `index.html`，改最上面 `CONFIG.speedPxPerSec`（现在是 54，越小越慢）。

## 三、离线运行原理（重要）

页面注册了 Service Worker（`sw.js`），**首次成功加载时**会把
`index.html`、`posters.json` 和所有图片全部缓存到电视本地。

之后：

| 场景 | 表现 |
| --- | --- |
| 运行中断网 | ✅ 继续滚动，完全不受影响（页面已在内存里） |
| 断网后浏览器重载 | ✅ 从本地缓存恢复，正常滚动 |
| 断电重启 → 打开浏览器 | ✅ 从本地缓存恢复（前提：之前成功缓存过） |
| 断网 + 从未加载过 | ❌ 无法显示（这是物理限制，页面总得先来一次） |

**首次部署后务必做的验证：** 联网打开页面 → 等 30 秒（让缓存写完）→
拔掉网线或关掉 WiFi → 刷新页面 → 确认仍能正常滚动。

**离线状态会显示角标**：断网时右上角出现「离线运行中」，借此确认
「没网也在放」，同时提醒店员该检查网络了。

### 缓存的更新规则

- **图片**：本地优先。改了**同名**图片后如果没生效，把 `sw.js` 里的
  `CACHE_VERSION` 从 `'v3'` 改成 `'v4'` 再部署即可。
- **页面 / 清单**：网络优先（3 秒超时）。联网时改 `posters.json`
  或换图能**立刻生效**，断网时自动退回本地缓存。
- 升级后旧缓存会自动清理，不会占满电视存储。

## 四、如何加图 / 换图

### 加一张图

1. 图片放进本目录，命名顺延（`3.jpg`、`4.png`…），**文件名不要用中文**。
2. 在 `posters.json` 的 `files` 数组里**按展示顺序加一行**：

   ```json
   { "files": ["1.jpg", "2.jpg", "3.jpg"] }
   ```

3. 重新部署 + 改 `sw.js` 的 `CACHE_VERSION`（确保电视端缓存更新）。

### 换掉某张图

同名覆盖即可（例如换菜单就覆盖 `2.jpg`）。
**同名覆盖后必须把 `sw.js` 的 `CACHE_VERSION` 加一**，否则电视会一直放旧图。

### 图片建议

- 宽度建议 **≥1920px**。
- 横图竖图混排都没问题，脚本自动按宽高比算高度。
- 竖图特别长时可调 `maxImageHeightVh`（默认 320，即最高不超过 3.2 个屏高）。

## 五、部署命令

```powershell
# 若 npm/npx 报「无法加载文件 npm.ps1」，先临时放行
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

cd C:\Desktop\海报\milk-tea-poster

# 若 Vercel CLI 刚自动升级过，先重打主机名补丁（见第八节）
node tools\patch-vercel-cli.mjs

# 部署到生产
npx vercel --prod --yes

# 验证
curl.exe -s -o NUL -w "page=%{http_code}`n" https://milk-tea-poster.vercel.app/
curl.exe -s -o NUL -w "sw  =%{http_code}`n" https://milk-tea-poster.vercel.app/sw.js
curl.exe -s -o NUL -w "img =%{http_code}`n" https://milk-tea-poster.vercel.app/2.jpg
```

## 六、电视端设置清单

**浏览器**
- [ ] 安装 **TV Bro** 或 **Fully Kiosk Browser**（Android TV 应用商店可搜到）
- [ ] 地址栏输入 `https://milk-tea-poster.vercel.app`
- [ ] 外接 USB 鼠标，按 **F11** 全屏（或遥控器菜单里的全屏按钮）
- [ ] 浏览器设置里开启「开机自启 / 恢复上次页面」、隐藏地址栏

**系统（关键，否则半夜会自动黑屏或休眠）**
- [ ] 关闭 **休眠 / Sleep**：设置 → 系统 → 电源 → 从不休眠
- [ ] 关闭 **屏保 / Screensaver**
- [ ] 关闭 **自动关机 / 定时待机**
- [ ] 关闭 **HDMI-CEC 自动待机**
- [ ] 关闭 **画面自动亮度 / 环境光感应**
- [ ] 开启 **开机自动启动浏览器**（部分机型叫「开机通道」「商用模式」「Hotel Mode」）

**画面**
- [ ] 电视图像模式设为 **标准/鲜艳**，关闭「动态对比度」
- [ ] 确认分辨率 1920×1080 且 **16:9 不缩放（Just Scan / 点对点）**

**验证**
- [ ] 断网后刷新，确认仍能滚动（离线能力）
- [ ] 拔插电源重启，确认能自动回到滚动屏
- [ ] 连续挂机 24 小时，确认不白屏、不卡死

## 七、注意事项

### 1. 国内访问 `vercel.app` 可能不稳定

`*.vercel.app` 在国内部分网络下会被 DNS 污染或限速。
**好消息**：有了离线缓存，只在「首次加载」和「更新内容」时需要网络，
之后长期断网也能跑。但若首次加载就一直失败，仍建议迁到
国内对象存储（阿里云 OSS / 腾讯云 COS / 七牛）+ 自定义域名。
注意：迁到国内 OSS/COS 后 Service Worker 需要 HTTPS，请确认域名已配证书。

### 2. Vercel 商用合规

**Vercel Hobby 计划仅限个人非商业用途。** 奶茶店门口展示属于商业使用场景，
严格来说不符合 Hobby 条款。合规做法二选一：

- 升级 **Vercel Pro**（约 $20/月）；
- 或迁到**国内 OSS / COS + CDN**，按量付费，同样合规且国内更快。

### 3. 已禁止搜索引擎收录

菜单上有价格和电话，已加双重保险：

- `robots.txt` 全站 `Disallow: /`
- `vercel.json` 对全部响应下发 `X-Robots-Tag: noindex, nofollow, noarchive`

### 4. 缓存策略说明

`vercel.json` 里图片是 `max-age=604800`（7 天），页面 / 清单 / `sw.js` 是 `no-store`。

> 为什么不再全站 `no-store`：那会让电池重启的电视每次都重新下载全部图片，
> 既慢又费流量。现在换图靠 `CACHE_VERSION` 和网络优先策略控制，一样不会看到旧图。

## 八、中文计算机名导致的 CLI 报错（必读）

本机 Windows 计算机名是中文 `毛毛的电脑`。Vercel CLI 会把 `os.hostname()`
拼进 OAuth 请求的 `user-agent` 头，非 ASCII 字符会被 Node 的 undici 拒绝：

```
TypeError: Cannot convert argument to a ByteString because the character at index 0
has a value of 27611 which is greater than 255
```

**两个坑，都已处理：**

1. `npx vercel@latest` 每次自动升级都会重新下载一份**未打补丁**的副本，
   补丁随之失效 → 重新运行 `node tools\patch-vercel-cli.mjs`。
2. 补丁回退的主机名不能随便起。实测把回退值设成 `kiosk-pc` 时，
   Vercel API 会对部署请求返回 `Error: Not authorized`；
   改成正常形态的 `DESKTOP-8K2L9F3` 就正常了。脚本里已用后者。

补丁文件位置（升级后哈希目录会变，脚本会自动找）：

```
%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\vercel\dist\chunks\chunk-5XJNPXQK.js
备份：同目录 chunk-5XJNPXQK.js.dsh-backup
```

> ✅ **一劳永逸的办法：把 Windows 计算机名改成纯英文/数字**（例如 `MILKTEA-PC`），
> 重启后就不再需要这个补丁，也不会再出现 `Not authorized`。
> 强烈建议这么做 —— 否则每次 Vercel CLI 升级都要重跑一次补丁脚本。
