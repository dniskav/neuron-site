import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCREENS } from '../src/data/nav';

const read = (f: string): string => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

describe('Orden de las pantallas', () => {
  it('Equipo es la 04 y Paleta la 05; Colores ya no está en la navegación; Snake, Juegos e Historia siguen en 06, 07 y 08', () => {
    expect(SCREENS.map((s) => s.id)).toEqual(['inicio', 'neurona', 'ensenale', 'equipo', 'paleta', 'snake', 'juegos', 'historia']);
    expect((SCREENS.map((s) => s.id) as string[]).includes('colores')).toBe(false);
    expect(SCREENS.findIndex((s) => s.id === 'equipo') + 1).toBe(4);
    expect(SCREENS.findIndex((s) => s.id === 'paleta') + 1).toBe(5);
  });
  it('la página compone las pantallas en el mismo orden', () => {
    const home = read('src/components/Home.astro'), order = [...home.matchAll(/^<(\w+) \/>$/gm)].map((m) => m[1].toLowerCase());
    expect(order).toEqual(['hero', 'neurona', 'ensenale', 'equipo', 'paleta', 'snake', 'juegos', 'historia']);
  });
  it('las etiquetas de cada pantalla llevan su número', () => {
    expect(read('src/components/screens/Ensenale.astro')).toContain('03 · ');
    expect(read('src/components/screens/Equipo.astro')).toContain('04 · en equipo');
    expect(read('src/components/screens/Paleta.astro')).toContain('05 · ');
    expect(read('src/components/screens/Snake.astro')).toContain('06 · ');
    expect(read('src/components/screens/Juegos.astro')).toContain('07');
    expect(read('src/components/screens/Historia.astro')).toContain('08');
  });
  it('el texto de Equipo enlaza con Enséñale (ya no con la paleta), la paleta recuerda Equipo, y Colores sigue en disco pero fuera de la página', () => {
    expect(read('src/components/screens/Equipo.astro')).toContain('En Enséñale, una neurona sola bastaba');
    expect(read('src/components/screens/Equipo.astro')).not.toContain('paredes');
    expect(read('src/components/screens/Paleta.astro')).toContain('como ya viste en Equipo');
    expect(read('src/components/screens/Equipo.astro')).not.toContain('neurona naranja');
    expect(read('src/components/Home.astro')).not.toMatch(/Colores/);
    expect(read('src/components/screens/Colores.astro')).toContain('04 · ponerle nombre');
  });
});
