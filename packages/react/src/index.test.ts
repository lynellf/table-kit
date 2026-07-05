import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('@lynellf/tablekit-react', () => {
  it('exports a version string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
