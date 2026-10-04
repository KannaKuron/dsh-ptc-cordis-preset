# dsh-ptc-cordis-preset

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

简体中文 | [English](README_EN.md)

> PTC 模式基础上的创造模式 —— 给 [DeepSeek Harness (DSH)](https://www.npmjs.com/package/@deepseek-ai/dsh) 补上第四种组合:**Code Mode 工具编排 × 创造能力**。

DSH 内置四个 preset:标准(`standard`)、PTC(`code`,**dsh 0.1.2 起改名为 `ptc`**,标准之上用 Code Mode SDK 把工具呈现为一个 TypeScript 程序)、极简(`minimal`)、创造(`cordis`,标准之上叠加自引用 Cordis 工具与 preset 创作指导)。

内置的创造模式建立在**标准模式**之上。本插件提供缺失的那一格:**PTC 创造模式**(`ptc-cordis`)—— PTC 模式的全部能力原样保留(包括 `tool-presentation` 的 Code Mode 呈现),叠加创造模式的全部增量:

- **🧬 自引用 Cordis 工具** — `cordis_inspect` / `cordis_define` / `cordis_run` / `cordis_stop` / `cordis_undefine`:读运行时、定义/运行/停止动态插件包
- **📐 双平面创作指导 persona** — 主机组合 vs Agent preset 的取舍规则,外加 Code Mode 下的组合方式(把 cordis 工具当 SDK 函数写进 `run_code` 程序)
- **📚 composition 创作技能随行** — `editing-cordis-compositions` / `cordis-plugin-development` 两个 skill 跟着 preset 走
- **⏰🔔 官方时间上下文与提醒工具自动随行(v0.17.0)** — dsh 0.2.1 起官方全工具模式内置请求时钟上下文(`time-context`)与提醒工具(`schedule_*`,子代理不可用);本插件在 0.2.1+ 宿主上探测到对应包即自动纳入组合,与官方 patch 逐行对齐;旧宿主行为不变,无需升级 dsh 也能继续用
- **🎛️ workflow 开关(设置卡,v0.8.0)** — 官方 PTC 模式自 dsh 0.1.2-alpha.4 起默认不提供 workflow 工具(`run_code` 已是唯一模型编排面),而创造模式保留它;本插件默认**提供**(继承创造模式能力,与历史版本一致)。设置 → 插件 → 「PTC 创造模式」卡片可一键切换:切换即时重注册,**新会话**即刻生效(已打开的会话保持原组合);需要 dsh ≥ 0.1.2

也就是说:在 PTC 创造模式的会话里,你可以让模型**一边用 Code Mode 单程序组合多步操作,一边检查活运行时、试验动态插件、创作新的 agent preset**。

## 安装

```bash
dsh plugin --profile web add dsh-ptc-cordis-preset   # npm 公开包
# 源码与 Release: https://github.com/KannaKuron/dsh-ptc-cordis-preset
```

本插件是纯 JS、零构建、零依赖,安装不触发 pnpm 构建脚本,无需 `allowBuilds` 放行。装完重启 DSH(host 半变更),新建会话时在模式选择器里选 **「PTC 创造模式」** 即可。

## 工作原理

dsh 0.1.7 起 preset 是**声明式**的:插件通过 `ctx.agentPresets.register()` 直接把定义注册进名录,不再物化任何目录。本插件在启动时注册 `ptc-cordis`(组合数据在 `src/composition.js`,镜像官方 `cordis` preset 行集 + PTC 呈现增量),workflow / Python 后端两个开关翻转时**先摘旧、再挂新**地即时重注册:

- **组合镜像**:行集与官方 `packages/bundle/web-app/presets/cordis.patch.yml` 逐行对齐,由两份官方捕获(`tests/fixtures/official-preset-rows*.json`,0.1.7 与 0.2.1)在冒烟测试里双向锁死——官方加行/改默认值,测试立刻变红
- **技能随部署走**:创作技能不存快照,组合行 `customSkillDirs` 指向**本机已安装的** `@deepseek-ai/dsh-agent-preset` 旁的 `skills/` 目录,DSH 升级即自动跟随(0.2.1 起官方新增的 `cordis-plugin-development` 技能自动可用)
- **dsh 0.2.1 增量探测**:官方 0.2.1 给全工具 preset 加了 `time-context` 与 `tool-schedule` 两行(外加子代理的 schedule_* deny)。这两行**仅在宿主模块基可解析到对应包时加入**(`probeHostExtras`,与挂载同一解析基准)——0.2.1+ 宿主自动获得,旧宿主逐字节保持 0.1.7 行集,`engines.dsh` 维持 `>=0.1.7-rc` 不抬门槛
- **旧物化残留清理**:v0.16.0 前本插件会物化 `~/.dsh/.agent-presets/ptc-cordis/`;如今启动时按 `.plugin-managed.json` 标记守卫清理——未改动的自动删除,你改过的只提示不碰

### 更新与卸载

- **更新**:市场页「更新」按钮或重跑安装命令 → 重启 DSH → 名录条目即为新版本
- **卸载**:市场页卸载 → 名录条目随之消失,没有目录残留;v0.16.0 前物化的旧目录若从未改动会被启动清理自动带走,改过的保留、交给你处理
- 想基于它改出自己的模式?在模式选择器里复制成新 preset 再改副本

<details>
<summary><b>市场页没出现「更新」按钮?</b></summary>

npm 安装的插件由 dshmarket 按注册表版本检测更新。常见原因:

1. **30 分钟 TTL 缓存**——刚发布就刷新会缓存"无更新",期间再刷直接吃缓存。访问 `/dsh-market/updates?force=1` 强制刷新。
2. **安装时机晚于发布**——装的时候已是最新版(版本号可在市场页或 `node_modules/dsh-ptc-cordis-preset/package.json` 里确认),没有更新按钮是正确行为。

更新命令(dshmarket 之外的手动方式):

```bash
dsh plugin --profile web add dsh-ptc-cordis-preset
```

</details>

## 使用

1. 新建会话 → 模式选择器选 **PTC 创造模式**
2. 正常用 Code Mode(`run_code` 组合多步操作);`cordis_inspect` 等工具就在 SDK 里,和别的工具一样调用
3. 让它创作 preset / 试验动态插件时,它会自动加载随行的两个创作技能

> ⚠️ 信任边界与内置创造模式一致:`cordis_define`/`cordis_run` 会在活运行时上执行模型写的 JavaScript。把 PTC 创造模式的会话当作 shell 访问对待。

> ✅ **与内置创造模式同进程共存**(v0.4.0 起):宿主面 runner 的 inspect 注册表遇重复 provider id 即抛错,是"一个进程只能开一个 cordis 模式会话"的唯一根源(v0.2.0 曾用 isolate realm 规避,代价是掐断浏览器桥,v0.3.0 移除)。v0.4.0 提供**兼容 shim**:注册先走原路径,仅在撞"已注册"时改为替换条目(同包 manifest 等价,身份守卫 disposer 保持拆卸一致)—— 两个 preset 共用唯一宿主 runner,审批卡/Client Provider/Client 激活/动态工具全通(已实测:双模式同进程挂载 + 9 个 Provider 含 5 个 client 侧全部应答)。
>
> ⚠️ **0.6.3 修复了 shim 的安装时机**:此前在插件启动时一次性采样 `cordisInspect`,而宿主 runner 行激活晚于插件行,真机启动时该服务尚未提供,shim 静默未安装——于是只要进程内(哪怕只是曾经)挂载过内置创造模式,`ptc-cordis` 就会一直撞 "Provider is already registered",直到重启 dsh;且**关闭/归档会话并不卸载 standing 挂载**,所以"现在没有创造模式会话"不代表竞争消失。现在 shim 通过 `ctx.inject(['cordisInspect'])` 在服务就绪的那一刻安装,与行激活顺序无关。shim 依旧防御式:形状探测不过即自动退回 v0.3.0 裸挂行为(仅打日志,不影响启动);上游若原生容忍重复注册,原路径自然成功,shim 成为 no-op。根治仍建议上游把 runner 按会话多实例化。

### 界面语言

设置卡跟随 DSH 的语言设置(`ctx.locale`)实时切换,内置 **21 本**词典:简繁中文(含 `zh-HK` / `zh-MO` / `zh-TW`)、英语、日语、韩语、德语、法语、意大利语、葡萄牙语、俄语、荷兰语、波兰语、瑞典语、土耳其语、印尼语、越南语、泰语、印地语、阿拉伯语。词典一门一条躺在 `src/client.js` 的 `LOCALES` 表里(条目前面是一行 `/* locale: <tag> */` 标记),并整体注册进 DSH 的 locale 注册表(`ctx.locale.register`)。

解析顺序是「精确 tag → 主语言子标签 → 英文」,`zh-Hant-*` 归港式繁体;**英文始终是键完整的那一本**,所以任何未覆盖的语言都回退英文,不会露出键名。查表按当前 locale **每次实时解析**(按 tag 缓存),卡片同时订阅 `ctx.locale.subscribe`,切换语言当场重绘、不必刷新页面。

> 冒烟测试强制每本词典的键集与中文**完全相等**——缺键只会静默回退英文,卡片就成了半翻译状态,那正是这条测试要挡住的。第三语言为机器辅助翻译,欢迎在 issue / PR 里指正。

## 从源码构建与测试

```bash
git clone https://github.com/KannaKuron/dsh-ptc-cordis-preset.git
cd dsh-ptc-cordis-preset
npm test   # node --test,52 项冒烟测试(无网络、无构建;数量以 npm test 输出为准)
```

本插件无构建步骤:`src/index.js` 与 `src/composition.js` 即发布产物。

`tests/fixtures/official-preset-rows.json`(0.1.7 捕获)与 `tests/fixtures/official-preset-rows.0.2.1.json`(0.2.1 捕获)是官方 dsh 预设行的**捕获**(解析 loader 方言、按 profile 宿主求值 `!!js` 后的结果),用来把本插件的声明式组合双向锁在官方文本上——组合漂移会直接让 `npm test` 变红。换 dsh 版本后重建:用 dsh 检出里的 `packages/bundle/web-app/presets/{cordis,ptc}.patch.yml` 跑 `node tools/gen-official-preset-fixture.mjs`(路径可用 `DSH_CHECKOUT` / `DESKTOP_BUILD` 覆盖;本机 Windows 姿势见 CHANGELOG v0.17.0)。

## 与 dsh-gitbash-shell 联动

与 [dsh-gitbash-shell](https://github.com/KannaKuron/dsh-gitbash-shell)(v0.2.0+)同装时,两个插件在三个面上配合(改动见 CHANGELOG v0.14.0,对应本仓库 issue [#1](https://github.com/KannaKuron/dsh-ptc-cordis-preset/issues/1) 与对方 issue [#7](https://github.com/KannaKuron/dsh-gitbash-shell/issues/7))。

### 组合与名录显示名跟随 Git Bash

本插件物化 `PTC 创造模式` 时检测对方的 `gitBash` 宿主能力服务:两插件合用 → 使用
`assets/agent.cordis.gitbash.yml`(tool-bash 启用、tool-pwsh 禁用,即 Git Bash 版);
未安装或非 Windows → 使用默认 `assets/agent.cordis.yml`。能力开关变化会触发一次
自动刷新(仅限未修改的 preset),无需新增模式、无需手工改文件。

**名录里的显示名与描述同样跟随这一侧**:Git Bash 活动时显示 **`PTC 创造模式 · Git Bash`**,
描述追加 `(Shell 使用 Git Bash)`,与对方四个 `* · Git Bash` 变体的命名风格一致;非 Git Bash
时仍是 `PTC 创造模式`。旧宿主(物化路径)自 v0.6.0 起一直如此;v0.13.0 的声明式重写一度把
显示名硬编码,只有 dsh ≥ 0.1.7 的新宿主会丢后缀,已在 v0.14.0 修好。名称以
`assets/preset.gitbash.yml` 的 `name:` 为**单一事实来源**,冒烟测试锁住两边同名,防止再次漂移。

### 发布 `ptcCordisPreset` 协作能力

启动时(两个宿主时代都发,且早于时代分流)本插件向运行时发布一个能力服务:

```js
{ id: 'ptc-cordis', gitBashActive: true /* 非 Git Bash 侧为 false */ }
```

对方据此判断「这个 preset 已经在 Git Bash 上覆盖了创造模式」,从而在用户打开去重开关时不再
注册它自己的 `创造模式 · Git Bash`。因为对方是靠**「服务出现」这一事件**做决定的,本插件
**先做完有界(1 秒)的 `gitBash` 能力探测、再发布**——发布出去的值就是终值,不会出现
「先发 `false`、之后再翻成 `true`」而对方已经错过的情况。没有安装对方的宿主上这个服务同样发布
(`gitBashActive: false`),「服务缺席」因此只表示本插件没挂载。

### 设置卡上的共享去重开关

对方的 `创造模式 · Git Bash` 与本插件(联动后已是 Git Bash 版)指向同一件事,同装时模式选择器里
会出现两条。v0.14.0 起本插件的设置卡多出一行 **「与 dsh-gitbash-shell 去重」**:

- **默认关**(显示为「保留两个」),不改变任何现有行为;
- **只有一份状态**:这一行不存自己的值,而是通过 `ctx.configForms.get('gitbash-shell')` 绑定
  **对方那一行**的 `suppressPeerCordis` 字段,并 `subscribe` 对方的变更——两处设置卡显示的是
  同一个开关,任一侧改动另一侧立即同步;
- **对方的行不存在(未安装)时这一行不渲染**,本插件设置卡退回原来的单行形态;
- **版本要求**:去重真正生效需要 dsh-gitbash-shell **≥ 0.25.0**(开关本体)与本插件
  **≥ 0.14.0**(协作能力)同时满足,名录里才会少掉那一条;
- **旧宿主边界**:只有 dsh **≥ 0.1.7** 上两侧都能改(新宿主才有 `configForms`);旧宿主
  (≤ 0.1.6)在本插件卡里看不到这一行,只能在对方自己的设置面里改,并按对方的启动时语义生效。

> 若你的 `ptc-cordis` 目录由旧版本物化且已处于 unmodified 状态,升级后首次启动
> 会自动刷新;若被手工修改过,删除 `~/.dsh/.agent-presets/ptc-cordis` 再重启即可
> 以新逻辑重新物化。

## 致谢与许可

- 合成组合与技能内容派生自 [@deepseek-ai/dsh](https://github.com/deepseek-ai/deepseek-harness) 内置 preset(MIT),运行时从本机安装拷贝,遵循其许可
- 本仓库代码:[MIT](./LICENSE)

## run_code 后端开关(v0.15.0,默认关)

设置 → 插件 → 「PTC 创造模式」卡片新增一行 **run_code 后端**:

- **Node / TypeScript(默认)**:run_code 使用 dsh 官方 Node PTC 后端,与官方 `ptc` 组合逐字节一致。
- **Python(实验性)**:改用 dsh 实验性 CPython 后端 `@deepseek-ai/dsh-experimental-ptc-runtime-python`(随本插件安装,无需二次安装)。run_code 的语言、生成的 Python SDK 提示词与工具呈现会自动切换(由 provider 的 `language` / `executionInstructions` 驱动)。

要求与边界:

- **平台**:仅 POSIX(macOS / Linux)。Windows 上实验后端在加载期直接抛错,本插件保持官方 Node 后端并在日志给出指引。
- **解释器**:需要 CPython ≥ 3.10。插件按「显式 `pythonBin` → `DSH_PYTHON` → dsh 运行时自带 → `/opt/homebrew/bin`、`/usr/local/bin` → PATH → `/usr/bin/python3`」逐个探测,并把胜出的绝对路径冻结给 provider;**桌面端 GUI 的 PATH 通常只有 macOS 自带的 3.9**,必要时 `brew install python@3.12`,或在行 Config 里填 `pythonBin` 指向你的解释器。
- **与 workflow 互斥**:`workflow-ptc` 硬要求 TypeScript 运行时,官方 Python 组合同样禁用 workflow;开启期间本插件把 `workflow-ptc` / `tool-workflow` 强制关闭(你的 workflow 设置值保留,关掉后恢复)。
- **生效时机**:**重启 dsh 后生效**(切换发生在 profile patch 层,启动时求值)。卡片状态与 dsh-gitbash-shell 的设置卡共享同一份值,任一侧改动两侧即时同步。
- **不可用时**:插件**不会**切换后端——保持官方 Node 后端,并在宿主日志打印可执行指引(缺解释器 / 缺包 / 平台不支持)。
