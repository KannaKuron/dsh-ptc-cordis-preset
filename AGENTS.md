# AGENTS.md

面向后续在本仓库继续开发的 Agent / 贡献者。读完再动手。

## 环境与工具

- 本机已安装 GitHub CLI(`gh`)且已认证:建仓、推送、release 等 GitHub 操作**优先用 `gh`**,不要手动调 API。
- 分发**只走 GitHub**(不发布 npm):安装命令 `dsh plugin --profile web add KannaKuron/dsh-ptc-cordis-preset`;版本管理用 git tag + GitHub Release。

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
7. **`tool-cordis` 必须与私有 runner 同处一个 isolate realm**(v0.2.0,2026-08 实测):宿主侧 `dsh-cordis-host-runner` 的 `cordisInspect` providers 注册表是进程级单例,preset 里的 `tool-cordis` 若解析宿主实例,与内置 `cordis` preset 同进程时 apply 抛 `Host Cordis inspect provider "Service" is already registered` → apiproxy 的 select/recompose 失败 → 官方新会话 chip 按其错误路径回退成设置默认模式(「选了 PTC 创造却变成默认模式」bug 即此,v0.1.0 的真实线上反馈)。修法:`cordis-tools` 组(`isolate: { dynamicCordisRunner: true, cordisInspect: true }`)内先挂自己的 `@deepseek-ai/dsh-cordis-host-runner` 再挂 `tool-cordis`,子树解析私有实例,双模式并行。挂载校验此组合必须保留「同进程有内置 cordis 会话在跑」的场景(创造模式会话本身即是)。
 8. **探针 preset 纪律**(2026-08 教训):挂载校验用的临时 preset(如 `ptc-cordis-probe2`)落进用户 preset 根后**对 UI 模式选择器立即可见**,用户可能新建会话时选到它;探针目录随后删除,该会话发消息即报 `preset not found`(头部记录被钉死在已删除的探针上)。规则:创建探针前先在对话里告知用户"不要选择即将出现的探针条目";探针必须在**同一轮**内删除,绝不跨轮存活;若用户会话已被钉在探针上,让其仍在 blank 时于模式 chip 改选 `ptc-cordis`(recompose 对 blank 会话合法),或弃掉该空白会话。

## 验证清单(改动后)

1. `npm test` 全绿。
2. 真机验证:删除 `~/.dsh/.agent-presets/ptc-cordis` → 启动/重载 DSH → 物化日志出现 → 模式选择器出现「PTC 创造模式」→ 新会话能用 `run_code` 且有 `cordis_*` 工具。
3. 若动了组合文本:用 cordis preset 会话跑 `agentPresets.standingKeyFor('ptc-cordis')` 挂载校验(拒绝会点名未激活的 row)。

## 安全红线

- 不提交任何真实凭据;本插件不接触凭据。
- preset id 固定 `ptc-cordis`;物化目标只取 roster 报告的第一个 user 信任根,不要自己拼路径猜。
- 仓库里的组合文本派生自 @deepseek-ai/dsh(MIT)内置 preset:保持致谢声明,不要替换成无许可来源的内容。

## 沙箱约定

- 本目录若作临时沙箱:任务产物(脚本、临时目录)完成后主动清理;只删本次任务自己创建的产物。
- 提交信息用英文一行式(conventional commits 风格)。

## 发布 checklist(GitHub-only)

1. `npm test` 全绿。
2. `npm version patch|minor`(组合同步/修复用 patch,能力变化用 minor)。
3. `git push --tags`。
4. `gh release create <tag>`(notes 带安装命令与变更摘要)。
5. 用户侧更新 = 市场页「更新」按钮或重跑安装命令(host 半变更需重启 DSH)。
