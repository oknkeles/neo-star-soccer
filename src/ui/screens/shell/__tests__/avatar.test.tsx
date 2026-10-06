import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Appearance, Kit } from '../../../../core/types';
import Avatar, { BEARD_STYLES, FACE_COUNT, HAIR_STYLES, SKIN_TONES, faceHeight, faceIndex } from '../../../components/Avatar';

const base: Appearance = { skin: 2, hairStyle: 2, hairColor: '#2b1d14', beard: 0, boots: '#ffffff', height: faceHeight(0) };
const kit: Kit = { primary: '#c8102e', secondary: '#ffffff', style: 'stripes' };
const render = (a: Partial<Appearance> = {}, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(Avatar, { appearance: { ...base, ...a }, kit, ...props }));

describe('Avatar', () => {
  it('offers six skin tones, eight hair styles and four beard styles', () => {
    expect(SKIN_TONES).toHaveLength(6);
    expect(HAIR_STYLES).toBe(8);
    expect(BEARD_STYLES).toBe(4);
    expect(FACE_COUNT).toBe(6);
  });

  it('renders a clean svg for every skin / hair / beard combination', () => {
    for (let skin = 0; skin < 6; skin++) {
      for (let hairStyle = 0; hairStyle < 8; hairStyle++) {
        for (let beard = 0; beard < 4; beard++) {
          const html = render({ skin, hairStyle, beard });
          expect(html).toContain('<svg');
          expect(html).not.toMatch(/NaN|undefined|null/);
        }
      }
    }
  });

  it('draws different portraits for different looks', () => {
    const variants = new Set<string>();
    for (let hairStyle = 0; hairStyle < 8; hairStyle++) variants.add(render({ hairStyle }));
    expect(variants.size).toBe(8);
    expect(render({ skin: 0 })).not.toBe(render({ skin: 5 }));
    expect(render({ beard: 0 })).not.toBe(render({ beard: 3 }));
    expect(render({ hairColor: '#d8b36a' })).not.toBe(render({ hairColor: '#15110e' }));
  });

  it('uses the kit colours for the shirt and reacts to mood', () => {
    expect(render()).toContain('#c8102e');
    const moods = new Set(['neutral', 'happy', 'sad', 'angry', 'shocked'].map((mood) => render({}, { mood })));
    expect(moods.size).toBeGreaterThan(2);
  });

  it('scales from 24 to 160 px', () => {
    for (const size of [24, 48, 96, 160]) {
      const html = render({}, { size });
      expect(html).toContain(`${size}`);
    }
  });

  it('keeps the face index stable through the height round trip', () => {
    for (let k = 0; k < FACE_COUNT; k++) expect(faceIndex({ height: faceHeight(k) })).toBe(k);
    expect(faceIndex({ height: 187 })).toBeGreaterThanOrEqual(0);
    expect(faceIndex({ height: 187 })).toBeLessThan(FACE_COUNT);
  });

  it('renders without a kit', () => {
    expect(renderToStaticMarkup(createElement(Avatar, { appearance: base }))).toContain('<svg');
  });
});
