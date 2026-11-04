/**
 * Where the boot-time Python snapshot lives. Both halves must agree: the patch's
 * `!!js` anchors read this path before the plugin tree mounts, so `dshHomePath`
 * (provided by app-boot) is authoritative and DSH_HOME / ~/.dsh is only the
 * fallback for a host without that service.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export const RUNTIME_SNAPSHOT_FILE = 'ptc-cordis-runtime.json'

export function snapshotPath(ctx) {
  try {
    const homePath = ctx?.get?.('dshHomePath')
    if (typeof homePath === 'function') return homePath(RUNTIME_SNAPSHOT_FILE)
  } catch {
    /* fall through to the environment */
  }
  const env = process.env.DSH_HOME
  return join(env && env.trim() !== '' ? env : join(homedir(), '.dsh'), RUNTIME_SNAPSHOT_FILE)
}
