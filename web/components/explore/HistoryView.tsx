import type { HistorySession } from '../../lib/types'
import ui from '../platform/ui.module.css'
import css from './explore.module.css'

const PREVIEW_CHARS = 150

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS).trimEnd()}…` : flat
}

/** An item's multi-session conversation, exactly as the benchmark gives it to a system.
 *  User turns — where the facts are stated — are shown in full; assistant turns are long
 *  and collapse behind a native <details>, so they open with the keyboard and need no
 *  script. */
export function HistoryView({ history }: { history: HistorySession[] }) {
  return (
    <div>
      {history.map((session, si) => {
        const synthetic = session.synthetic === true
        return (
          <section key={`${session.session_id ?? 'session'}-${si}`} className={css.session}>
            <h3 className={css.sessionHead}>
              <span>
                Session {si + 1} of {history.length}
              </span>
              {session.date ? <span className={ui.faint}>{session.date}</span> : null}
              {synthetic ? (
                <span className={`${ui.badge} ${ui.tintWarn}`} title="Written by the benchmark authors, not taken from LongMemEval">
                  synthetic retraction
                </span>
              ) : null}
            </h3>
            <ol className={css.turns}>
              {(session.turns ?? []).map((turn, ti) => {
                const isUser = turn.role === 'user'
                return (
                  <li key={ti}>
                    {isUser ? (
                      <div className={`${css.turn} ${css.turnUser}`}>
                        <span className={css.role}>user</span>
                        <p className={css.content}>{turn.content}</p>
                      </div>
                    ) : (
                      <details className={`${css.turn} ${css.assistant}`}>
                        <summary>
                          <span className={css.role} style={{ display: 'inline' }}>
                            {turn.role}
                          </span>{' '}
                          <span className={css.preview}>{preview(turn.content)}</span>
                        </summary>
                        <p className={css.content}>{turn.content}</p>
                      </details>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
