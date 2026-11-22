# Craft — 项目工作备忘

面向 agent 的项目关键信息。产品说明见 README.md。

## 构建 / 工具链

- 本机工具链在 `$HOME/.local/share/craft-toolchain/`,构建前必须导出:
  ```bash
  export JAVA_HOME=$HOME/.local/share/craft-toolchain/jdk
  export ANDROID_SDK_ROOT=$HOME/.local/share/craft-toolchain/android-sdk
  ```
- APK 输出:`android/app/build/outputs/apk/{debug/app-debug.apk,release/app-release.apk}`。
- Git remote 用 SSH(`git@github.com:justmao945/craft.git`);HTTPS 无凭据,不要用。

## 启动动画架构(冷启动三段)

1. **系统启动窗口**:`windowSplashScreenAnimatedIcon` = `@drawable/boot_mark_anim`(AnimatedVectorDrawable,600ms 生长动画,见 `android/app/src/main/res/animator/boot_mark_grow.xml`;矢量本体 `boot_mark_splash.xml`,group 命名 `splash_mark`)。
2. **窗口背景**:`boot_background`(纯色 + 96dp 静态图标),只在 HTML 渲染前的极短窗口可见。
3. **HTML splash**:WebView 内静态图标 + 三点动画,接管到 settle。

校准事实:
- `boot_mark_splash.xml` 的 scale **0.35** = 实测 96dp(视口约 275dp);窗口背景 icon item 也是 96dp,两段必须同尺寸。
- `MainActivity` 里 splash 退出逻辑:**挂住 splash 视图直到 decor 画出第一帧**(2s watchdog 兜底),否则 WebView 预热期会露出空白窗口。
- 约束:`removeOnDrawListener` 不能在 `onDraw` 回调内同步调用(抛 `IllegalStateException`,进程死),必须 `decor.post` 延迟移除。
- 残余:Chromium 首合成帧在 HTML 解析完成前有约 2 帧(60ms)白底过渡,属固有行为。

## 动画类改动必须逐帧验证

间隔截图会漏 1–3 帧瞬态,用户对此不满。标准流程:

```bash
adb shell am force-stop app.craft.android && sleep 1
adb shell screenrecord --time-limit 8 /sdcard/boot.mp4 &   # 先起录制,~1.5s 后 am start
adb shell am start -n app.craft.android/.MainActivity
adb pull /sdcard/boot.mp4 /tmp/boot.mp4
ffmpeg -i /tmp/boot.mp4 -vf fps=31 /tmp/frames/f%03d.png   # 全帧率抽帧
# 逐帧量化(图标 bbox 尺寸/中心)找跳变帧;no-icon 帧即空白帧
```

注意:`adb shell screenrecord ... &` 后必须保证 `am start` 与录制并行且录制进程有 `timeout` 保护,adb 管道挂起会让 `wait` 永不返回;录制成功与否先查设备上文件大小。

## 真机部署

- 用户的手机:vivo iQOO(via MTP)。**adb 看不到它**(USB 调试未开),不要反复试 adb。
- MTP 挂载:`gio mount 'mtp://[usb:003,021]'`(bus/dev 以 `lsusb` 实时为准),挂载点在
  `/run/user/1000/gvfs/mtp:host=...`,内部存储目录名是 `内部存储设备`。
- 拷贝安装包:`cp android/app/build/outputs/apk/release/app-release.apk "<挂载点>/内部存储设备/Download/craft-release.apk"`,手机端从 Download 手动安装。

## 提交

用 eval `commit` 命名空间(`d = await commit.draft(); await d.commit(subject, body)`);它只选中本会话编辑过的行,sed 等非工具写入或 bash `mv` 的新文件会以 `? / ◐` 列在 Review,需要 `git add` 补提交。
