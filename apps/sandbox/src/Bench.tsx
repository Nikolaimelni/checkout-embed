import { mountWidget, type WidgetIntent } from '@checkout-embed/widget';
import { useEffect, useRef, useState } from 'react';
import { createDriver, OUTCOMES, type Outcome } from './driver';
import { CHALLENGE_URL, METHODS, TOTAL } from './fixtures';

/**
 * Not a strawman. Resets and design systems in the wild really do reach for the universal
 * selector with !important, and this is the pressure the shadow root exists to take.
 */
const HOSTILE_CSS = `
  * {
    color: #d40000 !important;
    font-family: "Comic Sans MS", cursive !important;
    border-radius: 0 !important;
    letter-spacing: 0.08em !important;
  }
  button { background: repeating-linear-gradient(45deg, #ff0, #ff0 6px, #f0f 6px, #f0f 12px) !important; }
`;

export function Bench() {
  // State rather than a ref: the container is a different element after the checkbox
  // below removes and restores it, and an effect has to hear about that.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('succeed');
  const [hostile, setHostile] = useState(false);
  const [present, setPresent] = useState(true);
  const [log, setLog] = useState<readonly { id: number; type: string }[]>([]);
  const nextEntryId = useRef(0);

  // Syncs React with the widget, which owns a shadow root and a React root of its own and
  // knows nothing about this component's lifecycle.
  useEffect(() => {
    if (!host) return;

    const driver = createDriver({
      methods: METHODS,
      total: TOTAL,
      outcome,
      challengeUrl: CHALLENGE_URL,
    });

    const view = mountWidget(host, {
      store: driver,
      total: TOTAL,
      locale: 'en-GB',
      onIntent: (intent: WidgetIntent) => {
        nextEntryId.current += 1;
        setLog((entries) =>
          [{ id: nextEntryId.current, type: intent.type }, ...entries].slice(0, 12),
        );
        driver.handle(intent);
      },
    });

    driver.start();

    return () => {
      driver.dispose();
      view.unmount();
    };
  }, [host, outcome]);

  // Syncs React with document.head, which is where a host page's stylesheet lives.
  useEffect(() => {
    if (!hostile) return;

    const style = document.createElement('style');
    style.textContent = HOSTILE_CSS;
    document.head.append(style);

    return () => style.remove();
  }, [hostile]);

  return (
    <main className="bench">
      <header>
        <h1>checkout-embed sandbox</h1>
        <p>
          The widget below is mounted into an empty div through the same call a merchant makes.
          Everything outside its border is the host page.
        </p>
      </header>

      <section className="controls">
        <fieldset>
          <legend>What the provider does</legend>
          {OUTCOMES.map((candidate) => (
            <label key={candidate}>
              <input
                type="radio"
                name="outcome"
                value={candidate}
                checked={outcome === candidate}
                onChange={() => setOutcome(candidate)}
              />
              {candidate}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Host page</legend>
          <label>
            <input
              type="checkbox"
              checked={hostile}
              onChange={(event) => setHostile(event.target.checked)}
            />
            Fight the widget with global styles
          </label>
          <label>
            <input
              type="checkbox"
              checked={present}
              onChange={(event) => setPresent(event.target.checked)}
            />
            Keep the container in the page
          </label>
        </fieldset>
      </section>

      <section className="stage">
        {present ? <div ref={setHost} /> : <p className="gone">The container is unmounted.</p>}
      </section>

      <section className="log">
        <h2>What the widget reported</h2>
        {log.length === 0 ? (
          <p>Nothing yet.</p>
        ) : (
          <ol>
            {log.map((entry) => (
              <li key={entry.id}>{entry.type}</li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
