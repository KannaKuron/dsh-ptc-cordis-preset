# Changelog — dsh-ptc-cordis-preset

> 倒序排列,新版本条目在最上面。条目格式:`## vX.Y.Z — YYYY-MM-DD` + 类型(feat / fix / docs / chore)+ 要点 + 相关链接。
> 纪律见 AGENTS.md「变更记录纪律」:发版前先更新本文件并随版本提交;事故复盘、复现与真机验证记录也记在这里。

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
