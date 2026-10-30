# AGENTS.md

面向后续在本仓库继续开发的 Agent / 贡献者。读完再动手。

## 环境与工具

- 本机已安装 GitHub CLI(`gh`)且已认证:建仓、推送、release 等 GitHub 操作**优先用 `gh`**,不要手动调 API。
- 分发**双通道**:GitHub(tag + Release,源码与发布说明)+ npm(公开包 `dsh-ptc-cordis-preset`,用户安装入口);安装命令 `dsh plugin --profile web add dsh-ptc-cordis-preset`;版本管理用 git tag + GitHub Release,Release 的 published 事件自动触发 npm publish —— **Trusted Publishing (OIDC)**。
- 发布后**触发 npmmirror 同步**(机器默认 registry 是 npmmirror,不同步则 dshmarket/pnpm 解析新版本号报 ERR_PNPM_NO_MATCHING_VERSION):
  `curl -X PUT https://registry.npmmirror.com/dsh-ptc-cordis-preset/sync`。
- 注意 pnpm 的 `minimumReleaseAge` 供应链冷却:**刚 publish 的版本要等几分钟**才能被任何
  `dsh plugin add`/profile 依赖解析接受(profile 级操作会重解析整个 lockfile,单个过新版本会拒掉整个操作)。

## 适配分支纪律(2026-10-30 起)

- 每轮适配 dsh 新版本,都从最新 `main` 开分支 `alpha适配`;本轮所有适配改动只提交到该分支,不直接推 `main`。
- 在该分支跑完 `npm test` 与隔离实例真机验证,确认没问题后再合并回 `main`、再发版本。
- 下一轮适配重新从 `main` 开同名 `alpha适配` 分支,不复用上一轮的分支;已合并的旧分支可删。
- 本纪律与各仓库的「变更记录纪律」并列:CHANGELOG 记录改了什么,分支记录这一轮改动的边界。

## 变更记录纪律(2026-09-13 起)

- **所有版本发布、修复、事故复盘、复现/验证记录一律写进本仓库 `CHANGELOG.md`**,不再追加进本文件;
  本文件只保留仍然有效的规则、不变量与当前事实,历史叙事由 CHANGELOG 承载(需引用时写
  「见 CHANGELOG vX.Y.Z」)。
- **发版流程新增强制步骤**:更新 CHANGELOG(写好新版本条目)→ 随版本提交 → 再打 tag /
  发 Release;顺序不能反。
- CHANGELOG 条目格式:倒序排列;`## vX.Y.Z — YYYY-MM-DD` + 类型(feat / fix / docs / chore)+
  要点 bullet + 相关链接(issue / PR / discussion / Release)。

## 项目一句话

`dsh-ptc-cordis-preset`:DSH 插件,以**声明式预设**(dsh >= 0.1.7 的 `ctx.agentPresets.register`)注册 **`ptc-cordis`(PTC 创造模式)**——组合 = 官方 `ptc` 行 + `cordis` 的 persona / tool-cordis / 渐进式 skills;workflow 工具 v0.21.0 起恒不提供(与官方 PTC 模式一致),run_code 后端开关经行 Config + volatile-update 重注册即时/下轮生效。

## 目录地图

| 路径 | 作用 |
|---|---|
| `src/index.js` | host 半(纯 JS 无构建):声明式注册(`runDeclarativeEra` → `registerPreset`)、volatile-update 翻转重注册(先摘旧再挂新 + 失败回滚)、旧物化残留目录的 marker 守卫清理(`cleanupLegacyTree`)、Git Bash 联动 capability(`ptcCordisPreset`)、python 后端探测/快照(`python-probe.js`/`syncRuntimeSnapshot`)、inspect-registry 兼容 shim |
| `src/composition.js` | **声明式组合数据**:`pluginsFor({ gitBashActive, skillsDir, hostExtras, opsPresent, peerPwshTool })` 返回注册用 plugins 行集(恒定创造侧;workflow 两行 v0.21.0 起永久禁用,与官方 ptc patch 同形;`hostExtras` 缺省 ↔ 0.1.7 捕获,`{ timeContext, toolSchedule, pluginMarket }` ↔ 0.2.1 捕获(alpha.5;rc.1 同码),见不变量 13),`PRESET_META` / `presetMetaFor(gitBashActive)` 是名录元数据唯一出口 |
| `src/client.js` | 浏览器半(手写 ModuleLoader bundle):插件详情页设置卡(`plugins.bundle.config` 座位),pythonRuntime 开关 + Git Bash 去重开关(读对方行)(workflow 旋钮 v0.21.0 退役),21 门语言词典 |
| `locale/{en,zh}.json` + `icon.svg` | dsh 0.1.7 插件管理页展示资产 |
| `assets/preset.yml` / `assets/preset.gitbash.yml` | 显示元数据(name/description)。`preset.gitbash.yml` 是 Git Bash 名字的**单一事实来源**(冒烟断言 `presetMetaFor(true).name` 与其 `name:` 一致) |
| `dsh.plugin.json` | 插件注册表清单(id `dsh-external/dsh-ptc-cordis-preset`;`engines.dsh` = `>=0.1.7-rc`,与 package.json peer 对齐) |
| `cordis.patch.yml` | `dsh.bundle.patch` 层:①插件行 insert(id `ptc-cordis`);②实验性 Python 运行时块(v0.15.0,默认关——四个共享 `!!js` 合取锚点,见文件内长注释) |
| `tests/fixtures/official-preset-rows.json` + `official-preset-rows.0.2.1.json` | 官方内置 preset 行序列快照(0.1.7 与 0.2.1 双捕获),`tools/gen-official-preset-fixture.mjs` 生成,smoke 用两份双向锁组合对齐(本机 Windows 生成姿势见 CHANGELOG v0.17.0) |
| `tests/smoke.mjs` | 冒烟测试(52 项;helper 级 + 一个 apply() 真 boot 路径测试) |

## 核心不变量(改代码前必读)

0. **声明式唯一路径(v0.16.0 起)**:宿主下限 `>=0.1.7-rc`(兼容门禁 `plugin-compatibility.ts` 读 peer `@deepseek-ai/dsh`,`semver.satisfies` 以 `includePrerelease: true` 求值;peer 必须标 `peerDependenciesMeta.optional`,否则 autoInstallPeers 会对 prerelease range 报 `ERR_PNPM_NO_MATCHING_VERSION`)。**era/物化/present/rows 探测已全部删除**——`apply()` 直走声明式注册,没有「旧宿主分支」可回退。peer `>=0.1.7-rc` 不设上界。
1. **翻转必须先摘旧再挂新(v0.16.0 教训,冒烟顺序断言锁死)**:宿主 registry 对重复 id 直接抛
   `Duplicate agent preset`(agent-preset-registry 的 `definitions.has` 检查),所以 volatile-update
   翻转 handler 必须 `await previous()` 摘除在册组合**之后**才 `registerPreset` 挂新组合;新挂失败要
   **回滚重注册旧组合**(名录永不丢 preset、旋钮状态不脱节)。v0.15.x 的「先挂后摘」让每次翻转都
   静默失败(真机 0.1.7-rc.2 实证,2026-09-28)。
2. **组合对齐是「本站数据 × 宿主内置 preset」的 diff,行改名是致命项**:每次跟随 dsh 升级,取
   `packages/bundle/web-app/presets/{cordis,ptc}.patch.yml` 的行序列(`insert[0].config.plugins` 的
   `- id:` / `name:` / `disabled:` 与提示词),与 `src/composition.js` 逐行对齐;组合里一行 import
   失败会拒绝**整棵 preset 挂载**(`agent-preset-registry/src/mount.ts`)。对齐由
   `tests/fixtures/official-preset-rows.json` + `tools/gen-official-preset-fixture.mjs` 自动锁住;
   默认值变化(如某行新增 `disabled: true`)同样要跟。`package.json` 的 `optionalDependencies`(
   `@deepseek-ai/dsh-experimental-ptc-runtime-python`,v0.21.1 起 `*`)同属跟随面:官方实验后端
   随每个 dsh prerelease 重发、peer 全家精确 pin 自己时代,任何固定 range 都会在下一次宿主升级必然
   peer 错位——market 兼容性风险实证于 0.2.1-rc.2(2026-10-17);发版后主动 `PUT /sync` npmmirror
   消除镜像滞后窗口。
3. **skills 现场解析,不存快照**:`resolveSkillsDir()` 用 createRequire 解析
   `@deepseek-ai/dsh-agent-preset/package.json` 旁的 `skills` 目录,组合行直接指向它——跟随部署升级,
   仓库里永远没有 skills 副本。
4. **旧物化残留只删 marker 判定 unmodified 的(v0.16.0 保留的升级路径)**:`cleanupLegacyTree()`
   在声明式注册前跑,目标是 `$DSH_HOME/.agent-presets/ptc-cordis`;`.plugin-managed.json`
   (managedBy + 逐文件 sha256)是唯一判据——`unmodified` → 删 + 日志;`user-modified` → 只提示不碰;
   `foreign`(marker 不识别)→ 绝不碰。这是**单向清理**:声明式 era 本插件再也不写任何目录。
5. **无构建**:发布产物就是 `src/index.js` + `src/composition.js` + `src/client.js`。不要引入 TS/打包器;
   改动后 `npm test` 全绿即可。安装不触发任何 lifecycle 脚本(保持零 `allowBuilds` 摩擦)。
6. **`tool-cordis` 裸挂 + inspect-registry shim(v0.4.0/0.6.3,动 shim 前必读)**:碰撞点仅 runner 的
   `cordisInspect.register` 一处(同进程第二个 cordis 模式挂载撞 `already registered`),`installRegisterShim`
   包裹它——原路径优先、仅撞重复 id 时替换条目(同包 manifest 等价,身份守卫 disposer),双 preset 共用
   唯一宿主 runner。维护规则:必须防御式(形状探测/try-catch,异常退回裸挂行为并打日志);必须幂等
   (SHIM_FLAG 防二次包裹);dispose 必须还原原方法;上游原生容忍后自动变 no-op,勿删。**安装时机**
   必须 `ctx.inject(['cordisInspect'], …)`(服务就绪那一刻安装,与行激活顺序无关;一次性 `ctx.get`
   会采到未就绪的服务,静默装了个空 shim)。验证须覆盖「cordis 先挂 + 选 ptc-cordis 成功」方向。
7. **探针 preset 纪律**:挂载校验用的临时 preset 对 UI 模式选择器立即可见,用户可能选到;探针必须在
   **同一轮**内删除,绝不跨轮存活;创建前先在对话里告知用户不要选择它。
8. **pythonRuntime 单旋钮,权威只有一份(v0.21.0 起;workflow 旋钮已退役)**:`pythonRuntime` = 用户意图
   (不变),`pythonBackend` = 当前实际后端(派生,给 peer 读)。开关在本插件行 Config 上;
   **绝不在别处加镜像字段**。翻转经 volatile-update 重注册(见不变量 1);python 开关额外把意图写进
   `dshHomePath('ptc-cordis-runtime.json')` 快照供 boot 期 patch 的 `!!js` 读取,**生效时机 = 重启**
   (patch 在 boot 求值),卡片文案必须写明。workflow 工具 v0.21.0 起恒不提供:`workflow-ptc` /
   `tool-workflow` 两行保留但永久禁用(与官方 ptc patch 同形,对齐 diff 保持逐行可比),**不要再
   为它加任何开关或配置**(旧 workflow 设置值被忽略,不迁移)。
9. **实验性 CPython 后端(v0.15.0,机制只能在 bundle patch 层)**:preset 的行挂进独立 EntryTree,
   preset 内 provider 落 root realm 会被 `mount.ts` 拒;run_code 消费点在宿主 `tools` 行(root realm),
   只能被 patch 的 `disabled` + `insert` 换行(`name` 是匹配断言不能覆盖)。patch 的四个 `!!js` 合取锚点
   必须一致(见 `cordis.patch.yml` 长注释):非 win32 ∧ 快照 ON ∧ `ready` ∧ 冻结解释器存在 ∧ 后端包可解析,
   任一不成立即保持官方 Node 行——**永不出现无 PTC 运行时**。`src/python-probe.js` 是探测唯一出口:
   候选链逐个 `-I -c` 探测,胜者绝对路径写进快照作 provider 的 `pythonBin`;`/usr/bin/python3`(3.9.6)
   这类旧解释器要 fail-loud 且点名,不静默回退。`workflow-ptc`/`tool-workflow` 自 v0.21.0 起在组合里
   恒禁(引擎硬要求 TypeScript 运行时只是当年动因之一,如今与 Python 后端无关、任何后端下都禁)。
10. **Git Bash 联动三件套(v0.14.0 契约,改任一处都要读)**:①**名录元数据必须跟随 `gitBashActive`,
    且名称与 `assets/preset.gitbash.yml` 同名**——`presetMetaFor(gitBashActive)` 是显示字段唯一出口;
    描述保留声明式措辞 + `(Shell 使用 Git Bash)` 标记,与资产那份的差异是**有意保留的既有差异,别去
    「对齐」**。②**`ptcCordisPreset` 是发给 dsh-gitbash-shell 的协作契约**(`{ id, gitBashActive }` 等),
    形状变更必须同步对方仓库;必须在 `apply()` 里**无条件、有界(1s)`gitBash` 探测之后**发出——
    对方按「服务出现」这一事件做去重决策,值发布后再变就漏。③**去重开关只有一份状态,在对方的行上**
    (字段 `suppressPeerCordis`)——本插件卡靠 `ctx.configForms.get('gitbash-shell')` 绑同一行;
    **绝不在本插件 Config 里加镜像字段**。
11. **client 半纪律**:手写 ModuleLoader bundle,require 白名单仅 react + ui-primitives;卡片挂
    `plugins.bundle.config` 座位(两段式注册,slots.inject 洞回调内 return slots.register,factory 必须
    return module.exports);`t` 按 `ctx.locale` 实时解析(按 tag 缓存),外层订阅 locale 变更当场重绘;
    词典 **21 门语言 key 逐门对齐**(一门一条带 `/* locale: <tag> */` 标记,smoke 逐门比对键集);
    package.json 必须同时有 `exports["./client"]`、`dsh.client.inject`、`files` 含 `src`——缺一 client 半
    静默不挂。
12. **未来破坏点跟踪**:官方宣布的会话持久词汇改名(SESSION_FORMAT_VERSION v0→v1 迁移)落地时复核
    组合是否需要第三形态;dsh-better-sidebar 等外部命名空间演化不在本仓库可控范围内,升级后复核。
13. **dsh 0.2.1 增量行探测式接入(v0.17.0,v0.19.0 跟至 alpha.5;0.2.1-rc.1 与 alpha.5 同码)**:官方全工具 preset 新增 `time-context` /
    `tool-schedule` 两行(alpha.1),alpha.3 又**删除**了 subagent 的 `toolFilter.deny`(`schedule_*`——组合
    不再产出任何 toolFilter),alpha.4 在 `tool-plugin-manager` 后追加 `tool-plugin-market` 行(cordis 侧 =
    `!!js !profileContext` 即 profile 宿主启用,ptc 侧 = 禁用;组合以 `pluginMarket` 探针接入,disabled
    跟随创建侧开关,与 manager 行同一分侧)。本插件**不抬宿主下限**,由 `probeHostExtras(ctx)` 从
    **`ctx.baseUrl`**(行挂载的同一解析基准,`prepareProfileEntries`)逐包 `require.resolve` 探测
    (`{ timeContext, toolSchedule, pluginMarket }`),可用才加行;探测每 boot 一次,volatile 重注册
    复用;任何解析异常降级为「不可用」,绝不 reject boot。**不要**把这些行写成无条件——包缺失会拒绝
    整棵挂载(见不变量 2);也**不要**为此抬 `engines.dsh`。官方下一版若再加行,先重跑 fixture 生成器
    再决定是否新增探测位。

## 验证清单(改动后)

1. `npm test` 全绿(53 项,含 apply() 真 boot 路径测试与翻转顺序断言)。
2. 真机(隔离 `DSH_HOME` + web profile + `@deepseek-ai/dsh-web-app` bundle):启动 →
   `[ptc-cordis] preset 'ptc-cordis' registered declaratively (workflow tool permanently off, matching the official ptc preset …)`
   → 模式选择器出现「PTC 创造模式」→ 插件详情页设置卡渲染(pythonRuntime / Git Bash 去重两行)。
3. 翻转验证:设置卡「run_code 后端」切「Python」→ 宿主日志
   `setting flipped — preset re-registered, new sessions pick it up immediately`(**不得出现 `Duplicate agent preset`**)
   → 切回 Node 同样;再验「旧物化残留」:手造带 marker 的 unmodified 树 → 启动被删 + 日志;
   篡改文件成 user-modified → 保留 + 提示。**workflow 无旋钮可翻**:携带旧 `workflow` 配置键的安装应被
   忽略(不迁移、不报错、组合恒禁 workflow)。
4. 升级 dsh 后:按不变量 2 核对官方 patch.yml 行序列/提示词/disabled 默认值,重跑 fixture 生成器。
5. Git Bash 联动改动:隔离实例 + 探针翻转(见 CHANGELOG v0.14.0 的完整方案);卡片面用无头浏览器
   确认 `run_code 后端` 与 `与 dsh-gitbash-shell 去重` 两行渲染。

## 后续项(已记录,未实施)

- **生效态下发到客户端可读面(v0.15.2 记录,Lead 裁决本轮不做)**:`ptcCordisPreset` 上的
  `pythonBackend: 'python' | 'node'`(生效态)与 `pythonIssue`(只读原因)只有**宿主**侧能读;而
  dsh-gitbash-shell 的卡片走 settings 表单(行 Config 快照),**client 半读不到宿主服务** ⇒ 对端的
  「已开启 · 后端不可用,当前仍为 Node」降级分支没有数据源。可选落地(contract-rc2 方案 X):把这两个
  派生字段加进本插件 Config schema(`volatile`,不持久化用户输入),让表单快照对 client 可见,对端纯加法
  读取、不改 `pythonRuntime` 的意图语义。**前置未验证项**:dsh 的 volatile 是否支持 host 侧**运行时写入**;
  若不可用,则需让 client 改读远程服务(结构性改动,风险更高)。另需考虑用户误写该字段时如何忽略。
- **显式 `pythonBin` 的 UI 呈现**:字段已在行 Config schema 里,但卡片目前只渲染 pythonRuntime /
  Git Bash 去重两行;`pythonBin` 的输入框与「探测到的解释器 + 版本」只读展示尚未做(用户仍可通过行 Config 手填)。
