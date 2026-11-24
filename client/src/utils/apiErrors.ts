export type FormattedIssue = { path: string; message: string };

function isRecord(v: any): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function titleCase(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function normalizeIssues(input: any): FormattedIssue[] {
  const issues: FormattedIssue[] = [];
  const push = (path: any, message: any) => {
    if (!message) return;
    const p = Array.isArray(path) ? path.join('.') : (path == null ? '' : String(path));
    issues.push({ path: p, message: String(message) });
  };

  if (!input) return issues;

  // Zod issues array: [{ path: [...], message, code, ... }]
  if (Array.isArray(input)) {
    for (const it of input) {
      if (isRecord(it)) push(it.path ?? it.field ?? '', it.message ?? it.msg ?? it.error);
      else if (typeof it === 'string') push('', it);
    }
    return issues;
  }

  // Server envelope shapes
  if (isRecord(input)) {
    if (Array.isArray(input.issues)) return normalizeIssues(input.issues);
    if (Array.isArray(input.details)) return normalizeIssues(input.details);
    if (isRecord(input.error)) {
      if (Array.isArray(input.error.issues)) return normalizeIssues(input.error.issues);
      if (Array.isArray(input.error.details)) return normalizeIssues(input.error.details);
      if (input.error.message && !input.error.issues && !input.error.details) push('', input.error.message);
    }
    // Zod flattened-like { fieldErrors, formErrors }
    if (isRecord(input.fieldErrors)) {
      for (const [k, v] of Object.entries(input.fieldErrors)) {
        if (Array.isArray(v)) v.forEach(m => push(k, m));
      }
    }
    if (Array.isArray(input.formErrors)) input.formErrors.forEach(m => push('', m));
    if (issues.length === 0 && typeof input.message === 'string') push('', input.message);
  } else if (typeof input === 'string') {
    // try parse JSON string once
    const t = input.trim();
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
      try { return normalizeIssues(JSON.parse(t)); } catch {}
    }
    push('', input);
  }

  return issues;
}

function friendlyField(path: string) {
  if (!path) return '';
  // players.0.jerseyNumber -> jersey number (row handled separately)
  const parts = path.split('.').filter(Boolean);
  const last = parts[parts.length - 1] || path;
  const map: Record<string, string> = {
    jerseyNumber: 'jersey number',
    name: 'name',
    position: 'position',
    isCaptain: 'captain',
    isLibero: 'libero',
    players: 'players',
  };
  return map[last] || last.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
}

function friendlyMessage(issue: FormattedIssue) {
  const msg = issue.message || 'Invalid value';
  // make common zod messages nicer
  if (/Number must be greater than or equal to 1/i.test(msg) && issue.path.endsWith('jerseyNumber')) {
    return 'jersey number must be between 1 and 99';
  }
  if (/Number must be less than or equal to 99/i.test(msg) && issue.path.endsWith('jerseyNumber')) {
    return 'jersey number must be between 1 and 99';
  }
  if (/Expected number, received string/i.test(msg) && issue.path.endsWith('jerseyNumber')) {
    return 'jersey number must be a number between 1 and 99';
  }
  if (/Required/i.test(msg) && issue.path.endsWith('name')) return 'name is required';
  return msg;
}

export function formatApiError(error: any, context?: { sideLabel?: string }): string {
  if (!error) return 'An unexpected error occurred';

  // If it's an Error we may have attached structured info
  const attached = (error && (error.issues || error.details || error.responseBody || error.data)) || null;
  const body = error?.response?.data ?? error?.body ?? attached;

  let issues = normalizeIssues(error?.issues || error?.details);
  if (issues.length === 0) issues = normalizeIssues(body);
  if (issues.length === 0) issues = normalizeIssues(error);
  if (issues.length === 0) issues = normalizeIssues(error?.message);

  const sideLabel = context?.sideLabel ? `${context.sideLabel} roster` : 'Request';

  if (issues.length > 0) {
    // Special-case roster rows: players.<index>.<field>
    const rosterIssues = issues
      .map((it) => {
        const m = it.path.match(/^players\.(\d+)(?:\.(.+))?$/);
        if (m) {
          const rowNum = Number(m[1]) + 1;
          const field = friendlyField(m[2] || '');
          const msg = friendlyMessage(it);
          return `${sideLabel}, row ${rowNum}${field ? `: ${field}` : ''} ${msg}`.replace(/\s+/g, ' ').trim();
        }
        return null;
      })
      .filter(Boolean) as string[];
    if (rosterIssues.length > 0) {
      return rosterIssues.slice(0, 3).join(' | ') + (rosterIssues.length > 3 ? ` (+${rosterIssues.length - 3} more)` : '');
    }

    const generic = issues.slice(0, 3).map((it) => {
      const field = friendlyField(it.path);
      const msg = friendlyMessage(it);
      return field ? `${titleCase(field)}: ${msg}` : msg;
    });
    return generic.join(' | ') + (issues.length > 3 ? ` (+${issues.length - 3} more)` : '');
  }

  const msg = error?.message || (typeof body === 'string' ? body : body?.error?.message || body?.message);
  if (typeof msg === 'string' && msg.trim()) {
    // never leak raw JSON blobs
    const t = msg.trim();
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
      const parsed = normalizeIssues(t);
      if (parsed.length) return formatApiError({ issues: parsed }, context);
      return 'Request failed. Please check the highlighted fields and try again.';
    }
    return t;
  }

  return 'Request failed. Please try again.';
}

export function getApiIssues(error: any): FormattedIssue[] {
  if (!error) return [];
  const body = error?.response?.data ?? error?.body ?? error?.responseBody ?? error?.data;
  return [
    ...normalizeIssues(error?.issues),
    ...normalizeIssues(error?.details),
    ...normalizeIssues(body),
  ].filter((v, i, arr) => arr.findIndex(x => x.path === v.path && x.message === v.message) === i);
}
