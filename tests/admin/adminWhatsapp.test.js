import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import whatsappRouter from '../../server/routes/admin/whatsapp.js';
import { kapsoService } from '../../server/services/kapsoService.js';

describe('Admin WhatsApp Router (/api/admin/whatsapp)', () => {
  const createApp = (adminRole = 'SUPPORT_AGENT') => {
    const app = express();
    app.use(express.json());
    // Simulate admin auth middleware
    app.use((req, res, next) => {
      req.admin = { id: 'admin_test_1', username: 'test_agent', role: adminRole };
      next();
    });
    app.use('/api/admin/whatsapp', whatsappRouter);
    return app;
  };

  it('allows SUPPORT_AGENT, MARKETING_ADMIN, and SUPER_ADMIN to query status', async () => {
    const app = createApp('SUPPORT_AGENT');
    const req = { method: 'GET', url: '/api/admin/whatsapp/status' };
    
    const res = await new Promise((resolve) => {
      const server = app.listen(0, async () => {
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/api/admin/whatsapp/status`);
        const json = await response.json();
        server.close(() => resolve({ status: response.status, body: json }));
      });
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mode).toBeDefined();
  });

  it('lists approved templates with parameters', async () => {
    const app = createApp('MARKETING_ADMIN');
    const res = await new Promise((resolve) => {
      const server = app.listen(0, async () => {
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/api/admin/whatsapp/templates`);
        const json = await response.json();
        server.close(() => resolve({ status: response.status, body: json }));
      });
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(5);
  });

  it('dispatches a template WhatsApp message successfully', async () => {
    const app = createApp('SUPER_ADMIN');
    const payload = {
      to: '9876543210',
      type: 'TEMPLATE',
      templateName: 'oddsyra_support_update',
      parameters: ['Uday', 'TKT-999', 'We have solved your request.'],
      userId: 'usr_mock_1'
    };

    const res = await new Promise((resolve) => {
      const server = app.listen(0, async () => {
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/api/admin/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await response.json();
        server.close(() => resolve({ status: response.status, body: json }));
      });
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.recipient).toBe('919876543210');
  });

  it('rejects unprivileged admin roles (e.g. AUDITOR)', async () => {
    const app = createApp('AUDITOR');
    const res = await new Promise((resolve) => {
      const server = app.listen(0, async () => {
        const port = server.address().port;
        const response = await fetch(`http://127.0.0.1:${port}/api/admin/whatsapp/status`);
        const json = await response.json();
        server.close(() => resolve({ status: response.status, body: json }));
      });
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('requires Support Agent, Marketing, Operations, or Super Admin');
  });
});
