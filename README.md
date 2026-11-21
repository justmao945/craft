# Craft

Craft 是一个 Android 端的应用工坊验证项目：默认进入聊天式工作区，底部提供「对话 / 广场 / 应用 / 我的」四个 Tab。内置 Craft 通过自研 Agent 创建和修改多文件 React TSX 应用，在本地编译、预览、截图、测试、发布和回滚。

当前版本验证主链路，不包含独立 APK 导出。

## 已实现

- 项目维度的单会话工作区（每个项目一份持久对话）、模板广场、项目列表与个人设置
- 广场分类筛选及模板需求回填
- Android 状态栏、导航栏与输入法 Insets 适配
- 自研 AgentRuntime：模型响应 Schema 校验、工具调用、18 轮上限、发布确认
- 主 agent 可通过 `delegate_task` 委派子 agent：独立上下文、8 轮上限、禁止发布与再委派
- 多文件 TS/TSX 项目与相对导入
- esbuild-wasm + Web Worker 本地编译
- 独立 Android Preview WebView
- 实际 WebView 截图、语义树、点击、输入和日志工具
- Workspace、Snapshot、Build、Draft、Release 与回滚
- Android Keystore 加密保存模型 API Key
- 无 API Key 时可运行明确标注的离线 Todo 验证
- 仅用于桌面开发的浏览器存储与 iframe 适配器

## 技术栈

React · TypeScript · Vite · Capacitor 7 · Java Android · esbuild-wasm · Zod

## 本地检查

```bash
npm install
npm run build
npm run lint
```

浏览器开发验证：

```bash
npm run dev
```

在「对话」页点击“离线验证”。该按钮生成真实多文件 TSX 项目并依次执行本地编译、Draft、UI 自测、快照和发布，不调用模型。

## Android

需要 JDK 21 和 Android SDK。可复用本机已有工具链：

```bash
npm run build
npm run cap:sync
export JAVA_HOME=$HOME/.local/share/craft-toolchain/jdk
cd android
./gradlew assembleDebug
```

APK 输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

安装并启动：

```bash
export ANDROID_SDK_ROOT=$HOME/.local/share/craft-toolchain/android-sdk
$ANDROID_SDK_ROOT/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
$ANDROID_SDK_ROOT/platform-tools/adb shell am start -n app.craft.android/.MainActivity
```

## 自研 Agent

`src/agent/AgentRuntime.ts` 拥有完整开发循环，不依赖外部 Coding Agent Harness：

1. 会话与项目一一对应：未绑定时仅能创建新项目，绑定后只操作该项目。
2. 通过受控工具读写项目。
3. 编译 Workspace 并保存 Draft Build。
4. 打开真实 Preview WebView。
5. 获取截图、语义树、日志并执行 UI 操作。
6. 根据工具证据修复问题。
7. 经用户确认后创建 Snapshot 并发布 Release。

模型接口默认为 DeepSeek Chat Completions，可在「我的 → 模型设置」独立页面修改接口、模型和思考强度。思考强度通过 `reasoning_effort` 发送，并在工具调用轮次间保留模型返回的 `reasoning_content`。Android 网络请求通过 CapacitorHttp，API Key 由 Native 加密保存。

## 关键边界

- 会话与项目一一对应，保存在项目私有目录（`conversation.json`），不进入应用源码与 Release。
- 普通 App 无项目写入、版本发布、签名或其他 App 数据权限。
- Draft 与 Release 数据命名空间分离。
- 浏览器适配器只用于开发，不作为 Android 安全边界。
- Release 不能包含测试控制 Bridge。
- 代码回滚不自动回滚应用数据或外部副作用。
- 首版仅支持内置 React、React DOM 和 `@craft/sdk`，不支持任意 npm 包。

## 源码结构

```text
src/agent/       自研 Agent 状态循环与模型协议
src/compiler/    本地 TSX Worker 编译器
src/native/      Capacitor 契约及浏览器开发适配器
src/runtime/     用户 App 的 React/SDK Runtime
src/sample.ts    离线 Todo 验证项目
android/         Native 项目、版本与 Preview WebView
scripts/         Runtime 和 WASM 资源构建
```
