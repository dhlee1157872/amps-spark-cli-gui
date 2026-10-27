export const themes = {
  moss: { name: 'Moss', description: 'Charcoal & soft green', canvas: '#101211' },
  midnight: { name: 'Midnight', description: 'Blue & near-black', canvas: '#090d14' },
  graphite: { name: 'Graphite', description: 'Neutral charcoal & silver', canvas: '#101112' },
} as const;
export type Theme = keyof typeof themes;

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem('spark.theme');
    if (saved && Object.hasOwn(themes, saved)) return saved as Theme;
  } catch { /* The default also works when browser storage is disabled. */ }
  return 'moss';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themes[theme].canvas);
}
