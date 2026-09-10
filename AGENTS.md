# AGENTS.md

面向后续在本仓库继续开发的 Agent / 贡献者。读完再动手。

## 环境与工具

- 本机已安装 GitHub CLI(`gh`)且已认证:建仓、推送、release 等 GitHub 操作**优先用 `gh`**,不要手动调 API。
- 分发**双通道**:GitHub(tag + Release,源码与发布说明)+ npm(公开包 `dsh-ptc-cordis-preset`,用户安装入口);安装命令 `dsh plugin --profile web add dsh-ptc-cordis-preset`;版本管理用 git tag + GitHub Release,Release 的 published 事件自动触发 npm publish —— **Trusted Publishing (OIDC)**。
- 发布后**触发 npmmirror 同步**(机器默认 registry 是 npmmirror,不同步则 dshmarket/pnpm 解析新版本号报 ERR_PNPM_NO_MATCHING_VERSION):
  `curl -X PUT https://registry.npmmirror.com/dsh-ptc-cordis-preset/sync`。

## 项目一句话

`dsh-ptc-cordis-preset`:DSH 插件,把内置 `code` preset(PTC 模式)与 `cordis` preset(创造模式)的增量合成一个新 preset **`ptc-cordis`(PTC 创造模式)**,启动时物化到用户 preset 根(`~/.dsh/.agent-presets/ptc-cordis/`)。

## 目录地图

| 路径 | 作用 |
|---|---|
| `src/index.js` | host 半(纯 JS 无构建):serve `ptc-cordis` settings 命名空间 → 找 user 根 → 从本机 `cordis` preset 拷 skills → 物化合成组合(era × gitbash × workflow 三维选文件)→ 哈希标记管理 → `SettingsScope.watch` 实时重物化 → 卸载清理 |
| `src/client.js` | 浏览器半(v0.8.0 新增,手写 ModuleLoader bundle):注册 `settings.plugin.item` 设置卡,暴露 workflow 开关(读写 `ptc-cordis` 命名空间的 `workflow` 布尔) |
| `assets/agent.cordis*.yml` | 合成组合,**双 era 六文件**:`agent.cordis.yml`/`agent.cordis.gitbash.yml`(dsh <= 0.1.1,内置 id `code`,workflow 恒启用——0.1.1 无禁用概念)与 ptc era 四件:`agent.cordis.ptc.yml`/`agent.cordis.ptc.gitbash.yml`(workflow **OFF**,与官方 `ptc` 对齐)+ `agent.cordis.ptc.workflow.yml`/`agent.cordis.ptc.gitbash.workflow.yml`(workflow **ON**,创造模式能力,默认);均为「内置 preset 原封不动(+ 按侧的 workflow 行)+ `cordis` 的 persona / `tool-cordis` / `customSkillDirs`」 |
| `assets/preset.yml` | 显示元数据(name: PTC 创造模式;user preset **不带** `order`) |
| `dsh.plugin.json` | 插件注册表清单(id `dsh-external/dsh-ptc-cordis-preset`) |
| `cordis.patch.yml` | `dsh plugin add` 官方安装通道的自动挂载声明(insert 一行插件 row) |
| `tests/smoke.mjs` | 冒烟测试(纯 helper 级,无 Cordis 运行时、无网络;含双 era × workflow 拆分断言 + client 纪律断言) |

## 核心不变量(改代码前必读)

1. **合成组合必须以本机内置 preset 为底,且双 era 各自对齐**。dsh 0.1.2 把内置 `code` preset 改名 `ptc`(`mode: code`→`ptc`,无兼容别名,另新增 `command-goal` 行、`modelSelectionSettings: true`、`fetch: true`)。维护流程:对照**对应版本**的内置 preset(`code` era ↔ 0.1.1,`ptc` era ↔ 0.1.2+),手工同步进两个 era 文件。**不要**引入运行时读内置 preset 合成 YAML 的逻辑——组合文本要可审查、可 diff;era 只决定「选哪个已提交文件」(`pickComposition`),不做文本合成。
2. **skills 永远从本机已装的 `cordis` preset 现场拷贝**,不在仓库里存快照(跟随部署升级,也避免重复分发)。
3. **用户改过的 preset 绝不覆盖、绝不删除**:`.plugin-managed.json`(managedBy + 每文件 sha256,标记自身不参与哈希)是唯一判据。三种状态:absent / foreign / user-modified / unmodified——`foreign` 与 `user-modified` 一律不碰。
4. **卸载语义两分支**(与 dsh-deepseek-vision-bridge 的凭据清理同款):dispose 时包目录还在(重载/更新/重启)→ 保留 preset;包目录消失(市场页卸载)→ 仅当 unmodified 才删除。命令行卸载不触发 dispose,preset 残留是已知边界,README 已指引手动清理。
5. **无构建**:发布产物就是 `src/index.js` + `assets/*`。不要引入 TS/打包器;改动后 `npm test` 全绿即可。安装不触发任何 lifecycle 脚本(保持零 `allowBuilds` 摩擦)。
6. **`!!js` 表达式是字面文本**:assets 里的 `!!js process.platform === 'win32'` 等由 loader 方言求值,物化只做逐字节拷贝,绝不能经过任何 YAML parse→dump 往返(会丢表达式)。
7. **`tool-cordis` 必须裸挂 + 宿主侧兼容 shim 解决双模式共存**(v0.4.0,2026-08 三轮实测演进):① v0.1.0 裸挂 → 同进程第二个 cordis 模式挂载撞 `Host Cordis inspect provider "Service" is already registered`;② v0.2.0 realm 私有 runner → 挂载过但**浏览器桥被掐断**(client-runner 浏览器半 `inject: remote.dynamicCordisRunner` 只解析宿主面实例;审批队列/ack 在 runner 实例内部 → 审批卡不显示、Client Provider 不同步、Client 半无法激活、realm 作用域动态工具不可见);③ v0.3.0 裸挂 + 文档声明互斥;④ v0.4.0 找到根因面:碰撞点**仅** runner 的 `cordisInspect.register` 一处(tool-cordis 自身无守卫,源里 4 处全是 API 目录文档字符串),`src/index.js` 的 `installRegisterShim` 包裹它——原路径优先,仅撞重复 id 时替换条目(同包 manifest 等价,身份守卫 disposer),双 preset 共用唯一宿主 runner,桥全通(实测:双模式挂载 + 9 Provider 全应答)。shim 维护规则:必须防御式(形状探测/try-catch,异常退回裸挂行为并打日志);必须幂等(SHIM_FLAG 防二次包裹);dispose 必须还原原方法;上游原生容忍后自动变 no-op,勿删。组合文本保持裸挂不动,勿再引入 realm。⑤ **v0.6.3 修复 ④ 的安装时机 bug**:④ 在插件 apply() 时一次性 `ctx.get('cordisInspect')`,但宿主 runner 行激活晚于插件行——真机启动时该服务尚未提供,shim 静默未安装(`register` 从未被包裹;进程内只要曾经挂过内置 `cordis`,ptc-cordis 就持续撞 "already registered" 直到重启;关闭/归档会话不会卸载 standing 挂载)。修复:改为 `ctx.inject(['cordisInspect'], …)`,服务就绪那一刻安装,与行激活顺序无关。验证清单补充:必须覆盖"cordis 先挂 + 选 ptc-cordis 成功"方向(0.6.3 已用完整 host 复验通过;此后动到 shim 需重跑)。
 8. **探针 preset 纪律**(2026-08 教训):挂载校验用的临时 preset(如 `ptc-cordis-probe2`)落进用户 preset 根后**对 UI 模式选择器立即可见**,用户可能新建会话时选到它;探针目录随后删除,该会话发消息即报 `preset not found`(头部记录被钉死在已删除的探针上)。规则:创建探针前先在对话里告知用户"不要选择即将出现的探针条目";探针必须在**同一轮**内删除,绝不跨轮存活;若用户会话已被钉在探针上,让其仍在 blank 时于模式 chip 改选 `ptc-cordis`(recompose 对 blank 会话合法),或弃掉该空白会话。
 9. **双 era 组合文本与 marker.base(v0.7.0)**:`detectBase` 每次启动探测 roster 内置 id(`ptc`→新 era,`code`/未知→保守 `code` era),`pickComposition` 按「era × gitbash」选已提交文件,marker 记 `base`;探测翻转或旧 marker 无 `base` 字段 → `syncDecision` 刷新。两种升级顺序(先插件/先 dsh)都自动收敛;`foreign`/`user-modified` 仍一律不碰。preset id `ptc-cordis` **永不改名**(会话钉在 id 上,改名即 preset not found)。**ptc era 组成随 alpha 演进继续漂移(v0.7.1,2026-09-02 同步 dsh 0.1.2-alpha.4)**:内置 `ptc` preset 给 `tool-workflow` 行加了 `disabled: true`(#3425:PTC 模式以 `run_code` 为唯一模型编排面,引擎行保留给 `ralph`),另更新头部/fork/subagent-report 注释与 preset.yml 描述;两个 ptc-era 资产已同步,smoke 增加「ptc-era 必须 disabled、code-era 必须启用」的 era 断言。code-era 文本(↔0.1.1)不受影响,依旧两分,无需第三 era。**v0.8.0 起选择升维为「era × gitbash × workflow」**:`pickComposition(base, gitBashActive, workflowOn, available)`,ptc era 各有 ON/OFF 双份(见不变量 11),marker 记 `workflow`,翻转即刷新;code era 无 workflow 变体——其 0.1.1 文本 workflow 恒启用,workflow-ON 请求落到标准链是**正确语义**而非降级。**persona 拆分第四维(v0.9.0,2026-09-04 同步 dsh 0.1.3-alpha.2)**:dsh 0.1.3-alpha.2(40792330c0)把 dsh-persona 的单一 `text` 键拆成 `prefix:`+`suffix:`(schema `prefix: required`,**无兼容别名**),旧键组合在新宿主上 persona 行校验失败。维度:`detectPersonaEra` 读 roster 内置条目(仅 ptc/standard/cordis/minimal,**绝不探测自家物化 preset**——会回声旧形态)的 agent.cordis.yml 判 split/text;marker 记 `persona`(旧 marker 无此字段视为 text);`pickComposition(base, gitBashActive, workflowOn, persona, available)` 在各特异性层内 `ps` 变体优先、退化到旧式文件。资产:4 个 ptc-era 文件各加 `.ps` 孪生(`agent.cordis.ptc[.gitbash][.workflow].ps.yml`,persona 取自 shipped cordis);code-era 两文件不动。**升级顺序无关**:新插件装在旧宿主探测得 text、行为与 0.8.x 一致;宿主跨拆分后首启探测翻转 → 同版本自动刷新。smoke:ps 键形/旧文件保形/pickComposition 四维矩阵/syncDecision persona 翻转/探测忽略自家 preset,共 37 项。 **present 能力维度(v0.9.1,2026-09-10 同步 dsh 0.1.5-alpha.2→rc.1)**:官方给 ptc/standard/cordis 三模式组合尾部追加 `- id: present / name: '@deepseek-ai/dsh-tool-present'`(不可变文件交付下载卡片;minimal 不加——官方极简模式同时单工具化,删了 filesystem 组)。该包 **0.1.5-alpha.2 首发**,组合里一行 import 失败会拒绝**整棵 preset 挂载**(agent-presets mount.ts),因此 present 行**绝不写进 8 份 ptc-era 资产**,改由物化时探测宿主(`hostHasToolPresent`:createRequire.resolve,按 boot 缓存)后注入:锚定 tool-presentation 块做纯字符串拼接(不解析 YAML,`!!js` 安全)、幂等、仅 `.ptc.` 文件参与(code-era 两文件是冻结历史)。marker 记 `present`(旧 marker 无字段视为 false),宿主升级使探测翻转 → syncDecision 自动重物化补行。smoke:注入锚/尾追加/幂等、syncDecision 翻转、materialize 端到端(含 code-era 不注入)、8 份资产不得写死 present 且必须带注入锚,共 41 项。
10. **未来破坏点跟踪**:官方宣布会话持久词汇(`tool/code-dispatch*`、日志插件名 `tools-code-mode`、`:code:` 子调用段)将在 SESSION_FORMAT_VERSION v0→v1 迁移时改名(dsh 仓库 notes `2026-08-25-rename-code-mode-to-ptc` 的 Deferred 一节)。那是独立于 0.1.2 的一次升级,落地时复查双 era 划分是否需要第三个 era(2026-08-29 复核:dsh 0.1.2-alpha.1 仍为 SESSION_FORMAT_VERSION=0,迁移未落地;2026-09-02 复核:dsh 0.1.2-alpha.4 仍为 0,Session 重构只到 branded types,客户端消费面无变化)。dsh-better-sidebar 的命名空间演化同样不在本仓库可控范围内,升级后需复核。
11. **workflow 开关与设置卡(v0.8.0)**:官方 `cordis`(创造模式)保留 `tool-workflow`,仅 `ptc` 在 alpha.4 禁用——本插件以创造能力为主体,**默认 ON**(= 0.7.0 及之前行为,升级无感),卡片可关(对齐官方 ptc)。机制:① host 半 `ctx.inject(['settings'])` 内**先注册命名空间再物化**(注册需动态 import schemastery/dsh-settings,物化要读到用户已存的值;era 探测用 `settingsNamespace` 存在性双兼容);命名空间 `ptc-cordis`,schema 仅 `workflow: Schema.boolean().default(true)`(**仅显式 false 为 OFF**,`workflowOf`);② 注册返回 `SettingsScope`,`scope.watch(next)` 在开关翻转时**实时重物化**——仅 unmodified(用户改过的树照旧不碰,只打日志),重物化走 `materializeCore`(重新探测 era/gitbash),**新会话即刻生效、已挂载会话保持原组合**(preset 挂载是会话创建时的快照);③ 物化主流程整体住在 settings inject 里——**依赖「settings 服务在 base bundle 必有」**(@deepseek-ai/dsh-settings-file 挂 base;无 settings 的部署物化不会跑,记录在案);④ client 半(手写 ModuleLoader bundle):`settings.plugin.item` 卡(key=`ptc-cordis`),**两段式注册**(slots.inject 洞回调内 return slots.register),scope 经 inject 工厂以普通成员进 props,**factory 必须 return module.exports**(0.10.1 教训),require 白名单仅 react + ui-primitives,词典 zh/en key 对齐(smoke 强制);⑤ package.json 必须同时有 `exports["./client"]`、`dsh.client.inject`(dsh-client-runtime/locale/ui-slots/ui-settings 四包 + platform web)、`files` 含 `src`——缺一 client 半静默不挂。

## 验证清单(改动后)

1. `npm test` 全绿。
2. 真机验证:删除 `~/.dsh/.agent-presets/ptc-cordis` → 启动/重载 DSH → 物化日志出现(含 era 字样)→ 模式选择器出现「PTC 创造模式」→ 新会话能用 `run_code` 且有 `cordis_*` 工具。
3. 若动了组合文本:用 cordis preset 会话跑 `agentPresets.standingKeyFor('ptc-cordis')` 挂载校验(拒绝会点名未激活的 row)。
4. era 相关改动另需双向验证,两个方向均已真机通过:`code` era(<= 0.1.1,2026-08 前)与 `ptc` era(2026-08-29,dsh 0.1.2-alpha.1 真机:marker `base:"ptc"`、`standingKeyFor('ptc-cordis')` 挂载 OK、当时会话即运行于该物化 preset;此前本机为 <= 0.1.1)。仍待覆盖:「旧 marker(无 base)首启刷新一次」路径(可手造无 `base` 的 marker 再启动验证)。
5. workflow 开关(v0.8.0,待真机覆盖):设置 → 插件 → 「PTC 创造模式」卡出现且开关为「提供(默认)」;切到「不提供」→ 宿主日志 `workflow setting flipped → re-materializing (workflow OFF)` → **新建**会话无 `workflow` 工具(`ralph` 仍在)→ 切回 → 新会话工具恢复;整个过程已打开的会话组合不变;`~/.dsh/settings.yaml` 出现 `ptc-cordis:` 段(`workflow: false/true`)。