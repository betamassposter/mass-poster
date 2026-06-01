import { chromium, type Browser, type BrowserContext } from 'playwright';
import type {
  IpReputationProvider,
  IpReputationResult,
  IpReputationSignals,
  ProxyCredential,
} from '../types.ts';

/**
 * Browserleaks IP fingerprint provider — scrapes https://browserleaks.com/ip
 * through a headless Chromium routed via the proxy under test.
 *
 * Why a real browser (vs API): browserleaks intentionally has no public API.
 * The page aggregates server-side signals (IP, geo, ASN, blacklists, Tor
 * detection, Proxy/VPN flags) and JS-side augmentations (DNS leak via
 * uniquely-named subdomain resolution, WebRTC local IP enumeration). To get
 * all signals we have to load the page in a browser routed through the proxy
 * and read the rendered DOM.
 *
 * Performance cost: ~6-12s per check + ~150MB Chromium cold start.
 * Mitigation: a single Browser instance is reused across calls; only the
 * context (cookies, proxy config) is per-check.
 *
 * Decision rule for `clean: true`:
 *   - Tor / Hosting flag = false
 *   - VPN flag = false (mobile proxies are not commercial VPNs)
 *   - Proxy flag may be true (mobile proxies WILL be flagged as proxies on
 *     some lists — that's not a kill signal by itself)
 *   - Blacklist hits = 0
 *   - DNS leak = no (DNS resolver geo matches proxy IP geo)
 *   - WebRTC leak = no (Multilogin Cloud Phone should block this)
 *   - Geo matches expectedCountry
 */

const BROWSERLEAKS_URL = 'https://browserleaks.com/ip';
const NAVIGATION_TIMEOUT_MS = 30_000;

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
    ],
  });
  return _browser;
}

/** Shape returned by the in-browser extractor. Kept here for type-safety on
 *  both sides of the page.evaluate boundary. */
interface BrowserleaksScrape {
  ip?: string;
  hostname?: string;
  country?: string;          // 2-letter ISO
  country_full?: string;
  region?: string;
  city?: string;
  isp?: string;
  organization?: string;
  asn?: number;
  is_tor?: boolean;
  is_proxy?: boolean;
  is_vpn?: boolean;
  is_hosting?: boolean;
  proxy_type?: string;
  blacklists?: string[];
  dns_servers?: Array<{ ip: string; country?: string; isp?: string }>;
  dns_leak_detected?: boolean;
  webrtc_public_ip?: string;
  webrtc_local_ips?: string[];
  webrtc_leak_detected?: boolean;
  raw_text?: string;
}

export class BrowserleaksIpReputationProvider implements IpReputationProvider {
  readonly name = 'browserleaks';

  async isReady(): Promise<boolean> {
    try {
      const path = chromium.executablePath();
      return Boolean(path);
    } catch {
      return false;
    }
  }

  async check(
    ip: string,
    opts?: { proxy?: ProxyCredential; expectedCountry?: string },
  ): Promise<IpReputationResult> {
    const startedAt = new Date().toISOString();

    if (!opts?.proxy) {
      return {
        provider: this.name,
        ip,
        clean: false,
        signals: {
          notes: ['browserleaks check requires a proxy — direct check would test our server'],
        },
        checked_at: startedAt,
      };
    }

    let context: BrowserContext | null = null;
    let scrape: BrowserleaksScrape = {};
    const errors: string[] = [];
    let bridgeUrl: string | null = null;
    let ephemeralBrowser: Browser | null = null; // launched fresh for SOCKS5+auth

    try {
      // Chromium does not support SOCKS5 with username/password auth
      // (crbug.com/256785, open since 2013). For SOCKS5+auth proxies we
      // spawn a local HTTP CONNECT bridge via proxy-chain — it accepts an
      // authless local connection, then forwards through the upstream
      // authenticated SOCKS5. Playwright then proxies through 127.0.0.1
      // (no auth needed at that layer) and gets the same egress IP.
      //
      // Important: the bridge URL must be baked into chromium.launch (not
      // newContext) for the HTTP CONNECT tunnel to negotiate cleanly. Per-
      // context override hits ERR_TUNNEL_CONNECTION_FAILED on Chromium 124+
      // when the upstream is a local loopback. We launch ephemeral per-call.
      let proxyServer: string;
      let proxyUsername: string | undefined = opts.proxy.username;
      let proxyPassword: string | undefined = opts.proxy.password;
      const isSocks5Auth =
        opts.proxy.type === 'socks5' && !!opts.proxy.username && !!opts.proxy.password;
      if (isSocks5Auth) {
        const { anonymizeProxy } = await import('proxy-chain');
        const upstream =
          `socks5://${encodeURIComponent(opts.proxy.username!)}:${encodeURIComponent(opts.proxy.password!)}` +
          `@${opts.proxy.host}:${opts.proxy.port}`;
        // eslint-disable-next-line no-console
        console.log('[browserleaks] creating SOCKS5+auth bridge for', opts.proxy.host);
        bridgeUrl = await anonymizeProxy(upstream);
        // eslint-disable-next-line no-console
        console.log('[browserleaks] bridge URL:', bridgeUrl);
        // Probe the bridge with a plain HTTP request first — if THIS fails,
        // the bridge itself is broken; if it succeeds but Chromium still gets
        // TUNNEL_CONNECTION_FAILED, the issue is Chromium↔bridge specifically.
        try {
          const probeReq = await fetch('http://api.ipify.org', {
            // @ts-expect-error undici dispatcher
            dispatcher: await (async () => {
              const { ProxyAgent } = await import('undici');
              return new ProxyAgent(bridgeUrl);
            })(),
            signal: AbortSignal.timeout(10_000),
          });
          // eslint-disable-next-line no-console
          console.log('[browserleaks] bridge HTTP probe HTTP', probeReq.status, 'IP:', await probeReq.text());
        } catch (e) {
          // eslint-disable-next-line no-console
          console.log('[browserleaks] bridge HTTP probe FAILED:', (e as Error).message);
        }
        proxyServer = bridgeUrl;
        proxyUsername = undefined;
        proxyPassword = undefined;
      } else {
        proxyServer = `${opts.proxy.type}://${opts.proxy.host}:${opts.proxy.port}`;
      }

      let browser: Browser;
      if (isSocks5Auth) {
        // eslint-disable-next-line no-console
        console.log('[browserleaks] launching ephemeral chromium with proxy', proxyServer);
        ephemeralBrowser = await chromium.launch({
          headless: true,
          proxy: { server: proxyServer },
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--no-sandbox',
          ],
        });
        // eslint-disable-next-line no-console
        console.log('[browserleaks] ephemeral chromium ready');
        browser = ephemeralBrowser;
      } else {
        browser = await getBrowser();
      }
      context = await browser.newContext({
        proxy: isSocks5Auth
          ? undefined // proxy already at launch level
          : { server: proxyServer, username: proxyUsername, password: proxyPassword },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        locale: 'en-US',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.goto(BROWSERLEAKS_URL, {
        waitUntil: 'networkidle',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      // Give JS-augmented panels (DNS leak, blacklists) a beat to populate.
      await page.waitForTimeout(2_500);

      // The whole extraction runs INSIDE the browser context. Playwright
      // stringifies this arrow function and injects it. No outer-scope refs.
      scrape = await page.evaluate((): BrowserleaksScrape => {
        const out: BrowserleaksScrape = {};

        const textOf = (el: Element | null | undefined): string =>
          (el?.textContent ?? '').trim().replace(/\s+/g, ' ');

        const findRowValue = (labelRegex: RegExp): string | undefined => {
          const rows = Array.from(document.querySelectorAll('tr'));
          for (const tr of rows) {
            const cells = tr.querySelectorAll('th, td');
            if (cells.length < 2) continue;
            const label = textOf(cells[0]);
            if (labelRegex.test(label)) return textOf(cells[1]);
          }
          return undefined;
        };

        out.ip = findRowValue(/^IP Address$/i) ?? findRowValue(/^Your IP$/i);
        out.hostname = findRowValue(/^Hostname$/i);

        const country = findRowValue(/^Country$/i);
        if (country) {
          const m = /\b([A-Z]{2})\b\s*$/.exec(country);
          out.country = m ? m[1] : undefined;
          out.country_full = country.replace(/\s+[A-Z]{2}\s*$/, '').trim() || undefined;
        }
        out.region = findRowValue(/^(Region|State)$/i);
        out.city = findRowValue(/^City$/i);
        out.isp = findRowValue(/^ISP$/i);
        out.organization = findRowValue(/^Organization$/i);

        const asnText = findRowValue(/^(AS|ASN|AS Number)$/i);
        if (asnText) {
          const m = /AS?(\d+)/i.exec(asnText);
          if (m) out.asn = Number(m[1]);
        }

        const yesRe = /\byes\b/i;
        const torVal = findRowValue(/^Tor( Exit Node)?$/i);
        out.is_tor = torVal ? yesRe.test(torVal) : undefined;
        const proxyVal = findRowValue(/^(Web )?Proxy$/i);
        out.is_proxy = proxyVal ? yesRe.test(proxyVal) : undefined;
        const vpnVal = findRowValue(/^VPN$/i);
        out.is_vpn = vpnVal ? yesRe.test(vpnVal) : undefined;
        const hostingVal = findRowValue(/^(Hosting|Datacenter)$/i);
        out.is_hosting = hostingVal ? yesRe.test(hostingVal) : undefined;
        out.proxy_type =
          findRowValue(/^(Connection Type|Usage Type)$/i) ?? findRowValue(/^Type$/i);

        // Blacklists section
        const blacklistSection = Array.from(document.querySelectorAll('h2, h3, h4')).find(
          (h) => /blacklist/i.test(h.textContent ?? ''),
        );
        if (blacklistSection) {
          const container =
            blacklistSection.parentElement?.querySelector('table') ??
            blacklistSection.nextElementSibling;
          const hits: string[] = [];
          const rows = container?.querySelectorAll('tr') ?? [];
          rows.forEach((tr) => {
            const cells = tr.querySelectorAll('th, td');
            if (cells.length >= 2) {
              const name = textOf(cells[0]);
              const status = textOf(cells[1]);
              if (/listed|fail|positive/i.test(status) && name && !/test|check/i.test(name)) {
                hits.push(name);
              }
            }
          });
          out.blacklists = hits;
        }

        // DNS leak section
        const dnsSection = Array.from(document.querySelectorAll('h2, h3, h4')).find((h) =>
          /DNS/i.test(h.textContent ?? ''),
        );
        if (dnsSection) {
          const ips: Array<{ ip: string; country?: string; isp?: string }> = [];
          const container = dnsSection.parentElement?.querySelector('table');
          container?.querySelectorAll('tr').forEach((tr) => {
            const cells = tr.querySelectorAll('th, td');
            if (cells.length >= 1) {
              const ipText = textOf(cells[0]);
              const ipMatch = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(ipText);
              if (ipMatch && ipMatch[1]) {
                ips.push({
                  ip: ipMatch[1],
                  country: cells[1] ? textOf(cells[1]) : undefined,
                  isp: cells[2] ? textOf(cells[2]) : undefined,
                });
              }
            }
          });
          out.dns_servers = ips;
          if (ips.length > 0 && out.country) {
            out.dns_leak_detected = ips.some(
              (d) => d.country && !d.country.toUpperCase().includes(out.country!.toUpperCase()),
            );
          }
        }

        // WebRTC section
        const webrtcSection = Array.from(document.querySelectorAll('h2, h3, h4')).find((h) =>
          /WebRTC/i.test(h.textContent ?? ''),
        );
        if (webrtcSection) {
          const pub = findRowValue(/Public IP/i);
          const local = findRowValue(/Local IP/i);
          out.webrtc_public_ip = pub;
          out.webrtc_local_ips = local ? local.split(/[\s,]+/).filter((s) => /\d/.test(s)) : [];
          const privateRe = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;
          const localLeak = (out.webrtc_local_ips ?? []).some(
            (lip) => lip && !privateRe.test(lip),
          );
          const publicLeak = !!pub && !!out.ip && pub !== out.ip;
          out.webrtc_leak_detected = localLeak || publicLeak;
        }

        out.raw_text = (document.body.innerText ?? '').slice(0, 5_000);
        return out;
      });
    } catch (err) {
      errors.push(`browserleaks scrape failed: ${(err as Error).message}`);
    } finally {
      await context?.close().catch(() => {});
      // Ephemeral browser launched for SOCKS5+auth — close it.
      if (ephemeralBrowser) {
        await ephemeralBrowser.close().catch(() => {});
      }
      if (bridgeUrl) {
        try {
          const { closeAnonymizedProxy } = await import('proxy-chain');
          await closeAnonymizedProxy(bridgeUrl, true);
        } catch {
          // bridge teardown best-effort
        }
      }
    }

    if (Object.keys(scrape).length === 0 && errors.length === 0) {
      errors.push('browserleaks returned no parseable data');
    }

    const failures: string[] = [...errors];
    if (scrape.is_tor) failures.push('Tor exit node detected');
    if (scrape.is_vpn) failures.push('VPN flag set (datacenter VPN)');
    if (scrape.is_hosting) failures.push('Hosting / datacenter IP detected');
    if (scrape.dns_leak_detected) failures.push('DNS leak detected');
    if (scrape.webrtc_leak_detected) failures.push('WebRTC leak detected (local IP visible)');
    if ((scrape.blacklists?.length ?? 0) > 0) {
      failures.push(`Blacklisted on ${scrape.blacklists!.length} list(s)`);
    }
    if (
      opts.expectedCountry &&
      scrape.country &&
      scrape.country.toUpperCase() !== opts.expectedCountry.toUpperCase()
    ) {
      failures.push(
        `Geo mismatch: expected ${opts.expectedCountry}, browserleaks shows ${scrape.country}`,
      );
    }

    const signals: IpReputationSignals = {
      blacklisted_on: scrape.blacklists ?? [],
      geo_country: scrape.country,
      geo_matches_target: opts.expectedCountry
        ? scrape.country?.toUpperCase() === opts.expectedCountry.toUpperCase()
        : undefined,
      asn: scrape.asn,
      asn_org: scrape.organization ?? scrape.isp,
      is_residential: scrape.proxy_type
        ? /mobile|cellular|residential|broadband/i.test(scrape.proxy_type)
        : undefined,
      dns_leak: scrape.dns_leak_detected,
      webrtc_leak: scrape.webrtc_leak_detected,
      notes: failures,
    };

    return {
      provider: this.name,
      ip: scrape.ip ?? ip,
      clean: failures.length === 0,
      score: computeScore(scrape, failures.length),
      signals,
      raw: scrape,
      checked_at: startedAt,
    };
  }
}

function computeScore(s: BrowserleaksScrape, failureCount: number): number {
  let score = 100;
  if (s.is_tor) score -= 60;
  if (s.is_vpn) score -= 50;
  if (s.is_hosting) score -= 70;
  if (s.dns_leak_detected) score -= 25;
  if (s.webrtc_leak_detected) score -= 35;
  score -= (s.blacklists?.length ?? 0) * 10;
  if (failureCount > 0 && score === 100) score = 50; // safety net
  return Math.max(0, Math.min(100, score));
}
