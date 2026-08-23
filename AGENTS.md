# AGENTS.md

面向后续在本仓库继续开发的 Agent / 贡献者。读完再动手。

## 环境与工具

- 本机已安装 GitHub CLI(`gh`)且已认证:建仓、推送、release 等 GitHub 操作**优先用 `gh`**,不要手动调 API。
- 分发**双通道**:GitHub(tag + Release,源码与发布说明)+ npm(公开包 `dsh-ptc-cordis-preset`,用户安装入口);安装命令 `dsh plugin --profile web add dsh-ptc-cordis-preset`;版本管理用 git tag + GitHub Release,Release 的 published 事件自动触发 npm publish —— **Trusted Publishing (OIDC)**。

## 项目一句话

`dsh-ptc-cordis-preset`:DSH 插件,把内置 `code` preset(PTC 模式)与 `cordis` preset(创造模式)的增量合成一个新 preset **`ptc-cordis`(PTC 创造模式)**,启动时物化到用户 preset 根(`~/.dsh/.agent-presets/ptc-cordis/`)。

## 目录地图

| 路径 | 作用 |
|---|---|
| `src/index.js` | host 半(纯 JS 无构建):找 user 根 → 从本机 `cordis` preset 拷 skills → 物化合成组合 → 哈希标记管理 → 卸载清理 |
| `assets/agent.cordis.yml` | 合成组合:内置 `code` preset 原封不动 + `cordis` 的 persona / `tool-cordis` / `customSkillDirs` |
| `assets/preset.yml` | 显示元数据(name: PTC 创造模式;user preset **不带** `order`) |
| `dsh.plugin.json` | 插件注册表清单(id `dsh-external/dsh-ptc-cordis-preset`) |
| `cordis.patch.yml` | `dsh plugin add` 官方安装通道的自动挂载声明(insert 一行插件 row) |
| `tests/smoke.mjs` | 11 项冒烟测试(纯 helper 级,无 Cordis 运行时、无网络) |

## 核心不变量(改代码前必读)

1. **合成组合必须以本机最新内置 `code` preset 为底**。DSSH 升级后 `code`/`cordis` preset 可能变化:维护流程是重新对照两个内置 preset 的差异,手工同步进 `assets/agent.cordis.yml`。**不要**引入运行时读内置 preset 合成 YAML 的逻辑——组合文本要可审查、可 diff。
2. **skills 永远从本机已装的 `cordis` preset 现场拷贝**,不在仓库里存快照(跟随部署升级,也避免重复分发)。
3. **用户改过的 preset 绝不覆盖、绝不删除**:`.plugin-managed.json`(managedBy + 每文件 sha256,标记自身不参与哈希)是唯一判据。三种状态:absent / foreign / user-modified / unmodified——`foreign` 与 `user-modified` 一律不碰。
4. **卸载语义两分支**(与 dsh-deepseek-vision-bridge 的凭据清理同款):dispose 时包目录还在(重载/更新/重启)→ 保留 preset;包目录消失(市场页卸载)→ 仅当 unmodified 才删除。命令行卸载不触发 dispose,preset 残留是已知边界,README 已指引手动清理。
5. **无构建**:发布产物就是 `src/index.js` + `assets/*`。不要引入 TS/打包器;改动后 `npm test` 全绿即可。安装不触发任何 lifecycle 脚本(保持零 `allowBuilds` 摩擦)。
6. **`!!js` 表达式是字面文本**:assets 里的 `!!js process.platform === 'win32'` 等由 loader 方言求值,物化只做逐字节拷贝,绝不能经过任何 YAML parse→dump 往返(会丢表达式)。
7. **`tool-cordis` 必须裸挂 + 宿主侧兼容 shim 解决双模式共存**(v0.4.0,2026-08 三轮实测演进):① v0.1.0 裸挂 → 同进程第二个 cordis 模式挂载撞 `Host Cordis inspect provider "Service" is already registered`;② v0.2.0 realm 私有 runner → 挂载过但**浏览器桥被掐断**(client-runner 浏览器半 `inject: remote.dynamicCordisRunner` 只解析宿主面实例;审批队列/ack 在 runner 实例内部 → 审批卡不显示、Client Provider 不同步、Client 半无法激活、realm 作用域动态工具不可见);③ v0.3.0 裸挂 + 文档声明互斥;④ v0.4.0 找到根因面:碰撞点**仅** runner 的 `cordisInspect.register` 一处(tool-cordis 自身无守卫,源里 4 处全是 API 目录文档字符串),`src/index.js` 的 `installRegisterShim` 在插件启动时包裹它——原路径优先,仅撞重复 id 时替换条目(同包 manifest 等价,身份守卫 disposer),双 preset 共用唯一宿主 runner,桥全通(实测:双模式挂载 + 9 Provider 全应答)。shim 维护规则:必须防御式(形状探测/try-catch,异常退回裸挂行为并打日志);必须幂等(SHIM_FLAG 防二次包裹);dispose 必须还原原方法;上游原生容忍后自动变 no-op,勿删。组合文本保持裸挂不动,勿再引入 realm。
 8. **探针 preset 纪律**(2026-08 教训):挂载校验用的临时 preset(如 `ptc-cordis-probe2`)落进用户 preset 根后**对 UI 模式选择器立即可见**,用户可能新建会话时选到它;探针目录随后删除,该会话发消息即报 `preset not found`(头部记录被钉死在已删除的探针上)。规则:创建探针前先在对话里告知用户"不要选择即将出现的探针条目";探针必须在**同一轮**内删除,绝不跨轮存活;若用户会话已被钉在探针上,让其仍在 blank 时于模式 chip 改选 `ptc-cordis`(recompose 对 blank 会话合法),或弃掉该空白会话。

## 验证清单(改动后)

1. `npm test` 全绿。
2. 真机验证:删除 `~/.dsh/.agent-presets/ptc-cordis` → 启动/重载 DSH → 物化日志出现 → 模式选择器出现「PTC 创造模式」→ 新会话能用 `run_code` 且有 `cordis_*` 工具。
3. 若动了组合文本:用 cordis preset 会话跑 `agentPresets.standingKeyFor('ptc-cordis')` 挂载校验(拒绝会点名未激活的 row)。