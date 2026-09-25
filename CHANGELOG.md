# Changelog — dsh-ptc-cordis-preset

> 倒序排列,新版本条目在最上面。条目格式:`## vX.Y.Z — YYYY-MM-DD` + 类型(feat / fix / docs / chore)+ 要点 + 相关链接。
> 纪律见 AGENTS.md「变更记录纪律」:发版前先更新本文件并随版本提交;事故复盘、复现与真机验证记录也记在这里。

## v0.15.0 — 2026-09-25

**类型**:feat(rc.2 增量适配 + run_code 后端开关:官方 Node/TypeScript ⇄ 实验性 CPython)

- **rc.2 增量结论:官方预设零漂移**。`git diff dsh-v0.1.7-rc.1 dsh-v0.1.7-rc.2 -- packages/bundle/web-app/presets/` **为空**;`packages/preset/**` 唯一的语义变化是 `agent-preset-registry` 删除 `modeSelectionEnabled`(`src/index.ts` 的 Config 字段与 `policy()`、`src/preset.ts`、`src/types.ts` 的 roster 字段,`defaultId` 改为直接取 `selectedDefault ?? default`)——本仓库对 `modeSelectionEnabled` **零引用**,`register`/`definition`/`isolate` 语义未变,`src/composition.js` 无需改动,既有 62 项断言全绿。
- **新开关「run_code 后端」,默认关**。权威状态 = 本插件行 Config(行 id 与设置命名空间同串 `ptc-cordis`)的 `pythonRuntime`(boolean,默认 `false`);旧宿主 = settings 命名空间同名字段(双形状解析,照 v0.13.2 的 `workflowOf` 教训)。开启后 run_code 换成 dsh 实验性 CPython 后端 `@deepseek-ai/dsh-experimental-ptc-runtime-python`(作为本插件 `optionalDependencies` 的**精确** `0.1.7-rc.2`,用户不需要二次安装;`@next` 在本机镜像会解析到 rc.1 并被兼容闸拒)。
- **机制定案:只能走 bundle patch,不能走组合(含证据)**。preset 的行挂进**独立** EntryTree(`vendor/loader/src/config/tree.ts:13` 每棵树自己的 `store`),preset 内 provider 落 root realm 会被直接拒绝(`packages/preset/agent-preset-registry/src/mount.ts:267` "Preset services require isolate realms");而 run_code 的消费点是**宿主树** `tools` 行(`packages/core/tools/src/index.ts:956,1046` 的 `this.ctx.get('ptcRuntime')`)。实测 isolate realm 内提供 python 能与 root 的 node 共存、无注册冲突,但 **root 永远看不到 realm 私有槽位**,所以 isolate 路线对 run_code 无效。patch 的 `name` 是**匹配断言不是覆盖**(`vendor/include/src/index.ts:113-117` 不符即 warn+skip),因此只能 `disabled` + `insert`——正是官方 `snapshots/session/ptc-python-turn/cordis.yml:25-36` 的形态。
- **`!!js` 合取门控(「永不出现无 PTC 运行时」)**:`非 win32 ∧ 快照 ON ∧ 预检 ready ∧ 冻结解释器仍存在 ∧ 后端包仍可从 profile 解析`,任一项不成立即保持官方 Node 行。表达式用 YAML 锚点在四处共享(锚点 divergence 就是这条注释要防的 bug),由 `vendor/loader/src/config/entry.ts:89-92` 求值;`dshHomePath`、`process.getBuiltinModule`(dsh engines `^22.19 || >=24` 保证存在)、`ctx.get('profileContext').dir` 都在求值作用域内。
- **解释器发现(本机必然踩的坑)**:`/usr/bin/python3` 是 macOS 自带 **3.9.6**,而实验后端要求 **CPython ≥ 3.10**,桌面 GUI 的 PATH 只有它(无 homebrew、无 harness 运行时)。候选顺序:**显式 `pythonBin` → `DSH_PYTHON`/`DSH_PTC_PYTHON_BIN` → dsh 运行时自带解释器 → `/opt/homebrew/bin/python3`、`/usr/local/bin/python3` → 版本化名 `python3.14…3.10`/`python3` → `/usr/bin/python3`(仅用于诊断)**;每个候选真跑一次 `-I -c` 探测 CPython 与版本,胜者的**绝对路径冻结进快照**并作为 provider 的 `pythonBin` 传入(不依赖 provider 自己的 `'python3'` 默认值)。新模块 `src/python-probe.js` 承载发现与包解析,host 半与 runtime 行共用同一份答案。
- **fail-loud 与兜底**:host 半在**允许置 true 之前**预检(平台/包可解析/解释器 ≥3.10),不通过就不写快照 + 醒目日志 + 可执行指引(装 python3.10+ 或填解释器路径、重装被裁剪的插件);`src/runtime.js` 是 boot 期被 patch 启用的 provider 行,若运行环境已变(包被裁剪/解释器消失)它会**回退挂载官方 Node provider** 并 fail-loud,绝不留下无运行时的 profile。
- **workflow 互斥**:`workflow-ptc` 构造器硬要求 `ctx.ptcRuntime.language === 'typescript'`(`packages/workflow/workflow-ptc/src/index.ts:117`),官方 Python 组合同样把 `workflow-ptc`/`tool-workflow` 一起禁用。开启 python 时 patch 与组合**都**禁用这两行(否则 preset 场景会因 `mount.ts:257` 的 `audit.failed` 让**整棵 preset 挂载被拒**);用户 workflow 设置值保留、关掉 python 后恢复;`tool-plugin-manager` 仍随用户 workflow 设置,不跟 python。
- **与 dsh-gitbash-shell 联动**:能力服务 `ptcCordisPreset` 形状扩展为 `{ id, gitBashActive, pythonRuntime }`(同一**可变对象**:翻转后对方按同引用读到新值,不存在第二份状态);对方卡片经 `configForms.get('ptc-cordis')` 读写同一字段并 `subscribe`,两侧即时同步、只在一个设置里改就够,对方**不 insert 任何运行行**。
- **已知事实(写进文档,不藏)**:① 关态 profile patch 层多两行(一条 `disabled` 覆盖 + 一条 disabled 的 insert;patch 方言不支持条件 insert,`name` 又不能覆盖)——关态**运行链路与官方完全一致**(Node 行原样加载,我们那行不 import),组合文本仍逐字节一致;② 生效时机 = **重启/重载 dsh**(patch 在 boot 求值),卡片 `python.hint` 与 README 均写明;③ win32 三重门控(host 预检拒绝 + 表达式平台判断 + 卡片文案注明 POSIX-only)。
- **真机验证(隔离 DSH_HOME + 打包版 Electron 作 node 宿主,开/关两态)**:自带 node 是 hardened runtime + 特定 Team ID,与该 adhoc 签名原生 addon 的 `dlopen` 冲突(`dsh web` 报 `fatal: No usable native binding found for node-addon-require-builtin-darwin-arm64`,与插件无关);改用 `ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" /opt/homebrew/bin/dsh --profile <隔离> --port <n> --no-open` 后**真实 web 启动跑通**(打印 `http://127.0.0.1:<n>/?token=…`),并加一个 `inject: ['ptcRuntime']` 探针行读真实 provider:**关态**(无快照)= `ptcRuntime.language=typescript isolation=process ctor=NodePtcRuntime`(官方 Node provider 原样)+ `preset 'ptc-cordis' registered declaratively (workflow ON)`;**开态**(快照 `{pythonRuntime:true,ready:true,pythonBin:/opt/homebrew/bin/python3}`)= 宿主日志 `experimental Python PTC runtime active (@deepseek-ai/dsh-experimental-ptc-runtime-python via loader resolver, /opt/homebrew/bin/python3) — run_code presents Python` 且探针 `ptcRuntime.language=python isolation=process ctor=PythonPtcRuntime`——**provider 真被替换且在 root realm 对 `tools` 行可见**。run_code 的语言 / SDK 提示词 / 工具呈现正是由这一个 `language` 驱动(`packages/core/tools/src/index.ts:40,1046`),故 python 侧呈现随之切换;**与官方 `snapshots/session/ptc-python-turn/` 的完整 prompt 逐字节对照未做**(需要带凭据的真实会话,隔离实例无 API key)。
- **附带证据(机制层)**:① 真实 dsh CLI `dsh --profile web --patch <本插件 cordis.patch.yml> --dump-config` 证明 patch **全部命中**(`ptc-runtime`/`workflow-ptc`/`tool-workflow` 三行被覆盖、锚点展开为完整表达式、insert 出 `ptc-cordis-runtime` 行)且**零 warn**;② 用与 loader 完全相同的求值器(`new Function('ctx','expr','with(ctx){return eval(expr)}')`)对合取逐项验证:无快照/开关关/`ready=false`/解释器被删/包不可解析/win32 等情形**都保持 Node 行**,满合取时才切 python,OFF 表达式是 ON 的严格取反;③ 冒烟 74/74。
- **冒烟 74/74**(新增 12 条:双形状解析/候选顺序契约/CPython 门禁/发现回退与尝试记录/快照往返与缺失即关/拒绝不可用后端/预检收集全部阻断点(含 win32)/组合 workflow 互斥/`pythonRuntime=false` 与旧调用逐字节相同/patch 合取与锚点/runtime 行纪律(无静态 peer import、有 Node 兜底)/依赖精确版本)。

## v0.14.0 — 2026-09-24

**类型**:feat(联动收尾:issue #1 — 名录显示名跟随 Git Bash + 发布协作能力 + 设置卡共享去重开关)

- **修复:声明式名录的显示名/描述不跟随 Git Bash 侧(回归)**。**根因**:v0.13.0 的声明式重写把显示元数据硬编码进 `src/composition.js` 的 `PRESET_META`,而物化路径仍在写、且一直写着 Git Bash 名字的 `assets/preset.gitbash.yml` 不再被声明式路径读取——于是**只有新宿主(dsh ≥ 0.1.7)丢后缀**,旧宿主(≤0.1.6,继续读资产)照旧显示 `PTC 创造模式 · Git Bash`,同一个版本在两个宿主上给出两个名字。修法:`PRESET_META.gitBash = { name, description }` + `presetMetaFor(gitBashActive)`,`registerPreset()` 只经它取显示字段。**取舍**:名称以 `assets/preset.gitbash.yml` 为**单一事实来源**(冒烟断言声明式 `name` == 该资产的 `name:`,两份文本从此不许漂移);描述保留声明式时代的措辞、只追加 `(Shell 使用 Git Bash)` 标记——资产那份是物化 era 的长句,与 v0.13.0 起声明式名录自己的副本措辞不同,这是**既有的、有意保留的差异**,强绑描述只会让旧宿主被迫换文案。
- **发布协作能力 `ptcCordisPreset` 给 dsh-gitbash-shell(对方 issue #7,同一件事的另一面)**:`ctx.provide('ptcCordisPreset', { id: 'ptc-cordis', gitBashActive })`(常量 `COVERAGE_CAPABILITY`),在 `apply()` 里**两个时代都发、且早于时代分流**(与行激活顺序无关);**先做有界(1s)的 `gitBash` 能力探测、再 provide**——对方靠「服务出现」这一事件反应,值发布后再变就漏,所以发出去的就是终值(fire-and-forget,disposer 经 `ctx.effect` 挂插件 fiber)。用途:对方据此判断「这个 preset 已经在 Git Bash 上覆盖了创造模式」,从而在用户打开去重开关时不再注册它自己的 `创造模式 · Git Bash`。**注意**:没有对方的宿主上这个服务也照发(`gitBashActive: false`),让「服务缺席」永远只意味着本插件没挂载。
- **设置卡新增共享去重开关(客户端)**:`src/client.js` 的 PTC 卡第二行「与 dsh-gitbash-shell 去重」**不存自己的值**,而是经 `ctx.configForms.get('gitbash-shell')` 绑定**对方那一行**(DSH 官方支持编辑另一个插件所拥有的命名空间),读写字段 `suppressPeerCordis` 并 `subscribe` 对方的变更——两侧是**同一份状态**,任一侧改动另一侧立即同步,不存在两份会互相打架的拷贝。对方的行不存在(未安装)、旧宿主没有 `configForms`、或镜像尚未就绪时这一行**不渲染**(卡片退回 v0.13.x 的单行行为)。新增 4 个词典键 `peer.label` / `peer.on` / `peer.off` / `peer.hint`,**21 门语言全部补齐**(zh/en 之外的 19 门逐门带 `/* locale: <tag> */` 标记,冒烟逐语言比对键集——缺键只会静默回退英文,卡片就成了半翻译状态)。
- **边界(README 同步写明,避免把能力当成无条件生效)**:去重开关的**权威值**是 dsh-gitbash-shell 行 Config 上的 `suppressPeerCordis`(默认 `false`,即保持现状);真正去重需要对方 **≥0.25.0**(开关本体)与本插件 **≥0.14.0**(协作能力)同时满足;并且**只有新宿主(dsh ≥0.1.7)上两侧都能改**——旧宿主(≤0.1.6)没有 `configForms`,本插件卡里不会出现这一行,只能在对方自己的设置面改,且按对方的启动时语义生效。
- **验证证据(隔离真实实例端到端)**:本机 macOS 起**隔离的真实 dsh 0.1.7-rc.1 实例**(隔离 `DSH_HOME` + 新建 web profile + 两份插件 `link:` 安装 + 探针插件定时打印 roster 并中途写设置):默认名录含 `cordis-gitbash|创造模式 · Git Bash` 与 `ptc-cordis|PTC 创造模式 · Git Bash`(**名称后缀生效**);把开关写 `true` 后对方日志 `preset 'cordis-gitbash' retired …`、名录只剩 `ptc-cordis|PTC 创造模式 · Git Bash`;写回 `false` 后 `cordis-gitbash` 恢复注册。**唯一人为点**:探针副本把 `gitBash` 能力的 `active` 强制为 `true`(在 macOS 上模拟 Windows),其余全是真代码。
- **验证证据(卡片面)**:无头浏览器确认本插件设置卡渲染两行——`workflow 工具: 提供（默认） 不提供` 与 `与 dsh-gitbash-shell 去重: 去重 保留两个（默认）`(后者读的是对方那一行,写回去的也是对方那一行)。
- **验证证据(冒烟)**:`npm test` **62/62**(新增 2 条:声明式元数据跟随 Git Bash 且与 `assets/preset.gitbash.yml` 同名;协作能力的发布形状 + 两个时代都发)。
- **相关链接**:[KannaKuron/dsh-ptc-cordis-preset#1](https://github.com/KannaKuron/dsh-ptc-cordis-preset/issues/1) · [KannaKuron/dsh-gitbash-shell#7](https://github.com/KannaKuron/dsh-gitbash-shell/issues/7)。

## v0.13.2 — 2026-09-23

**类型**:fix(dsh 0.1.7-rc.1 适配:行 Config 的 workflow OFF 此前被静默忽略)+ 对齐复核

- **修复:`workflowOf` 只认设置命名空间的对象形状,不认行 Config 的布尔值**。dsh 0.1.7 起 workflow 开关的真身在**行 Config**(`Config = Schema.object({ workflow })`,值落在行 id `ptc-cordis` 下),声明式路径传进来的是 `valueOf(config.workflow)` 解包后的**裸布尔**;而 `workflowOf` 只写了 `value?.workflow === false` 这一种形状,于是 `workflowOf(false) → DEFAULT_WORKFLOW(true)`:用户在设置卡关掉 workflow 后,重启/重载得到的仍是 **ON** 组合(引擎行与 `tool-workflow` 都启用),只有旧宿主的设置命名空间路径才真的关得掉。现两种形状都认(布尔优先,仍只认显式 false),并补 5 条断言锁住(**依据**:真机 rc.1 + 行 Config 覆盖 `workflow: false`,`[ptc-cordis] preset 'ptc-cordis' registered declaratively (workflow ON …)` 与查看器里 `tool-workflow` 未 disabled;修复后同一命令打印 `workflow OFF — matches the official ptc preset`,查看器里 `workflow-ptc` / `tool-workflow` / `tool-plugin-manager` 三行均为 `disabled: true`)。
- **`_internal` 补出 `valueOf`**(测试面漏项):此前 `_internal.valueOf` 落到 `Object.prototype.valueOf`,测试无法锁定该解包函数。
- **声明 `@deepseek-ai/dsh` peer(取值 `>=0.1.0`,标 optional)**。rc.1 新增的兼容性门禁只读 `peerDependencies` 里 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 的 range(`packages/boot/app-boot/src/plugin-compatibility.ts:70-77`,prerelease 参与匹配),此前本插件一条都没有 ⇒ **永不被校验**;现按家族统一口径声明,让本插件真正落在门禁的可见范围内。取值规则:**下界 = `engines.dsh`(本构建服务的整条 0.1 线),不设上界**——本插件对宿主的依赖本来就是双 era 探测 + 降级(`agentPresets.register` 缺失走物化、`settings` 缺失不做设置面、`volatile` 缺失退回普通字段),加上界只会在下一次 dsh 升级时把整行 disabled,而那时还没有任何真实破坏被观察到;真出现破坏时在适配版里连代码一起收紧。**标 `optional: true` 是安装期硬要求**:门禁不读 meta,但包管理器(autoInstallPeers 默认开启)会去 registry 解析 range,而 `@deepseek-ai/dsh` 已发布的 26 个版本**全是 prerelease**、普通 range 按 semver 排除 prerelease ⇒ 不标 optional 会让安装整体失败(`ERR_PNPM_NO_MATCHING_VERSION`;冒烟新增断言锁死这两点)。旧宿主不受影响:0.1.0–0.1.6 没有该机制,且 profile 侧 `autoInstallPeers: false`。
- **host 半的 schemastery 改惰性导入(静默全失效加固)**:`@deepseek-ai/schemastery` 是 peer,普通 Node 从本包位置解析不到它,只靠宿主解析供上来。顶层静态 `import` 一旦解析失败,dsh Loader 把插件行的导入失败当**非致命跳过**(`vendor/loader/src/config/entry.ts` `_init()`:`logger.error` + `return`,永不建 fiber)⇒ host 半不存在 ⇒ **预设永远不会注册、client 半不进启动图,而宿主日志全绿**(与 dsh-better-workspace issue #9 同一失败类;已用"除静态 peer import 外完全相同"的夹具插件实证:静态版 `apply()` 从不执行,惰性版照常执行、只是 `mod=null`)。现改 `await import(...)` + try/catch,拿不到时 `Config` 导出 `undefined`(cordis 对 `!runtime.Config` 直接放行配置),预设注册与卡片不受影响。冒烟断言锁死"不得出现静态导入行"。
- **官方资产逐字节对齐复核(rc.1 重跑,结论:零漂移)**:以 rc.1 检出为基准重跑「官方 patch → loader 方言解析 → `!!js` 求值 → 与 `pluginsFor()` 逐单元格对比」,`packages/bundle/web-app/presets/*.yml` 自 `dsh-v0.1.7-alpha.1` 起 `git diff` **零改动**;Creation 侧 33 行(含组内嵌套)的 id / name / disabled / group / isolate / config 与官方 `cordis` 预设逐格一致(唯一增量是并集定义行 `tool-presentation`),ptc 镜像侧 30 行共有行逐格一致,`workflow-ptc` / `tool-workflow` / `tool-plugin-manager` 的 ON/OFF 分裂与官方两侧形状一致,**复核期间未发现需要改动的组合文本**(v0.13.1 的文本结论在 rc.1 上依然成立)。
- **对齐锁进测试(防回归)**:新增 `tests/fixtures/official-preset-rows.json`(官方 `cordis` / `ptc` 预设行的捕获:loader 方言解析 + `!!js` 按 profile 宿主求值后的结果)+ 3 条冒烟断言(cordis 侧逐格、ptc 侧共有行逐格、夹具自证),此后组合文本漂移在 `npm test` 里直接变红,不再依赖「人肉 diff」;夹具由新增的 `tools/gen-official-preset-fixture.mjs` 对着任意 dsh 检出重建(`DSH_CHECKOUT` / `DESKTOP_BUILD` 可覆盖路径),同样输入可复现已验字节一致——该脚本仅维护者使用,不进发布产物(`files` 未含 `tools/`)。夹具同时记录 `evaluatedFor.platform` 与 `conditionalDisabled`(哪些行的 `disabled` 来自读 `process.platform` 的 `!!js`):在**非捕获平台**上跑测试时,这些行的 `disabled` 单元格从两侧一并退出比较(已用"把夹具标记成 win32 捕获"的模拟实测:60/60 仍绿),不会出现"在 Windows 上跑冒烟必红"的假故障。
- **rc.1 兼容性预检实测(结论:本插件不被 disabled)**:用 rc.1 自己的 `prepareProfileEntries`(app-boot)跑本插件的 21 行组合 —— 输出 21 行、**新增 0 个 disabled**(唯一 disabled 是平台自带的 `tool-pwsh`,与官方预设同形);不兼容行的行为是**单行 disabled 后继续挂载**(用 `peerDependencies: {"@deepseek-ai/dsh":"999.0.0"}` 的假包实测:`pinned` 行被 disabled + stderr 报告,`loose` 行不动),而宿主没有 `profileContext` 时该函数原样返回行(即 rc.1 之前 preset mount 会撞 import 失败 → 整棵挂载失败)。⇒ rc.1 对「组合里引用了不可解析/不兼容的包」比之前**更宽容**:单行 disabled,而不是整 mount 失败;本插件不需要为此改动。
- **`readDocument`(rc.1 新增只读组合查看器)实测**:rc.1 的 `@Remote('read') readDocument(id)` 用 `dump(plugins, { schema: entryListSchema })` 渲染;本插件的行是**已求值的普通 JS 数据**(平台条件在注册时就算完了,不含 `!!js`、不含函数/循环引用),真机打开查看器:144 行 / 6019 字符、无异常、控制台 0 error、文本里**无 `!!js` 标签**,`dump → load` 往返无损。
- **cordis 扩展面 rc.1 复核(tool-cordis / ui-cordis / cordis-client-runner / cordis-host-runner)**:`cordisInspect.register` 形状与语义**未变**(`packages/extensions/cordis-host-runner/src/inspect-registry.ts`:仍是 `Map<string, {manifest, query}>`、仍按 id 抛 `Host Cordis inspect provider "X" is already registered`、仍返回身份守卫 disposer);**rc.1 未原生容忍重复注册**,shim 保持现状(`cordis-host-runner/src` 在 alpha.1→rc.1 之间零 diff,`tool-cordis/src/api-catalog.ts` 的改动只是 API 目录文档字符串:新增 `readDocument`、新增 `pluginRegistryProbe` 等)。真机双模式共存方向复验通过(见下)。
- **`@deepseek-ai/dsh` peer:从"不加"改为"加"**(本轮先论证不加、后按家族统一口径与用户决策改为声明 `>=0.1.0` + optional,见上)。原先"不加"的理由是:①rc.1 的强制检查只读这类 peer,本插件一条都没有 ⇒ 永远满足,加与不加都不改变启用状态;②本插件对宿主本来就是双 era 探测 + 降级,声明 range 只带来"未来上界把整行 disabled"的新失败模式(`dsh-any-background@0.3.0` 被 rc.1 拦下即范例);③官方包的 peer 用 `workspace:*`,外部无法等价表达。**改为声明**的决定性理由:插件不该在兼容系统里"隐形"——不声明时,将来真出现"必须某版本以下才安全"的破坏,用户得不到任何保护,而声明一个只有下界的 range 在当下零代价(恒满足)、并且把本插件纳入门禁的可见范围。已记录的**未决风险**:host 半在 apply 时动态 `import('@deepseek-ai/dsh-settings')`,若宿主将来停发该包,声明式路径会整体回退(有 try/catch 与日志,不会崩)。
- 真机(隔离 `DSH_HOME` + 端口 3115,插件以 `npm pack` 产物安装):启动无插件加载错误;`--dump-config` 里 `- id: ptc-cordis / name: dsh-ptc-cordis-preset` 命中且未被 disabled;`agentPresets.list()`(设置页名录)显示「PTC 创造模式 / 自定义 / ptc-cordis」;**双模式共存**:先用宿主行预注册全部 inspect provider(等价于「先挂内置创造模式」)再挂 ptc-cordis,启动日志只剩探针行自己的 "already registered",本插件行照常注册、新会话在 ptc-cordis 下正常初始化(轨迹里出现 `cordis-plugin-development` 技能,证明 `customSkillDirs` 生效),**0 条来自 preset 挂载的冲突**。
- 未覆盖:模型工具面(`run_code` / `cordis_*` 的实际工具调用)未验证——隔离实例没有 API 凭据,`llm-deepseek` 在本轮运行前即报 `MISSING_CREDENTIAL`(会话与预设挂载本身已由「chip 显示 PTC 创造模式 + 技能目录生效 + 无 agent-preset 错误」三项证据覆盖)。

## v0.13.1 — 2026-09-22

**类型**:fix(声明式组合文本与官方逐字节对齐)

- **plan-mode 段落措辞修正**:原转写漏字(官方为「including an answer confirming **something** you asked」),且缺官方块标量的尾换行;现由官方 0.1.7 `standard/ptc/cordis` 三份预设解析值程序化回填,逐字节一致。
- **skill-filesystem 行的 config 键按官方形态省略**:skills 目录不可解析时不再写 `customSkillDirs: []`(官方该行无 config;空数组等于宣称一个什么都没解析到的根列表)。
- 复核手段沉淀:「官方 patch → 结构化解析 → 与 `pluginsFor()` 输出逐单元格对比」的校验脚本,persona/section/工具行 config 全覆盖(此前只比 id/name/disabled 三行序列,是本次漏字的根因)。
- smoke 56 项全绿(更新 skill-filesystem 断言到官方形态)。

## v0.13.0 — 2026-09-22

**类型**:feat(适配 dsh v0.1.7-alpha.1 声明式预设,保持旧版本完全兼容)

- **声明式注册路径(dsh >= 0.1.7)**:dsh 0.1.7 删除了目录预设机制(没有代码再读 `~/.dsh/.agent-presets/`)。探测到 `agentPresets.register()` 的宿主上,本插件改为直接注册定义(`src/composition.js` 的已提交行数据 = 官方 0.1.7 cordis 预设 + PTC 增量):
  - 新增 `src/composition.js`:`pluginsFor({ workflowOn, gitBashActive, skillsDir })`;persona 采用官方 0.1.7 极简版(创造模式指引已上移进渐进式 skills);skills 直接指向 `@deepseek-ai/dsh-agent-preset` 包旁的 skills 目录(现场解析,不再拷贝);工具行与官方行序对齐(workflow-ptc / present / plugin-manager / subagent-control 均在)。
  - workflow 开关翻转经 `loader/volatile-update` **重注册**(unregister→register),新会话即刻生效。
  - 启动时清理旧宿主时代物化的目录树(**仅 marker 判定 unmodified 的**;用户改过的/外来的一律不碰只提示)。
- **设置面双时代**(dsh-agent-lang v0.6.0 同款):host 半静态导出 `Config`(workflow 字段,volatile 探测);client 半可选注入 settingsScope(旧)/configForms(新),设置卡双座位策略不变。
- **行 id 更名**:`ptc-cordis-preset` → `ptc-cordis`(与设置命名空间同串:0.1.7 的 Config 表单键与旧 settings.yaml 一次性导入都按行 id 落位)。
- **插件管理页展示资产**:icon.svg + locale/{en,zh}.json(旧宿主忽略)。
- 仓库新增 devDependencies(schemastery),冒烟测试前需 `npm install`;56 项全绿(新增组合数据/Config/双时代获取/包元数据/行 id 断言)。
- 已知边界:升级顺序上先升 dsh 后未升插件的窗口期内,预设会从模式选择器消失(目录不再被读取);升级本插件后恢复(声明式注册不依赖目录)。

## v0.12.2 — 2026-09-19

**类型**:fix(bundle 页卡片壳)

- 修复:v0.19.0/v0.5.3/v0.12.1/v0.6.1 把磨砂与卡片样式挂在旧座位的折叠卡类上,而插件面板的 bundle 页(page 形态)此前渲染的是**无壳裸 div**——磨砂/边框/背景在面板里根本没出现。page 形态现在渲染完整卡片壳(边框 + 背景 token + any-background 磨砂链 + 标题/描述头部 + 默认光标),与 dsh-better-workspace 的 bundle 页同构。
## v0.12.1 — 2026-09-19

**类型**:feat(设置页 bundle 形态 + 磨砂)

- 设置卡新增 page 形态分支(plugins.bundle.config 座位的 view="page" 平铺渲染,无折叠壳)——与 dsh-better-workspace / dsh-gitbash-shell v0.19.0 同款;旧座位折叠卡保持。
- 卡片表面加 dsh-any-background 磨砂适配链(backdrop-filter: var(--dsh-any-blur-card-panels, blur(12px) saturate(1.15)),-webkit- 同步)。
- 词典零新增(page 形态复用现有键),冒烟 52/52。
## v0.12.0 — 2026-09-17

**类型**:feat(dsh 0.1.6-alpha.2 适配;与 v0.11.0 的 21 语言体系变基合并)

- **tool-plugin-manager 行注入**:官方 ptc/standard/cordis 在 0.1.6-alpha.2 新增该行(创造模式持久化插件管理;官方 ptc 为 disabled)。包该版才存在、import 失败拒绝整棵挂载,故按 present 同款模式:**宿主探测通过才注入**、纯字符串手术(锚定 present 行后,无锚则尾部)、幂等、绝不写死进资产。**两个 workflow 侧镜像各自官方底稿**:workflow-ON 物化为启用(创造侧能力),workflow-OFF 精确镜像官方 ptc 的 disabled 形态。仅 .ptc. 文件,code-era 冻结。marker 新增 pluginManager 维度,宿主升级翻转自动重物化。
- **4 份 .ps 资产 persona 同步 alpha.2 官方 cordis**:新增 plugin_manager 用法 / 创造模式视觉请求指引 / cordis-plugin-development 技能 / MCP 接入 / 安装审批五段;「the roster reports...」句换为「Load editing-cordis-compositions for file discovery」。text-era 非 ps 文件不动(旧宿主自洽)。
- **设置卡双座位**:旧 settings.plugin.item(key=命名空间)+ 新 plugins.bundle.config(key=包名 dsh-ptc-cordis-preset);两个 slots.inject 各等各的槽声明,任何宿主版本恰好一个生效;**两个座位都经 LocaleLive 包装**(v0.11.0 的 21 语言对新座位同样生效),inject 工厂提升为共享 injected(返回 scope + 活 t)。
- **npm description 双语化**(「中文 · English」,与 agent-lang/gitbash 同批)。
- **智能体团队兼容性核实(无代码)**:团队为 host 组合层 profile patch(工具 insert + 按行 id 禁用 preset 的 subagent 系),物化 preset 行 id 与官方镜像一致,禁用补丁精确命中;真机验证:PTC 创造模式 · Git Bash 的 Team Lead 会话团队工具全量在位、subagent 工具被正确禁用。
- 冒烟测试 48 → 52 项:注入两形态/锚定/幂等/尾部兜底、资产不写死包名、ps/text 孪生分野、syncDecision pluginManager 翻转、客户端双座位。

## v0.11.0 — 2026-09-15

**类型**:feat

- **设置卡支持 21 种界面语言**:zh/en 之外新增 19 门第三语言词典——ar de fr hi id it ja ko nl pl pt ru sv th tr vi,以及 zh-HK / zh-MO / zh-TW;一门一条躺在 `src/client.js` 的 `LOCALES` 表里,条目前面是一行 `/* locale: <tag> */` 标记(守护测试据此切片,不解析文件)。
- **词典经 `ctx.locale.register` 交给 DSH 的 locale 服务**:一条注册带上全部 21 本(`{ zh, en, ...LOCALES }`),宿主侧读者看到的就是卡片读的那一份;界面语言跟随 DSH 的 `ctx.locale`,解析顺序「精确 tag → 主语言子标签 → 英文」,`zh-Hant-*` 归港式繁体,英文始终键完整(未覆盖的语言回退英文,绝不露出键名)。
- **切换语言即时生效**:`t` 不再是注册时定死的词典,而是 `translatorOf(ctx)` 每次查表按当前 locale 实时解析(按 tag 缓存,一次切换只多一次字符串比较);卡片外层新增 `LocaleLive` 订阅 `ctx.locale.subscribe`,切换语言当场重绘,不必刷新页面。
- **新增守护测试「每本词典的键集与中文完全相等」**:缺键只会在查表时静默回退英文,卡片于是半翻译而不报错——这正是这条测试要挡住的(冒烟 47 → 48 项)。
- **译文为机器辅助翻译,欢迎在 issue / PR 里修正**——每门语言只占 `LOCALES` 表里的一处,互不影响:补一门 / 改一门都不碰其他语言。
- 文档修复:`README.md` / `README_EN.md` 各新增「界面语言」/「Languages」一节(词典清单、解析顺序与回退语义、纠错渠道),并把源码构建一节里过时的「11 项冒烟测试」更正为实际的 48 项;两份 README 补上文件末尾缺失的换行。AGENTS.md 不变量 11 同步记录 21 门词典的纪律(一门一条带标记、加语言只动 `LOCALES` 表)。

## v0.10.0 — 2026-09-15

**类型**:feat + fix

- **适配 dsh 0.1.6-alpha.1:物化时按宿主拼法对齐工作流引擎行(致命项修复)**。新版把内置预设的引擎行从 `workflow-worker-thread` 改名为 `workflow-ptc`,并**删除**了旧包。组合里一行 import 失败会拒绝**整棵 preset 挂载**(agent-presets `mount.ts`),所以本插件的 ptc-era 资产在 0.1.6 上会直接不可用。修复不是再加一套 era 资产,而是**从宿主内置 `ptc` preset 现场抄**:`rowFormsOf` 读出引擎行的 id / 包名 / `disabled`,`alignEngineRow` 在物化时把资产里的那一行改写成宿主的形态。纯字符串手术(绝不 YAML parse→dump,`!!js` 照旧安全)、幂等、**探测失败即 no-op**(旧宿主保持逐字节原样)。
- **workflow ON/OFF 两种孪生分别对齐**:ON 版 `engineEnabled: true`(引擎必须真跑起来,否则 `tool-workflow` 无引擎可用);OFF 版照抄宿主,镜像官方 `ptc` 的 disabled 引擎。
- **同步 `tool-ralph` 的新默认**:0.1.6 起内置预设都给它加了 `disabled: true`(工具描述把 ralph 限制为「人类显式要求」)。不让物化出的 preset 替部署偷偷打开一个已被关掉的工具。
- **marker 新增 `rows` 维度**:宿主形态翻转时 `syncDecision` 自动重物化(与 `base` / `persona` / `present` / `workflow` 同一套模式),升级顺序无关。
- **AGENTS.md 新增第 12 条「适配新版 dsh 的核对纪律」**:每次跟随升级必须对内置 `ptc` 做结构化行序列(`- id:` / `name:` / `disabled:`)与提示词的完整 diff,而不是只看本站资产的自身 diff。
- 冒烟测试 43 → 47 项:行形态读取/对齐/幂等/反向降级、workflow 双侧物化端到端与 marker 记录、`syncDecision` 翻转、资产不得写死新包名。

## v0.9.2 — 2026-09-10

**类型**:fix

- present 行探测不再单靠包解析——shipped 组合文本(roster 探针)为权威,CLI 安装与 linked 树均正确;包解析降为 OR 兜底。
- 加 npm version 脚本同步 dsh.plugin.json 与 package.json。

## v0.9.1 — 2026-09-10

**类型**:feat

- 同步 dsh 0.1.5-alpha.2:官方 present 行(不可变文件交付卡片)在物化时按宿主能力探测注入,**绝不写进 8 份 ptc-era 资产**(组合里一行 import 失败会拒绝整棵 preset 挂载);锚定 tool-presentation 块纯字符串拼接(不解析 YAML,`!!js` 安全)、幂等;marker 记 `present`,宿主升级自动重物化补行。smoke 增至 41 项。

## v0.9.0 — 2026-09-08

**类型**:feat

- persona 拆分第四维(dsh 0.1.3-alpha.2):dsh-persona 单一 `text` 键拆成 `prefix:`+`suffix:`(无兼容别名);`detectPersonaEra` 读 roster 内置条目(绝不探测自家物化 preset),marker 记 `persona`,pickComposition 升维「era × gitbash × workflow × persona」,4 个 ptc-era 资产各加 `.ps` 孪生;升级顺序无关。

## v0.8.1 — 2026-09-05

**类型**:chore

- package.json 声明 `engines.dsh`(插件市场「宿主要求」显示面)。

## v0.8.0 — 2026-09-02

**类型**:feat

- workflow 开关(设置卡,默认 ON):恢复 dsh 0.1.2-alpha.4+ 上被官方禁用的创造侧 workflow 能力(官方仅 `ptc` 禁用、`cordis` 保留,本插件以创造能力为主体默认提供)。host 半 settings 命名空间 `ptc-cordis` + `SettingsScope.watch` 实时重物化(仅 unmodified);client 半(手写 ModuleLoader bundle)设置卡注册。
- (含 v0.7.1 alpha.4 同步收尾:ptc-era 资产 workflow 行 OFF 对齐官方。)

## v0.7.1 — 2026-09-02

**类型**:feat

- ptc-era 组合同步 dsh 0.1.2-alpha.4:官方给内置 `ptc` 的 `tool-workflow` 行加 `disabled: true`(#3425);两份 ptc-era 资产同步,smoke 增加 era 断言。

## v0.7.0 — 2026-08-29

**类型**:feat

- 双 era 组合文本与 marker.base:dsh 0.1.2 把内置 `code` 改名 `ptc`(无别名);`detectBase` 每启动探测 roster 选文件,marker 记 `base`,探测翻转自动刷新;preset id `ptc-cordis` 永不改名。
- **真机验证(2026-08-29,dsh 0.1.2-alpha.1)**:marker `base:"ptc"`、`standingKeyFor('ptc-cordis')` 挂载 OK、当时会话即运行于该物化 preset;此前本机为 ≤ 0.1.1(code era 双向验证的另一半)。

## v0.6.3 — 2026-08-24

**类型**:fix

- inspect shim 改 `ctx.inject(['cordisInspect'])` 服务就绪安装:apply 期一次性 `ctx.get` 采样时宿主 runner 行尚未激活、服务未 provide,shim 静默未安装——之后只要挂过内置 `cordis`,ptc-cordis 持续撞 "already registered" 直到重启。修复后与行激活顺序无关;已用完整 host 复验「cordis 先挂 + 选 ptc-cordis 成功」方向。

## v0.6.2 — 2026-08-23

**类型**:docs

- EN README 协作节;manifest 描述与版本同步。

## v0.6.1 — 2026-08-23

**类型**:ci

- node 24 + setup-node@v6(OIDC 要求 npm ≥ 11.5.1)。

## v0.6.0 — 2026-08-23

**类型**:feat

- 元数据跟随 gitBash 宿主能力:dsh-gitbash-shell 活动时显示名追加「· Git Bash」后缀。

## v0.5.1 — 2026-08-23

**类型**:fix

- 发布文件补齐 assets/*.yml(0.5.0 漏发 git bash 变体资产)。

## v0.5.0 — 2026-08-23

**类型**:feat

- 采纳 gitBash 宿主能力:dsh-gitbash-shell 活动时物化 Git Bash 变体(era × gitbash 选文件)。

## v0.4.0 — 2026-08-20

**类型**:feat

- 宿主 inspect 注册表兼容 shim:双 cordis 模式(内置 cordis + ptc-cordis)共用唯一宿主 runner,浏览器桥全通(审批卡、Client Provider、动态工具可见)。此前 0.2.x/0.3.x 演进:realm 私有 runner 挂载过但桥被掐断(0.2.0)→ 回退裸挂 + 互斥声明(0.3.0)→ 本版定位碰撞点仅 `cordisInspect.register` 一处,包裹之(防御式、幂等、dispose 还原、上游原生容忍后自动 no-op)。

## v0.3.0 — 2026-08-20

**类型**:fix

- tool-cordis 回归裸挂:realm 私有 runner 掐断浏览器桥(client-runner 只解析宿主面实例,审批队列/ack 在 runner 实例内部);期间以文档声明双 cordis 互斥。

## v0.2.2 — 2026-08-20

**类型**:chore

- 合并 quiet-startup(0.2.1 线)与 dsh 0.1.0-rc.8 组合注释同步。

## v0.2.1 — 2026-08-19

**类型**:feat

- quiet startup:版本与 skills 源未变时跳过重物化。

## v0.2.0 — 2026-08-19

**类型**:feat

- cordis 工具集隔离尝试(preset 私有 runner)——后因浏览器桥问题在 0.3.0 回退。

## v0.1.0 — 2026-08-19

**类型**:feat

- 首版:PTC 模式创造 preset(ptc-cordis)——内置 code(PTC)与 cordis(创造)增量合成,启动物化到用户 preset 根,哈希标记管理。
