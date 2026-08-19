# dsh-ptc-cordis-preset

> PTC 模式基础上的创造模式 —— 给 [DeepSeek Harness (DSH)](https://www.npmjs.com/package/@deepseek-ai/dsh) 补上第四种组合:**Code Mode 工具编排 × 创造能力**。

DSH 内置四个 preset:标准(`standard`)、PTC(`code`,标准之上用 Code Mode SDK 把工具呈现为一个 TypeScript 程序)、极简(`minimal`)、创造(`cordis`,标准之上叠加自引用 Cordis 工具与 preset 创作指导)。

内置的创造模式建立在**标准模式**之上。本插件提供缺失的那一格:**PTC 创造模式**(`ptc-cordis`)—— PTC 模式的全部能力原样保留(包括 `tool-presentation` 的 Code Mode 呈现),叠加创造模式的全部增量:

- **🧬 自引用 Cordis 工具** — `cordis_inspect` / `cordis_define` / `cordis_run` / `cordis_stop` / `cordis_undefine`:读运行时、定义/运行/停止动态插件包
- **📐 双平面创作指导 persona** — 主机组合 vs Agent preset 的取舍规则,外加 Code Mode 下的组合方式(把 cordis 工具当 SDK 函数写进 `run_code` 程序)
- **📚 composition 创作技能随行** — `editing-cordis-compositions` / `cordis-plugin-development` 两个 skill 跟着 preset 走

也就是说:在 PTC 创造模式的会话里,你可以让模型**一边用 Code Mode 单程序组合多步操作,一边检查活运行时、试验动态插件、创作新的 agent preset**。

## 安装

```bash
dsh plugin --profile web add KannaKuron/dsh-ptc-cordis-preset
# 或完整地址
dsh plugin --profile web add https://github.com/KannaKuron/dsh-ptc-cordis-preset
```

本插件是纯 JS、零构建、零依赖,安装不触发 pnpm 构建脚本,无需 `allowBuilds` 放行。装完重启 DSH(host 半变更),新建会话时在模式选择器里选 **「PTC 创造模式」** 即可。

## 工作原理

DSH 的 preset roster(`agentPresets` 服务)每次 `list()` 都重扫各根目录——进程运行中落盘的 preset 立即可见。本插件在启动时把 `ptc-cordis` preset 物化到**第一个 user 信任根**(默认 `~/.dsh/.agent-presets/ptc-cordis/`):

```
┌────────────────┐  启动时物化   ┌─────────────────────────────┐
│  dsh 插件       │ ───────────▶ │ ~/.dsh/.agent-presets/       │
│ (host 半)      │              │ └─ ptc-cordis/               │
└───────┬────────┘              │    ├─ agent.cordis.yml  合成组合 │
        │                       │    ├─ preset.yml         显示名  │
        │ skills/ 从本机已装的    │    ├─ skills/            创作技能 │
        │ cordis preset 现场拷贝  │    └─ .plugin-managed.json 标记 │
        └──────────────────────▶└─────────────────────────────┘
                 roster 下一次 list() 即刻可见 → 出现在模式选择器
```

- **合成组合**:`assets/agent.cordis.yml` = 内置 `code` preset 原封不动 + `cordis` preset 的增量(persona / `tool-cordis` / `customSkillDirs`)
- **技能随部署走**:`skills/` 不是仓库里的快照,而是从**本机已安装的内置 `cordis` preset** 现场拷贝,DSH 升级后重新物化即跟随更新
- **用户优先,哈希标记**:`.plugin-managed.json` 记录物化时每个文件的 sha256。未改动 → 插件升级时原位刷新;你改过任何文件 → 插件从此不再碰它(启动不覆盖、卸载不删除);一个没有标记的 `ptc-cordis` 目录是你自己建的 → 插件完全不接管

### 更新与卸载

- **更新**:市场页「更新」按钮或重跑安装命令 → 重启 DSH → 未改动的 preset 原位刷新为新版本
- **市场页卸载**:先删包再 dispose → 插件检测到包目录消失,**且** preset 未被你改过 → 自动删除 preset;你改过 → 保留,交给你处理
- **命令行卸载**(`dsh plugin --profile web remove dsh-ptc-cordis-preset`):独立进程执行,disposer 不会运行,preset 会残留 —— 在设置页删除 `ptc-cordis`,或手动 `rm -rf ~/.dsh/.agent-presets/ptc-cordis`
- 想基于它改出自己的模式?直接在设置页把它**复制**成新 preset 再改副本,或编辑它(编辑后本插件自动让位)

## 使用

1. 新建会话 → 模式选择器选 **PTC 创造模式**
2. 正常用 Code Mode(`run_code` 组合多步操作);`cordis_inspect` 等工具就在 SDK 里,和别的工具一样调用
3. 让它创作 preset / 试验动态插件时,它会自动加载随行的两个创作技能

> ⚠️ 信任边界与内置创造模式一致:`cordis_define`/`cordis_run` 会在活运行时上执行模型写的 JavaScript。把 PTC 创造模式的会话当作 shell 访问对待。

> ⚠️ **与内置创造模式同进程互斥**:`cordis_*` 工具集背后的 inspect 注册表是进程级单例,一个 DSH 进程内只能活一份 `dsh-tool-cordis`。若本进程已有内置「创造模式」会话在运行,新开 PTC 创造模式会话会在挂载时失败(反之亦然);重启 DSH 后,先创建的会话所属模式生效。两者与标准/PTC/极简模式互不影响。

## 从源码构建与测试

```bash
git clone https://github.com/KannaKuron/dsh-ptc-cordis-preset.git
cd dsh-ptc-cordis-preset
npm test   # node --test,11 项冒烟测试(无网络、无构建)
```

本插件无构建步骤:`src/index.js` 与 `assets/*` 即发布产物。

## 致谢与许可

- 合成组合与技能内容派生自 [@deepseek-ai/dsh](https://github.com/deepseek-ai/deepseek-harness) 内置 preset(MIT),运行时从本机安装拷贝,遵循其许可
- 工程结构与分发方式参考 [dsh-deepseek-vision-bridge](https://github.com/KannaKuron/dsh-deepseek-vision-bridge)
- 本仓库代码:[MIT](./LICENSE)
