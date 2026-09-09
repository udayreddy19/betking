import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import {
  ADMIN_THEMES,
} from '../../src/pages/Admin/context/AdminThemeContext.jsx';

describe('Admin Theme Definitions & Mode Logic', () => {
  it('defines valid light, dark, and auto modes for all ADMIN_THEMES', () => {
    expect(ADMIN_THEMES.length).toBeGreaterThanOrEqual(10);
    const validModes = new Set(['auto', 'light', 'dark']);
    const ids = new Set();

    for (const t of ADMIN_THEMES) {
      expect(validModes.has(t.mode)).toBe(true);
      expect(t.id).toBeDefined();
      expect(t.label).toBeDefined();
      expect(t.description).toBeDefined();
      expect(Array.isArray(t.swatches)).toBe(true);
      expect(t.swatches.length).toBeGreaterThanOrEqual(3);
      ids.add(t.id);
    }

    // Verify key themes exist
    expect(ids.has('match')).toBe(true);
    expect(ids.has('forest')).toBe(true);
    expect(ids.has('slate')).toBe(true);
    expect(ids.has('navy')).toBe(true);
    expect(ids.has('mist')).toBe(true);
    expect(ids.has('glacier')).toBe(true);

    const lightThemes = ADMIN_THEMES.filter((t) => t.mode === 'light');
    const darkThemes = ADMIN_THEMES.filter((t) => t.mode === 'dark');
    expect(lightThemes.length).toBeGreaterThanOrEqual(3);
    expect(darkThemes.length).toBeGreaterThanOrEqual(6);
  });

  it('correctly associates light and dark modes with theme IDs', () => {
    const forest = ADMIN_THEMES.find((t) => t.id === 'forest');
    const slate = ADMIN_THEMES.find((t) => t.id === 'slate');
    const match = ADMIN_THEMES.find((t) => t.id === 'match');

    expect(forest.mode).toBe('light');
    expect(slate.mode).toBe('dark');
    expect(match.mode).toBe('auto');
  });

  it('renders AdminThemeToggle and AdminThemePicker without crashing in SSR', async () => {
    const { default: AdminThemeToggle } = await import('../../src/pages/Admin/components/AdminThemeToggle.jsx');
    const { default: AdminThemePicker } = await import('../../src/pages/Admin/components/AdminThemePicker.jsx');
    const { AdminThemeProvider } = await import('../../src/pages/Admin/context/AdminThemeContext.jsx');

    const html = renderToString(
      <AdminThemeProvider>
        <div className="admin-topbar__theme-cluster">
          <AdminThemeToggle />
          <AdminThemePicker />
        </div>
      </AdminThemeProvider>
    );

    expect(html).toContain('admin-theme-toggle-btn');
    expect(html).toContain('admin-theme-picker');
    expect(html).toContain('Match site');
  });
});
