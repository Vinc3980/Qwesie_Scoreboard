import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../styles/index.css', import.meta.url), 'utf8');
const tailwind = readFileSync(new URL('../../tailwind.config.js', import.meta.url), 'utf8');

/** Canonical token names (without the --app- prefix) required in both themes. */
const REQUIRED_TOKENS = [
  'background',
  'foreground',
  'surface',
  'surface-raised',
  'surface-sunken',
  'surface-alt',
  'muted',
  'subtle',
  'border',
  'accent',
  'accent-hover',
  'accent-foreground',
  'danger',
  'danger-subtle',
  'focus',
];

const SOLID_TOKENS = REQUIRED_TOKENS.filter((token) => !token.endsWith('-subtle'));

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing ${selector} block`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n  }', open);
  return css.slice(open + 1, close);
}

describe('theme token source of truth', () => {
  const light = block(':root {');
  const dark = block('.dark {');

  it.each(REQUIRED_TOKENS)('defines --app-%s in both themes', (token) => {
    expect(light, `light theme missing --app-${token}`).toMatch(
      new RegExp(`--app-${token}:\\s*[^;]+;`)
    );
    expect(dark, `dark theme missing --app-${token}`).toMatch(
      new RegExp(`--app-${token}:\\s*[^;]+;`)
    );
  });

  it.each(SOLID_TOKENS)('defines an RGB mirror for --app-%s', (token) => {
    expect(light).toMatch(new RegExp(`--app-${token}-rgb:\\s*\\d+ \\d+ \\d+;`));
    expect(dark).toMatch(new RegExp(`--app-${token}-rgb:\\s*\\d+ \\d+ \\d+;`));
  });

  it('maps Tailwind semantic colours to the canonical variables', () => {
    expect(tailwind).toContain('rgb(var(--app-background-rgb) / <alpha-value>)');
    expect(tailwind).toContain('rgb(var(--app-foreground-rgb) / <alpha-value>)');
    expect(tailwind).toContain('rgb(var(--app-accent-foreground-rgb) / <alpha-value>)');
    expect(tailwind).toContain('rgb(var(--app-focus-rgb) / <alpha-value>)');
    expect(tailwind).toContain('rgb(var(--app-danger-rgb) / <alpha-value>)');
    expect(tailwind).toContain('var(--app-danger-subtle)');
  });
});
