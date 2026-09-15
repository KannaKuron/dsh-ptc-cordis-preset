# Changelog — dsh-ptc-cordis-preset

> 倒序排列,新版本条目在最上面。条目格式:`## vX.Y.Z — YYYY-MM-DD` + 类型(feat / fix / docs / chore)+ 要点 + 相关链接。
> 纪律见 AGENTS.md「变更记录纪律」:发版前先更新本文件并随版本提交;事故复盘、复现与真机验证记录也记在这里。

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
