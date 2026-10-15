import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';

vi.mock('../../lib/productConfig.mjs', () => ({
  getProductConfiguration: vi.fn(),
}));
vi.mock('../../lib/softwareModeCookie.mjs', () => ({
  setSoftwareModeCookie: vi.fn(),
}));

const { getProductConfiguration } = await import('../../lib/productConfig.mjs');
const { default: router } = await import('../../server/routes/products.js');

function get(path) {
  const app = express();
  app.use('/api/config', router);
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const { port } = server.address();
      http.get({ port, path }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: JSON.parse(body || '{}') });
        });
      }).on('error', reject);
    });
  });
}

describe('GET /api/config/products', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns the real flags with 200', async () => {
    getProductConfiguration.mockResolvedValue({
      walletEnabled: true, bettingEnabled: true, pgReviewMode: false, softwarePlatformEnabled: false,
    });
    const { status, body } = await get('/api/config/products');
    expect(status).toBe(200);
    expect(body.bettingEnabled).toBe(true);
    expect(body.softwarePlatformEnabled).toBe(false);
  });

  it('returns 503 (not a fake all-false 200) when the config cannot be read', async () => {
    getProductConfiguration.mockRejectedValue(new Error('db down'));
    const { status, body } = await get('/api/config/products');
    expect(status).toBe(503);
    expect(body.note).toBe('unavailable');
    expect(body).not.toHaveProperty('bettingEnabled');
  });
});
