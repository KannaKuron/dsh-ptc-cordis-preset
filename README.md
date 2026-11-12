# dsh-ptc-cordis-preset

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

简体中文 | [English](README_EN.md)

> PTC 模式基础上的创造模式 —— 给 [DeepSeek Harness (DSH)](https://www.npmjs.com/package/@deepseek-ai/dsh) 补上第四种组合:**Code Mode 工具编排 × 创造能力**。

DSH 内置四个 preset:标准(`standard`)、PTC(`ptc`,标准之上用 Code Mode SDK 把工具呈现为一个程序)、极简(`minimal`)、创造(`cordis`,标准之上叠加自引用 Cordis 工具与 preset 创作指导)。

内置创造模式建立在**标准模式**之上。本插件提供缺失的那一格:**PTC 创造模式**(`ptc-cordis`)—— PTC 模式的全部能力原样保留,叠加创造模式的全部增量:

- **🧬 自引用 Cordis 工具** — `cordis_inspect` / `cordis_define` / `cordis_run` / `cordis_stop` / `cordis_undefine`:读运行时、定义/运行/停止动态插件包
- **📐 双平面创作指导 persona** — 主机组合 vs Agent preset 的取舍规则,外加 Code Mode 下的组合方式
- **📚 composition 创作技能随行** — `editing-cordis-compositions` / `cordis-plugin-development` 跟着 preset 走
- **⏰🔔 官方增量行随行** — `time-context`、`tool-schedule`、`tool-plugin-market` 按宿主能力自动纳入,位置与官方 patch 逐行对齐;manager/market 跟随 `profileContext` 服务
- **🚫 workflow 工具恒不提供** — 与官方 PTC 模式一致;组合保留 `workflow-ptc` / `tool-workflow` 两行但永久禁用,使对齐 diff 保持逐行可比。`run_code` 内仍可编排子代理与并行调用

## 安装

```bash
dsh plugin --profile web add dsh-ptc-cordis-preset
# 源码与 Release: https://github.com/KannaKuron/dsh-ptc-cordis-preset
```

要求 **dsh >= 0.2.2-rc.1**、Node >= 24.9。本插件是纯 JS、零构建,安装不触发 pnpm 构建脚本,无需 `allowBuilds` 放行。装完重启 DSH,新建会话时在模式选择器里选 **「PTC 创造模式」**。

## 工作原理

dsh 0.2.2-rc.1 起 preset 是**声明式**的:插件通过 `ctx.agentPresets.register()` 直接把定义注册进名录,不物化任何目录。本插件启动时注册 `ptc-cordis`(组合数据在 `src/composition.js`),Python 后端开关翻转时**先摘旧、再挂新**地即时重注册:

- **组合镜像**:行集与官方 `packages/bundle/web-app/presets/{cordis,ptc}.patch.yml` 逐行对齐,由 `tests/fixtures/official-preset-rows.0.2.2.json` 在冒烟测试里双向锁死——官方加行/改默认值,测试立刻变红
- **技能随部署走**:创作技能不存快照,组合行的 `customSkillDirs` 指向**本机已安装的** `@deepseek-ai/dsh-agent-preset` 旁的 `skills/` 目录,DSH 升级即自动跟随
- **可选行探测**:`time-context` / `tool-schedule` / `tool-plugin-market` 仅在宿主模块基可解析到对应包时加入(`probeHostExtras`,与挂载同一解析基准);任何解析异常降级为「不可用」,绝不拒绝整棵 preset 挂载
- **旧物化残留清理**:v0.16.0 前本插件会物化 `~/.dsh/.agent-presets/ptc-cordis/`;如今启动时按 `.plugin-managed.json` 标记守卫清理——未改动的自动删除,你改过的只提示不碰

### 更新与卸载

- **更新**:市场页「更新」按钮或重跑安装命令 → 重启 DSH → 名录条目即为新版本
- **卸载**:市场页卸载 → 名录条目随之消失,没有目录残留
- 想基于它改出自己的模式?在模式选择器里复制成新 preset 再改副本

## 使用

1. 新建会话 → 模式选择器选 **PTC 创造模式**
2. 正常用 Code Mode(`run_code` 组合多步操作);`cordis_inspect` 等工具就在 SDK 里,和别的工具一样调用
3. 让它创作 preset / 试验动态插件时,它会自动加载随行的两个创作技能

> ⚠️ 信任边界与内置创造模式一致:`cordis_define`/`cordis_run` 会在活运行时上执行模型写的 JavaScript。把 PTC 创造模式的会话当作 shell 访问对待。

> ✅ **与内置创造模式同进程共存**:宿主面 runner 的 inspect 注册表遇重复 provider id 即抛错。本插件的兼容 shim 先走原路径,仅在撞「已注册」时替换条目(同包 manifest 等价,身份守卫 disposer 保持拆卸一致);通过 `ctx.inject(['cordisInspect'])` 在服务就绪时安装,与行激活顺序无关。上游若原生容忍重复注册,shim 自动成为 no-op。

### 界面语言

设置卡跟随 DSH 的语言设置(`ctx.locale`)实时切换,内置 **21 本**词典:简繁中文(含 `zh-HK` / `zh-MO` / `zh-TW`)、英语、日语、韩语、德语、法语、意大利语、葡萄牙语、俄语、荷兰语、波兰语、瑞典语、土耳其语、印尼语、越南语、泰语、印地语、阿拉伯语。

词典一门一条躺在 `src/client.js` 的 `LOCALES` 表里(条目前面是一行 `/* locale: <tag> */` 标记)。解析顺序是「精确 tag → 主语言子标签 → 英文」,查表按当前 locale 实时解析(按 tag 缓存),卡片同时订阅 `ctx.locale.subscribe`,切换语言当场重绘。

> 冒烟测试强制每本词典的键集与中文**完全相等**——缺键只会静默回退英文,卡片就成了半翻译状态。

## 从源码构建与测试

```bash
git clone https://github.com/KannaKuron/dsh-ptc-cordis-preset.git
cd dsh-ptc-cordis-preset
npm test   # node --test,56 项冒烟测试(无网络、无构建;数量以 npm test 输出为准)
```

本插件无构建步骤:`src/index.js`、`src/composition.js`、`src/client.js` 等即发布产物。

`tests/fixtures/official-preset-rows.0.2.2.json` 是官方 dsh 0.2.2-rc.1 预设行的**捕获**(解析 loader 方言、按 profile 宿主求值 `!!js` 后的结果),用来把本插件的声明式组合双向锁在官方文本上。换 dsh 版本后重建:用 dsh 检出里的 `packages/bundle/web-app/presets/{cordis,ptc}.patch.yml` 跑 `node tools/gen-official-preset-fixture.mjs`(路径可用 `DSH_CHECKOUT` / `DESKTOP_BUILD` 覆盖)。

## 与 dsh-gitbash-shell 联动

与 [dsh-gitbash-shell](https://github.com/KannaKuron/dsh-gitbash-shell) 同装时,两个插件在三个面上配合:

### 组合与名录显示名跟随 Git Bash

本插件检测对方的 `gitBash` 宿主能力服务:两插件合用 → 使用 Git Bash 形态(`tool-bash` 启用;`tool-pwsh` 默认禁用);未安装或非 Windows → 使用默认形态。探测在启动时有界(1 秒)完成。

**dsh-ops 0.5.0+ 显式接入**:同装 [dsh-ops](https://github.com/T-Auto/dsh-ops) 0.5.0 或更高版本时,本插件探测配置里唯一那行 `dsh-ops`(id 与 name 都是 `dsh-ops`,且未禁用),并只在探测到时往 `ptc-cordis` 组合里追加一行公共集成入口 `dsh-ops/integration`:

```js
{ preset: 'ptc-cordis', profile: 'ptc' }
```

它让本模式拿到 ops 的 PTC 文件工具(`inspect_local_file` 常驻、`load_sdk` 加载其余文件工具),同时 `shell:false` —— 不发布 `ops_bash`、不替换任何官方工具,shell 仍由 Git Bash 通道负责。dsh-ops 的内置模式开关(0.5.0–0.5.2 四项,0.5.3 起五项)只认官方 preset id,`ptc-cordis` 不在其中,所以必须这样显式接入;旧 0.4.x 的组件行/`dsh-ops-mode-*` 行集不再识别。未装 dsh-ops 时不加该行,组合与 v0.25.0 一致。官方 `tool-pwsh` 原有的去重/让位逻辑不变(`opsPresent` 仍与 peer 开关同权)。

**dsh-ops 0.5.3+ 兼容**:0.5.3 新增第五个内置模式 `OPS (PTC)`(`ops-ptc`),并默认把新会话的默认 preset 设为它(`global.forceDefaultOpsPtc` 默认 true,写入 `agent-preset-registry.selectedDefault`)。这只改变新会话的默认选择,不影响本插件的 `ptc-cordis` 注册,也不改变 `dsh-ops/integration` 的 `profile:'ptc'` 契约;模式选择器里仍可选「PTC 创造模式」。想保留原来的默认模式,可在 dsh-ops 设置卡关闭 `forceDefaultOpsPtc`。

**名录显示名**:Git Bash 活动时显示 **`PTC 创造模式 · Git Bash`**,描述追加 `(Shell 使用 Git Bash)`;非 Git Bash 时仍是 `PTC 创造模式`。名称以 `assets/preset.gitbash.yml` 的 `name:` 为**单一事实来源**,冒烟测试锁住两边同名。

### 发布 `ptcCordisPreset` 协作能力

启动时本插件向运行时发布:

```js
{ id: 'ptc-cordis', gitBashActive: true /* 非 Git Bash 侧为 false */ }
```

对方据此判断「这个 preset 已在 Git Bash 上覆盖了创造模式」,从而在用户打开去重开关时不再注册它自己的 `创造模式 · Git Bash`。发布前先完成有界探测,发布出去的值就是终值。没有安装对方的宿主上这个服务同样发布(`gitBashActive: false`)。

### 设置卡上的共享去重开关

同装时模式选择器里会出现两条。本插件设置卡有一行 **「与 dsh-gitbash-shell 去重」**:

- **默认关**(「保留两个」),不改变任何现有行为;
- **只有一份状态**:通过 `ctx.configForms.get('gitbash-shell')` 绑定**对方那一行**的 `suppressPeerCordis` 字段,两边显示同一个开关;
- **对方的行不存在时这一行不渲染**;
- 去重真正生效需要 dsh-gitbash-shell **≥ 0.25.0** 与本插件 **≥ 0.14.0** 同时满足。

> 若你的 `ptc-cordis` 目录由旧版本物化且已处于 unmodified 状态,升级后首次启动会自动刷新;若被手工修改过,删除 `~/.dsh/.agent-presets/ptc-cordis` 再重启即可。

## run_code 后端开关(默认关)

设置 → 插件 → 「PTC 创造模式」卡片有一行 **run_code 后端**:

- **Node / TypeScript(默认)**:run_code 使用 dsh 官方 Node PTC 后端,与官方 `ptc` 组合逐字节一致。
- **Python(实验性)**:改用 dsh 实验性 CPython 后端 `@deepseek-ai/dsh-experimental-ptc-runtime-python`(随本插件安装)。run_code 的语言、生成的 Python SDK 提示词与工具呈现会自动切换。

要求与边界:

- **平台**:仅 POSIX(macOS / Linux)。Windows 上保持官方 Node 后端并在日志给出指引。
- **解释器**:需要 CPython ≥ 3.10。插件按「显式 `pythonBin` → `DSH_PYTHON` → dsh 运行时自带 → 常见 Homebrew 路径 → PATH → `/usr/bin/python3`」逐个探测,并把胜出的绝对路径冻结给 provider。
- **生效时机**:**重启 dsh 后生效**(切换发生在 profile patch 层,启动时求值)。卡片状态与 dsh-gitbash-shell 的设置卡共享同一份值。
- **不可用时**:不切换后端,保持官方 Node 后端,并在宿主日志打印可执行指引。

## persistent-in-memory 执行模式(选配)

官方 PTC 运行时支持两种执行模式,由 `ptc-runtime` 行的 Config 字段 `executionMode` 选择:`'per-call'`(默认)| `'persistent-in-memory'`。本插件的组合镜像官方行集,两种模式均可用;官方参考组合见 dsh 仓库 `experimental/cua-macos/examples/persistent-ptc.cordis.yml`。

- **per-call(默认)**:每次 `run_code` 都发一张**新草稿纸**——程序写完即碎,变量、函数、`import` 的模块一概不留。
- **persistent-in-memory**:运行时切到 REPL 通道(`programFormat: 'repl'`),状态活在一块**共享白板**上——下一次调用的程序直接接着用。

边界(官方 `InMemoryExecution` 语义):变量与模块**跨调用保留**;**重新声明**同名 `let` / `const` / `class` 会失败;会话升级沙箱时,内存状态随临时环境一并收走。启用入口:`ptc-runtime` 行的 Config(或按官方示例在 profile patch 写 `executionMode`),与本插件的 run_code 后端开关互不干扰。

## 致谢与许可

- 合成组合与技能内容派生自 [@deepseek-ai/dsh](https://github.com/deepseek-ai/deepseek-harness) 内置 preset(MIT),运行时从本机安装拷贝
- 本仓库代码:[MIT](./LICENSE)
