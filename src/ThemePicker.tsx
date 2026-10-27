import { Palette } from 'lucide-react';
import { themes, type Theme } from './theme';

export default function ThemePicker({ value, onChange }: { value: Theme; onChange: (theme: Theme) => void }) {
  return <label className="theme-picker" title={themes[value].description}>
    <Palette size={14} aria-hidden="true" />
    <span className="theme-picker-label">Theme</span>
    <span className="theme-swatch" data-palette={value} aria-hidden="true" />
    <select aria-label="Color theme" value={value} onChange={event => onChange(event.target.value as Theme)}>
      {Object.entries(themes).map(([id, theme]) => <option key={id} value={id}>{theme.name}</option>)}
    </select>
  </label>;
}
