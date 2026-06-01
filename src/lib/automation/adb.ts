import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../log';
import { MultiloginCloudPhoneProvider } from '../accounts/providers/multilogin';

const execFileAsync = promisify(execFile);
const log = logger('automation/adb');

const ADB_BIN = process.env.ADB_BIN || 'adb';

interface AdbInfo {
  ip: string;
  port: string;
  pwd: string;
  status: string;
}

interface AdbInfoItem {
  id: string;
  ip?: string;
  port?: string;
  pwd?: string;
  status?: string;
  code?: number;
}

interface ConnectionCache {
  target: string;
  pwd: string;
  loggedIn: boolean;
  fetchedAt: number;
}

const SESSION_CACHE = new Map<string, ConnectionCache>();
const CACHE_TTL_MS = 5 * 60_000;

/**
 * Driver for Multilogin Cloud Phones over ADB-TCP.
 *
 * Multilogin's ADB endpoint requires a one-time `glogin <pwd>` per TCP
 * connection. Both pwd and the (ip:port) tuple rotate when the phone is
 * stopped/restarted. We re-fetch via /mobile_profiles/phone/adb/info before
 * every fresh session and cache for 5 min.
 *
 * Standard adb usage from there: `adb -s ip:port shell <cmd>`.
 */
export class AdbDriver {
  private readonly profileId: string;
  private readonly ml: MultiloginCloudPhoneProvider;

  constructor(profileId: string) {
    this.profileId = profileId;
    this.ml = new MultiloginCloudPhoneProvider();
  }

  /** Ensure phone is reachable: refresh adb info → connect → glogin. */
  async ensureConnected(): Promise<{ target: string }> {
    const cached = SESSION_CACHE.get(this.profileId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS && cached.loggedIn) {
      return { target: cached.target };
    }

    const info = await this.fetchAdbInfo();
    if (!info) {
      throw new Error(
        `ADB info unavailable for profile ${this.profileId} — is the phone running and ADB enabled?`,
      );
    }
    const target = `${info.ip}:${info.port}`;
    await this.run(['connect', target]);
    const login = await this.adbShellRaw(target, `glogin ${info.pwd}`);
    if (!/success|already logged/i.test(login)) {
      throw new Error(`glogin failed: ${login}`);
    }
    SESSION_CACHE.set(this.profileId, {
      target,
      pwd: info.pwd,
      loggedIn: true,
      fetchedAt: Date.now(),
    });
    log.info('adb session ready', { profile: this.profileId, target });
    return { target };
  }

  /** Run a shell command on the phone, returning stdout. */
  async shell(cmd: string): Promise<string> {
    const { target } = await this.ensureConnected();
    return this.adbShellRaw(target, cmd);
  }

  /** Tap at (x, y) using `input tap`. */
  async tap(x: number, y: number): Promise<void> {
    await this.shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  /** Swipe from (x1,y1) to (x2,y2) over `durationMs`. */
  async swipe(x1: number, y1: number, x2: number, y2: number, durationMs = 300): Promise<void> {
    await this.shell(
      `input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${Math.round(durationMs)}`,
    );
  }

  /** Send text via `input text`. Spaces must be escaped as %s. */
  async type(text: string): Promise<void> {
    const escaped = text.replace(/ /g, '%s').replace(/'/g, "\\'");
    await this.shell(`input text '${escaped}'`);
  }

  /** Press a KeyEvent code (e.g. 'KEYCODE_BACK', 'KEYCODE_HOME'). */
  async key(keyCode: string): Promise<void> {
    await this.shell(`input keyevent ${keyCode}`);
  }

  /** Get current screen size as {width, height}. */
  async screenSize(): Promise<{ width: number; height: number }> {
    const out = await this.shell('wm size');
    const m = /Physical size:\s*(\d+)x(\d+)/.exec(out);
    if (!m || !m[1] || !m[2]) throw new Error(`screenSize: cannot parse "${out}"`);
    return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
  }

  /** Launch an app by package + activity (or just package for main launcher). */
  async startApp(pkgOrComponent: string): Promise<void> {
    const cmd = pkgOrComponent.includes('/')
      ? `am start -n ${pkgOrComponent}`
      : `monkey -p ${pkgOrComponent} -c android.intent.category.LAUNCHER 1`;
    await this.shell(cmd);
  }

  /** Foreground app package name (via dumpsys). */
  async currentForegroundApp(): Promise<string | null> {
    const out = await this.shell(
      'dumpsys window | grep -E "mCurrentFocus|mFocusedApp" | head -1',
    );
    const m = /([a-z0-9_.]+\/[A-Za-z0-9_.$]+)/.exec(out);
    if (!m || !m[1]) return null;
    return m[1].split('/')[0] ?? null;
  }

  /** Capture screenshot, returns PNG bytes. */
  async screenshot(): Promise<Buffer> {
    const { target } = await this.ensureConnected();
    const { stdout } = await execFileAsync(
      ADB_BIN,
      ['-s', target, 'exec-out', 'screencap', '-p'],
      { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 },
    );
    return stdout;
  }

  /** Dump UI hierarchy XML for current screen (use with grep/xpath). */
  async uiDump(): Promise<string> {
    await this.shell('uiautomator dump /sdcard/window_dump.xml >/dev/null');
    return this.shell('cat /sdcard/window_dump.xml');
  }

  private async fetchAdbInfo(): Promise<AdbInfo | null> {
    const resp = (await this.ml.mobileAdbInfo([this.profileId])) as {
      data?: { items?: AdbInfoItem[] };
    };
    const item = resp.data?.items?.find((it) => it.id === this.profileId);
    if (!item || item.status === 'disabled' || !item.ip || !item.port || !item.pwd) {
      return null;
    }
    return {
      ip: item.ip,
      port: item.port,
      pwd: item.pwd,
      status: item.status ?? 'active',
    };
  }

  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(ADB_BIN, args, { encoding: 'utf-8' });
      return stdout.trim();
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message: string };
      throw new Error(
        `adb ${args.join(' ')} failed: ${err.stderr || err.stdout || err.message}`,
      );
    }
  }

  private async adbShellRaw(target: string, cmd: string): Promise<string> {
    return this.run(['-s', target, 'shell', cmd]);
  }
}

/** Convenience wrapper for one-off ADB shell commands. */
export async function withAdb<T>(
  profileId: string,
  fn: (adb: AdbDriver) => Promise<T>,
): Promise<T> {
  const adb = new AdbDriver(profileId);
  await adb.ensureConnected();
  return fn(adb);
}
