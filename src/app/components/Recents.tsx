import { fileSize, relativeTime } from '../format';
import { useDocument } from '../store';

/**
 * Recently opened documents, on the landing page.
 *
 * This is the habit loop. A viewer with no memory is a one-shot tool: you visit
 * once, read, and next time open your editor instead, because that is fewer
 * steps than finding the file again. A list of one-click reopens is what makes
 * coming back cheaper than not coming back.
 *
 * Renders nothing at all when the list is empty, which covers both the first
 * visit and every visit on Safari and Firefox — neither can retain a handle to
 * a user file, so there is nothing reopenable to show. An empty "Recent"
 * heading would announce a feature those readers cannot have.
 */
export function Recents() {
  const recents = useDocument((s) => s.recents);
  const openRecent = useDocument((s) => s.openRecent);
  const forget = useDocument((s) => s.forget);

  if (recents.length === 0) return null;

  return (
    <nav className="lmd-recents" aria-labelledby="lmd-recents-heading">
      <h2 className="lmd-recents-heading" id="lmd-recents-heading">
        Recent
      </h2>
      <ul className="lmd-recents-list">
        {recents.map((recent) => {
          const size = fileSize(recent.size);

          return (
            <li className="lmd-recents-item" key={recent.id}>
              <button
                type="button"
                className="lmd-recents-open"
                onClick={() => void openRecent(recent)}
              >
                <span className="lmd-recents-name">{recent.name}</span>
                <span className="lmd-recents-meta">
                  {relativeTime(recent.lastOpened)}
                  {size && ` · ${size}`}
                </span>
              </button>
              {/* Removing a row is a real need — a recents list you cannot edit
                  is a list of everything you have ever read, sitting on the
                  first screen of the app. */}
              <button
                type="button"
                className="lmd-recents-forget"
                onClick={() => void forget(recent.id)}
                aria-label={`Remove ${recent.name} from recent documents`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
