import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, Radio, RotateCcw } from 'lucide-react';
import { matchingTopics } from '../shared/topics';
import type { TopicDiscovery } from './useTopicDiscovery';

export default function TopicInput({ value, onChange, discovery }: { value: string; onChange: (value: string) => void; discovery: TopicDiscovery }) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  const matches = matchingTopics(discovery.topics, value);
  const visible = matches.slice(0, 50);
  const expanded = open && visible.length > 0;
  useEffect(() => { setHighlighted(-1); }, [value, discovery.topics]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [highlighted]);
  function select(topic: string) { onChange(topic); setOpen(false); setHighlighted(-1); }
  const message = !discovery.enabled ? 'Enter any topic name.'
    : discovery.loading ? 'Loading topic names…'
    : discovery.error ? `${discovery.error} Manual entry is still available.`
    : !discovery.topics.length ? 'No SOW topics listed. Enter any topic name.'
    : value && !matches.length ? 'No matching suggestions. You can use this topic name.'
    : `${discovery.topics.length} SOW topic names available. You can also enter your own.`;
  return <div className="field topic-field">
    <div className="topic-label"><label htmlFor={id}>Topic <small>Required</small></label>{discovery.enabled && <button type="button" className="topic-refresh" aria-label="Refresh topic names" title="Refresh topic names" disabled={discovery.loading} onClick={discovery.refresh}>{discovery.loading ? <LoaderCircle size={12} className="spin" /> : <RotateCcw size={12} />} Refresh</button>}</div>
    <div className="topic-combobox">
      <input id={id} required value={value} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId} aria-describedby={`${id}-hint`} aria-activedescendant={expanded && highlighted >= 0 && visible[highlighted] ? `${id}-option-${highlighted}` : undefined} autoComplete="off" spellCheck={false} placeholder="e.g. orders" onChange={event => { onChange(event.target.value); setOpen(true); setHighlighted(-1); }} onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setHighlighted(-1); }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (!visible.length) return;
          event.preventDefault(); setOpen(true);
          setHighlighted(index => event.key === 'ArrowDown' ? Math.min(index + 1, visible.length - 1) : index <= 0 ? visible.length - 1 : index - 1);
        } else if (event.key === 'Enter' && expanded && highlighted >= 0 && visible[highlighted]) {
          event.preventDefault(); select(visible[highlighted]);
        } else if (event.key === 'Escape' && open) {
          event.preventDefault(); setOpen(false); setHighlighted(-1);
        }
      }} />
      {expanded && <div className="topic-dropdown"><div className="topic-dropdown-heading"><Radio size={11} /> SOW TOPICS <span>{matches.length} matching</span></div><div ref={list} id={listId} role="listbox" aria-label="Available topic names" className="topic-options">{visible.map((topic, index) => <div id={`${id}-option-${index}`} role="option" aria-selected={highlighted === index} key={topic} className="topic-option" onMouseDown={event => event.preventDefault()} onMouseEnter={() => setHighlighted(index)} onClick={() => select(topic)}>{topic}</div>)}</div>{matches.length > visible.length && <div className="topic-more">Showing the first 50. Keep typing to narrow the list.</div>}</div>}
    </div>
    <small id={`${id}-hint`} className={`topic-hint ${discovery.error ? 'topic-warning' : ''}`} role="status">{message}</small>
  </div>;
}
