import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '../../src/index.js';

describe('package entry', () => {
  it('exports the package name constant', () => {
    expect(PACKAGE_NAME).toBe('pi-smart-router');
  });
});
