import { ChevronRight, Settings2 } from 'lucide-react';
import type { Session } from '../shared/model';

export default function SessionOptions({ session }: { session: Session }) {
  return <details className="session-options">
    <summary><ChevronRight size={14} className="session-options-chevron" /><Settings2 size={14} /><span>Session options</span><span className="session-options-count">{session.options?.length ?? '—'}</span><code>spark {session.command}</code></summary>
    <div className="session-options-body">
      {session.options ? <>
        <p>Captured when this session started. Includes the app defaults passed to Spark. Omitted options use your installed CLI’s defaults; credentials are redacted.</p>
        {session.options.length ? <div className="session-options-scroll"><table aria-label="Options used to start this session"><thead><tr><th scope="col">Option</th><th scope="col">Value</th></tr></thead><tbody>{session.options.map(option => <tr key={option.flag}><th scope="row"><code>{session.command === 'help' ? option.flag : `-${option.flag}`}</code></th><td>{option.value === null ? <span className="session-option-flag">Enabled (no value)</span> : <code>{option.value}</code>}</td></tr>)}</tbody></table></div> : <p className="session-options-empty">No options were passed to this command.</p>}
      </> : <p>This session started before option snapshots were available. Its original command is shown below the output. New sessions will include the full options list.</p>}
    </div>
  </details>;
}
