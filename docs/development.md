# 开发说明

## 源码结构

```
packages/plugin/src/
├─ index.ts        Host 入口：ChatManagerService，一个 RPC 按 action 分发
├─ host/           只在 Node 侧
│  ├─ paths.ts     .dsh 根解析、目录布局、id 前缀、cwd 比较
│  ├─ scan.ts      磁盘扫描：会话目录与投影缓存配对
│  ├─ workspace.ts 读写 workspace.json，只改目标字段
│  └─ trash.ts     回收站：移动、manifest、恢复、彻底删除
├─ shared/         Host 与 Client 共用
│  ├─ types.ts     线格式类型
│  ├─ schemas.ts   zod 边界校验
│  └─ remote.ts    Typert InvocationDescriptor
└─ client/         只在浏览器侧
   ├─ index.tsx    注册 locale / remote / 样式 / 五个槽位
   ├─ api.ts       RPC 封装，双语错误按 " / " 拆半句
   ├─ DeleteAction.tsx 行内按钮、菜单项、确认框
   ├─ ChatManagerPage.tsx 回收站页与会话搜索页
   ├─ locales.ts   中英文字典
   ├─ style.ts     CSS 字符串，cm- 前缀 + --dsw-* 变量
   └─ ui.tsx       Dialog / RowActionButton / ToastHost / 防抖
```

## 构建

- 两套 tsconfig 各跑一次 `tsc --noEmit`。Client 侧不能有 `node:` 导入，所以 `paths.ts` 放 `host/`。
- tsdown 出三个产物：`lib/index.js`（esm/node）、`lib/remote.js`（esm/neutral）、`lib/client.js`（CJS + `window.__ModuleLoader__.load` 包装）。
- Client 产物把宿主提供的模块留作外部依赖（`react`、`react-dom`、`zod`、`cordis`、`dsh-client-ui-primitives`），其余内联。`scripts/verify-client.mjs` 在 vm 里跑产物，断言只引用白名单且注册五个槽位。
- `lib/` 入库。改完源码必须重新构建再提交。

## 宿主能力

| 接口 | 用途 |
| --- | --- |
| `workspaceRegistry.archiveSession(id, { stopActivity: true })` | 让会话从所有列表消失；有运行中的工作时先停 |
| `workspaceRegistry.unarchiveSession(id)` | 恢复时解除归档 |
| `workspaceRegistry.archivedSessionIds` | 搜索时判断已归档 |
| `sessionController.list()` | 直接返回 `SessionListValue`，不是 `{ ok, value }` 包装 |
| `typert.register({...})` | 把一个 RPC 暴露给浏览器侧 |

槽位：

| 槽位 | 内容 |
| --- | --- |
| `sidebar.workspaces.session.row.action` | 行悬停垃圾桶，`order: 700` |
| `sidebar.workspaces.session.menu.item` | 右键菜单删除项，`order: 650` |
| `shell.overlay` | 撤销提示条 |
| `main`（key `chat-manager-trash`） | 回收站与搜索页 |
| `sidebar.panellist` | 侧栏底部图标 |

按钮可见性跟 `useSessionAccess(id, "workspace/archiveSession")`：删除第一步就是归档。

## 接管删除工作区

Host 自带的 `deleteWorkspace` 只删注册，会话落到「未分组」。这里要的是连会话一起删，所以包装了 `ctx.workspaceRegistry.delete`：先读注册里的 `sessionIds`，逐个走会话删除，再调原方法删注册。

**为什么不用槽位或菜单项：** `contextMenus.register` 的键是 `target/id`，宿主已占 `workspace.delete`，重复注册抛 `Duplicate menu contribution`；Cordis 也不允许同名 `provide`。包装方法能成，是因为 `WorkspaceController.delete` 每次调用都读 `ctx.workspaceRegistry.delete`，不是构造时绑定的引用。

**递归陷阱：** 包装后的 `registry.delete` 就是 `deleteWorkspace`，原方法必须先存进 service 再用，否则自己调自己直到栈溢出。

**会话移进回收站失败时**（归档被拒、文件移不动），那个会话留在原地，工作区注册照删——等于退回宿主原行为，是可接受的降级。

## 数据格式

`~/.dsh/chat-manager/trash/<trashId>/`：

```
manifest.json      # 下面这份
log/               # 会话目录，原样搬（含 session.v3.jsonl.zstd）
projection.json    # 来自 storages/session_projcache/sessions/<bare-id>.json
workspace.json     # 删除那一刻的副本，供手工排查
```

```json
{
  "version": 1,
  "trashId": "<uuid>",
  "sessionId": "session-<uuid>",
  "bareId": "<uuid>",
  "title": "标题",
  "cwd": "D:\\Project\\demo",
  "deletedAt": 1762500000000,
  "sizeBytes": 123456,
  "original": { "logDirectory": "...", "projectionFile": "..." },
  "moved": { "log": "log", "projection": "projection.json" },
  "workspace": { "workspaceId": "<uuid>", "index": 3 },
  "workspaceDeleted": { "workspaceId": "<uuid>", "path": "...", "title": "...", "sessionIds": [] },
  "workspaceSnapshot": true
}
```

`workspaceDeleted` 只在删工作区时写入，撤销时用它重建注册。重建会拿到新 id，所以 reattach 必须用新 id，否则会话回不到任何工作区。

`sessionId` 必须存带 `session-` 前缀的写法：归档集合以它为键，存裸 id 会让撤销解不到归档。

`workspace.json` 只改 `tables.workspaces[*].sessionIds` 和 `global.pinnedSessionIds`。归档集合归 Host 管，插件不碰——删掉那个 id 等于当场撤销归档。写入走同目录临时文件再 `rename`。

## 样式

只用宿主的 `--dsw-*` 变量。

- 变量名要实测。这个构建是 `--dsw-alias-bg-layer-1/2/3`（不是 `bg-l1`）、`--dsw-alias-state-error-primary`（没有 `state-danger-primary`）、`--dsw-radius-sm` 为 8px。名字写错不报错，解析成空值静默失效。
- 尺寸按宿主控件量：行内图标按钮 24×24、4px 圆角、14px 图标；菜单行高 34px、13px 字号。
- 图标用宿主自带的 `<symbol id="dsw-icon-*">`，垃圾桶是 `dsw-icon-trash-outline-regular`。自己画同尺寸路径，留白和描边重量对不上邻居，看着就偏小。
- 菜单项用宿主 `MenuItemButton`，别手写 `<button role="menuitem">`。
- `shell.overlay` 是 click-through，提示条要 `pointer-events:auto`；确认框用 `createPortal` 挂到 `body`，否则被侧栏滚动容器裁掉。
- 确认框别放进会话行里。行的操作条在非悬停时是 `display:none`，弹窗会跟着闪掉。挂 `shell.overlay`，行只上抛「要删这个」的意图。
- 储物字典（`locale.dicts`）是可写 Map，可以就地改宿主文案并留好还原。但宿主可能比插件晚注册，要包 `locale.register` 等它注册后再改。

## 不做的事

- 不解析、不重建投影缓存，只整文件搬。
- 不自己拼项目目录名（`--D-Project-foo--`）。扫描时遍历 `sessions/` 下所有目录，靠 id 对上。
- 不写 Harness 的任何配置文件。
