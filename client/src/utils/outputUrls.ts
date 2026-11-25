import { systemApi } from '../services/api.js';

const IFACE_KEY = 'qwesie.output.lanInterface';

export type OutputKind = 'scorebug' | 'graphics' | 'all';

export function getRememberedLanInterface(): string | null {
  try { return localStorage.getItem(IFACE_KEY); } catch { return null; }
}
export function rememberLanInterface(ip: string) {
  try { localStorage.setItem(IFACE_KEY, ip); } catch {}
}

export function pickLan(lanIpv4: string[], preferred?: string | null) {
  if (preferred && lanIpv4.includes(preferred)) return preferred;
  return lanIpv4[0] || null;
}

export function isLocalHostLike(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function isPrivateLanHost(host: string) {
  if (!host) return false;
  if (isLocalHostLike(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export function computeOutputBaseUrl(params: {
  currentHost: string;
  currentPort?: string | number | null;
  protocol?: string;
  serverPort?: number;
  lanIpv4?: string[];
  preferredLan?: string | null;
  forceLan?: boolean;
  devServerPort?: number;
}) {
  const lan = pickLan(params.lanIpv4 || [], params.preferredLan ?? null);
  const currentHost = params.currentHost || 'localhost';
  const proto = params.protocol || 'http:';
  const currentPort = params.currentPort != null && params.currentPort !== '' ? String(params.currentPort) : '';
  const devPort = String(params.devServerPort || 5173);
  const isDevPort = currentPort === devPort || currentPort === '5173';
  const serverPortNum = Number(params.serverPort || 0) || undefined;
  const isLocal = isLocalHostLike(currentHost);
  // A public deployment (e.g. https://app.onrender.com) has no LAN equivalent:
  // never swap to the container's private IP or append the internal server port.
  const isPublicHost = !isPrivateLanHost(currentHost);
  const forceLan = params.forceLan ?? (isDevPort || isLocal);

  // In dev the Vite dev server listens on all interfaces and proxies /api and /socket.io,
  // so OBS-facing URLs must use the LAN IP with the Vite dev port. In production they
  // use the server port (same origin serving the built client). No hard-coded port 5000.
  let host = currentHost;
  if (lan && !isPublicHost && (forceLan || isLocal)) host = lan;

  let effectivePort = '';
  if (isDevPort) {
    effectivePort = devPort;
  } else if (currentPort) {
    effectivePort = currentPort;
  } else if (serverPortNum && !isPublicHost && proto === 'http:') {
    effectivePort = String(serverPortNum);
  }

  return {
    baseUrl: `${proto}//${host}${effectivePort ? `:${effectivePort}` : ''}`,
    selectedLan: lan,
    isDevUi: isDevPort,
  };
}

export async function resolveOutputBaseUrl(opts?: { preferredLan?: string | null; forceLan?: boolean }) {
  const info = await systemApi.info().catch(() => null);
  const remembered = opts?.preferredLan ?? getRememberedLanInterface();
  const devServerPort = Number((import.meta as any).env?.VITE_DEV_SERVER_PORT || 5173);
  const serverPort = info?.port;
  const computed = computeOutputBaseUrl({
    currentHost: window.location.hostname,
    currentPort: window.location.port,
    protocol: window.location.protocol || 'http:',
    serverPort,
    lanIpv4: info?.lanIpv4 || [],
    preferredLan: remembered,
    forceLan: opts?.forceLan,
    devServerPort,
  });
  if (computed.selectedLan) rememberLanInterface(computed.selectedLan);
  return {
    baseUrl: computed.baseUrl,
    lanIpv4: info?.lanIpv4 || [],
    selectedLan: computed.selectedLan,
    port: serverPort,
    info,
    isDevUi: !!computed.isDevUi,
  };
}

export function buildCourtOutputUrl(baseUrl: string, court: string, kind: OutputKind) {
  const c = encodeURIComponent(String(court || '1'));
  return `${baseUrl}/out/court/${c}/${kind}`;
}

export const OBS_SETTINGS = {
  width: 1920, height: 1080, fps: 30,
  shutdownWhenNotVisible: false,
  refreshWhenActive: false,
  customCss: '',
};

export function obsSettingsText(url: string) {
  return [
    `URL: ${url}`,
    `Width: ${OBS_SETTINGS.width}`,
    `Height: ${OBS_SETTINGS.height}`,
    `FPS: ${OBS_SETTINGS.fps}`,
    `Shutdown source when not visible: Off`,
    `Refresh browser when scene becomes active: Off`,
    `Custom CSS: (blank)`,
  ].join('\n');
}
