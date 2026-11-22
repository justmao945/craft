# Craft

Craft 是一个 Android 端的「自生长」宿主应用：不产出独立 APK，而是根据用户需求为自己增加功能模块——**Gift**（工具、效率模块、小游戏均可）。每个 Gift 有独立的多文件 TSX 源码（git 仓库）、单一项目会话、专属 agent、Draft/Release 构建与版本历史。

界面支持中文 / English，默认跟随系统语言，可在「我的 → 语言」切换；中文界面中的 Gift/Gifts 译为「作品」，代码与存储契约保留 `Gift` 命名。

## 已实现

- Craft 主工作区：工坊为两层会话列表 / 聊天详情，通用会话置顶；底部为工坊、作品、广场、我的
- 每个作品只有一个项目会话；通用会话有独立固定工作目录，用于问答、草稿和普通文件
- 通用会话的聊天记录、完整模型上下文、文件和未发送草稿均持久化，可在后续版本叠加记忆功能
- 聊天式工作区、模板广场、Gift 列表（两段确认删除）与个人设置
- 自研 AgentRuntime：响应 Schema 校验、15 个工具、32 轮预算 + 自动收尾（子 agent 8 轮）、发布需用户确认
- 一个 Gift 绑定一个主 agent，可 `delegate_task` 委派独立上下文的子 agent
- `edit_file` 精确字符串替换（多处匹配需 `replace_all`）、`read_file` 按 `offset/limit` 行分片
- 完整模型上下文 JSONL 持久化 + snapcompact 式图片压缩（见下）
- esbuild-wasm + Web Worker 本地编译，独立 Android Preview WebView
- 真实截图、语义树、点击、输入和日志工具
- JGit 版本管理：快照 = git commit（id 即 commit hash），回滚 = checkout + clean + 新 commit，历史线性
- 会话状态恢复：冷启动回到上次 Gift / Tab，恢复未发送草稿与语言偏好
- Android Keystore 加密保存模型 API Key

## 持久化设计

所有数据位于系统共享目录 `/storage/emulated/0/Documents/Craft/`，全部原生实现，无浏览器适配层。卸载 App 不会删除该目录；只有用户手动删除文件，或在 App 内明确删除某个作品时才会移除对应数据。Android 11 及以上需要用户在系统设置中授予「所有文件访问」，Android 10 及以下使用存储运行时权限。旧版本的应用私有 `<filesDir>/craft/` 数据会在授权后自动复制到共享目录，不覆盖已有文件，也不自动删除旧副本。重装后原 API Key 密文无法由新 Keystore 密钥解密，需要在模型设置中重新填写。

```text
Documents/Craft/gifts.json                        Gift 注册表
Documents/Craft/<giftId>/workspace/**             源码（git 仓库，.git 对 agent 不可见）
Documents/Craft/<giftId>/snapshots/<commit>/meta.json  { id, message, createdAt, buildId? }
Documents/Craft/<giftId>/builds/<id>/{app.js,app.css}  不可变构建产物
Documents/Craft/<giftId>/draft.json / release.json     Draft / Release 指针
Documents/Craft/<giftId>/conversation.json        UI 会话（user/assistant 展示记录）
Documents/Craft/<giftId>/context.jsonl            完整模型上下文（含 tool 调用与 reasoning）
Documents/Craft/<giftId>/context-archive-<ts>.jsonl    每次压缩新建一份原始归档
Documents/Craft/.general/workspace/**                通用会话固定工作目录（草稿与普通文件）
Documents/Craft/.general/conversation.json           通用会话聊天记录
Documents/Craft/.general/context.jsonl               通用会话完整模型上下文
Documents/Craft/.general/context-archive-<ts>.jsonl   通用会话压缩归档
Documents/Craft/session.json                      { activeGiftId, activeTab, language, drafts }
Documents/Craft/agent-config.json                 模型配置（apiKey 加密）
```

仅内存保存：运行中状态、确认弹窗、Preview 前台状态（可由 draft/release 指针重建）。通用会话与作品均持久化；删除作品只级联删除该作品的产物，不影响通用会话。

## 上下文管理（snapcompact 式图片压缩）

- 主上下文为完整 `ModelMessage[]`，每轮全量发送；截图只保留最新一张，上一轮截图替换为占位文本
- 触发基于**模型上报的 `usage.prompt_tokens`**（参考 omp）：达到「上下文窗口 × 触发比例」即压缩，两项均可在「我的 → 模型设置」配置，默认 1M 窗口 × 30% = 300k tokens
- 压缩保留最近约 20k 字符原文，较早消息先**原样归档为新 JSONL 文件**，再渲染成分页 PNG（1536px 宽、等宽字体、中英混排自动换行）；归档体积过小（< 20k 字符）时跳过，避免无效重复压缩
- 渲染前先减量：tool 结果截头尾（2000 字符，0.6 头部比）、tool 参数值 500 / 整调用 2000 字符上限
- 页数预算 8 页，**超出丢弃最旧页**；被丢弃细节仍可通过 `list_context_archives` / `read_context_archive` 工具按需找回
- 切点绝不落在 tool 结果上，保持 tool_call/tool 配对
- **恢复**（参考 omp overflow recovery）：请求报上下文超限错误、或 `finish_reason=length` 截断时，先强制本地压缩再重试一次；压缩无进展（无可归档内容）则保留原状
- 压缩说明附**累计文件操作清单**（`(Read)`/`(Write)`/`(RW)` 标记，超 20 个折叠），模型可据此恢复工作状态
- 主 agent 单轮预算 32 轮（子 agent 8 轮）；预算用尽时自动请求一次**不含工具的收尾总结**，而不是直接报错（参考 omp auto-continue）
- 冷启动从 `context.jsonl` 无损恢复；无该文件的旧会话退化为 user/assistant 文本回放

## Agent 工具（15 个）

通用会话只开放 `list_files` / `read_file` / `write_file` / `edit_file` 与两个历史归档工具，目标固定为 `.general/workspace/`；不能创建、读取或修改作品，也不能构建、预览、发布或委派子 agent。

| 工具 | 作用 | 未绑定 | 主 agent | 子 agent |
|---|---|---|---|---|
| `create_gift` | 创建并绑定 Gift（仅一次） | ✅ | — | — |
| `list_files` / `read_file` / `write_file` / `edit_file` | 源码读写、分片读取、精确编辑 | — | ✅ | ✅ |
| `build_gift` | 编译 → Draft → 打开真实 Preview | — | ✅ | ✅ |
| `inspect_preview` / `screenshot_preview` | 语义树 / 截图 | — | ✅ | ✅ |
| `click_preview` / `input_preview` / `preview_logs` | 预览交互与日志 | — | ✅ | ✅ |
| `list_context_archives` / `read_context_archive` | 压缩归档回读 | — | ✅ | ✅ |
| `delegate_task` | 委派子 agent（禁止嵌套） | — | ✅ | ❌ |
| `publish_gift` | git commit + 发布，需用户确认 | — | ✅ | ❌ |

## 技术栈

React · TypeScript · Vite · Capacitor 7 · Java Android（JGit）· esbuild-wasm · Zod

模型接口默认 DeepSeek Chat Completions（`deepseek-flash`），思考档位为官方 `none / low / high / max`（默认 high；旧别名 minimal→low、medium/xhigh→high 在读取配置时归一化）。工具轮次间保留 `reasoning_content`，Android 网络请求走 CapacitorHttp。

## 构建

需要 JDK 21 和 Android SDK（minSdk 26）。可复用本机已有工具链：

```bash
npm install
npm run build        # runtime 资源 + tsc + vite
npm run lint
npm run cap:sync
export JAVA_HOME=$HOME/.local/share/craft-toolchain/jdk
cd android && ./gradlew assembleDebug
```

APK 输出：`android/app/build/outputs/apk/debug/app-debug.apk`

```bash
export ANDROID_SDK_ROOT=$HOME/.local/share/craft-toolchain/android-sdk
$ANDROID_SDK_ROOT/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 关键边界

- Gift 是 Craft 内部模块，不导出独立 APK
- 通用会话固定使用 `.general/`，与所有作品目录隔离；会话和草稿不是一次性数据
- Gift 间无相互数据权限；`@craft/sdk` storage 按 `giftId + environment` 命名空间隔离
- Draft 与 Release 数据命名空间分离，Release 不包含测试控制 Bridge
- 回滚只回滚代码，不回滚模块 storage 数据或外部副作用
- 仅支持内置 React、React DOM 和 `@craft/sdk`，不支持任意 npm 包

## 源码结构

```text
src/agent/AgentRuntime.ts   主/子 agent 循环、工具执行、压缩触发
src/agent/context.ts        纯函数：JSONL 编解码、行分片、精确编辑、压缩切点
src/agent/contextImage.ts   归档序列化 + 分页 PNG 渲染（帧预算、丢最旧页）
src/compiler/               本地 TSX Worker 编译器
src/native/craft.ts         Capacitor 原生契约（giftStore / runtime）
src/runtime/                Gift 的 React/SDK Runtime
src/i18n.ts                 中英文字典与语言检测
android/                    原生 Gift 存储（JGit）、Preview WebView、插件桥接
scripts/                    Runtime 和 WASM 资源构建
```
