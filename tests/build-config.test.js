import { afterEach, describe, expect, it, vi } from 'vitest';
import config from '../vite.config.js';

afterEach(() => vi.unstubAllEnvs());

describe('production cloud configuration', () => {
  it('loads the configured public production endpoint without shell variables', () => {
    vi.stubEnv('VITE_CONVEX_URL', undefined);
    expect(() => config({ command: 'build', mode: 'production' })).not.toThrow();
  });

  it('stops an explicitly empty deployment override before bundling', () => {
    vi.stubEnv('VITE_CONVEX_URL', '');
    expect(() => config({ command: 'build', mode: 'production' })).toThrow('VITE_CONVEX_URL is missing');
  });

  it.each(['not-a-url', 'javascript:alert(1)'])('rejects invalid endpoint %s', (url) => {
    vi.stubEnv('VITE_CONVEX_URL', url);
    expect(() => config({ command: 'build', mode: 'production' })).toThrow('absolute HTTP(S) URL');
  });
});
