import { describe, expect, it } from 'vitest';
import { hasKey } from '../../../../core/i18n';
import { SCREENS, FULLSCREEN } from '../../index';
import { NAV, NAV_BY_ROUTE, NAV_MAIN, NAV_MORE, PRIMARY_MOBILE } from '../nav';
import '../strings';

describe('navigation config', () => {
  it('maps every nav item to a screen with a localized label', () => {
    for (const n of NAV) {
      expect(SCREENS[n.route], n.route).toBeDefined();
      expect(hasKey(n.label), n.label).toBe(true);
    }
  });

  it('keeps nav routes unique and chrome-bearing (never full-screen flows)', () => {
    const routes = NAV.map((n) => n.route);
    expect(new Set(routes).size).toBe(routes.length);
    for (const r of routes) expect(FULLSCREEN.includes(r), r).toBe(false);
  });

  it('pins a mobile bar of four tabs, leaving the rest for "More"', () => {
    expect(PRIMARY_MOBILE).toHaveLength(4);
    for (const r of PRIMARY_MOBILE) expect(NAV_BY_ROUTE[r]).toBeDefined();
    expect(NAV.length - PRIMARY_MOBILE.length).toBeGreaterThanOrEqual(8);
  });

  it('keeps the sidebar to seven essentials plus a "Daha fazla" group of five', () => {
    expect(NAV_MAIN.map((n) => n.route)).toEqual(['hub', 'inbox', 'training', 'transfers', 'competitions', 'career', 'people']);
    expect(NAV_MORE.map((n) => n.route)).toEqual(['lifestyle', 'news', 'social', 'club', 'settings']);
  });

  it('lists the twelve destinations the brief asks for', () => {
    expect(NAV.map((n) => n.route).sort()).toEqual(
      ['career', 'club', 'competitions', 'hub', 'inbox', 'lifestyle', 'news', 'people', 'settings', 'social', 'training', 'transfers'],
    );
  });
});
