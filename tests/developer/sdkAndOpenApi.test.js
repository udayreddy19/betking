import { describe, it, expect } from 'vitest';
import { generateOpenApiSpec } from '../../lib/sdkGenerator.mjs';

describe('Phase 13 OpenAPI Specification Tests', () => {
  it('generateOpenApiSpec should return valid OpenAPI 3.0.0 schema', () => {
    const spec = generateOpenApiSpec();
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info.title).toContain('BetKing');
    expect(spec.paths).toBeDefined();
  });
});
