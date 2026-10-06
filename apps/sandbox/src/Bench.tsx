import type { Money } from '@checkout-embed/contracts';
import { createEventBus } from '@checkout-embed/core';
import { formatMoney, mountWidget, type WidgetIntent } from '@checkout-embed/widget';
import { useEffect, useRef, useState } from 'react';
import { createDriver, OUTCOMES, type Outcome } from './driver';
import { CHALLENGE_URL, METHODS, TOTAL } from './fixtures';

/** What real resets and design systems do: the universal selector with !important. */
const HOSTILE_CSS = `
  * {
    color: #d40000 !important;
    font-family: "Comic Sans MS", cursive !important;
    border-radius: 0 !important;
    letter-spacing: 0.08em !important;
  }
  button { background: repeating-linear-gradient(45deg, #ff0, #ff0 6px, #f0f 6px, #f0f 12px) !important; }
`;

const LOCALE = 'en-GB';

const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  succeed: 'Approves',
  decline: 'Declines',
  require_action: 'Asks for 3DS',
};

// Two lines that add up to TOTAL, so the summary and the widget agree.
const ORDER: readonly { readonly label: string; readonly amountMinor: number }[] = [
  { label: 'Bench vice, 150 mm', amountMinor: 850 },
  { label: 'Delivery', amountMinor: 150 },
];

type Source = 'widget' | 'merchant';

type Entry = {
  readonly id: number;
  readonly at: string;
  readonly source: Source;
  readonly text: string;
};

const money = (amountMinor: number): string =>
  formatMoney({ amountMinor, currency: TOTAL.currency } satisfies Money, LOCALE);

export function Bench() {
  // State, not a ref: the container is a new element after the toggle below removes it.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('succeed');
  const [hostile, setHostile] = useState(false);
  const [present, setPresent] = useState(true);
  const [log, setLog] = useState<readonly Entry[]>([]);
  const nextEntryId = useRef(0);

  // Syncs with the widget, which has a shadow root and a React root of its own.
  useEffect(() => {
    if (!host) return;

    const record = (source: Source, text: string): void => {
      nextEntryId.current += 1;
      const entry: Entry = {
        id: nextEntryId.current,
        at: new Date().toLocaleTimeString(LOCALE),
        source,
        text,
      };
      setLog((entries) => [entry, ...entries].slice(0, 14));
    };

    // What a merchant would subscribe to with checkout.on(...).
    const events = createEventBus();
    const unsubscribe = [
      events.on('method:selected', (event) =>
        record('merchant', `method:selected ${event.methodId}`),
      ),
      events.on('payment:success', (event) =>
        record('merchant', `payment:success ${event.intentId}`),
      ),
      events.on('payment:error', (event) =>
        record('merchant', `payment:error ${event.failure.code}`),
      ),
    ];

    const driver = createDriver({
      methods: METHODS,
      total: TOTAL,
      outcome,
      challengeUrl: CHALLENGE_URL,
      events,
    });

    const view = mountWidget(host, {
      store: driver,
      total: TOTAL,
      locale: LOCALE,
      onIntent: (intent: WidgetIntent) => {
        record('widget', intent.type);
        driver.handle(intent);
      },
    });

    driver.start();

    return () => {
      for (const off of unsubscribe) off();
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
    <div className="page">
      <header className="topbar">
        <span className="brand">
          checkout<span>-embed</span>
        </span>
        <span className="tag">Demo with test data. Nothing is charged.</span>
      </header>

      <main className="layout">
        <section className="shop" aria-labelledby="order-title">
          <p className="eyebrow">Acme Hardware · order 1042</p>
          <h1 id="order-title">Checkout</h1>

          <dl className="order">
            {ORDER.map((line) => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{money(line.amountMinor)}</dd>
              </div>
            ))}
            <div className="total">
              <dt>Total</dt>
              <dd>{money(TOTAL.amountMinor)}</dd>
            </div>
          </dl>

          <div className="stage">
            {present ? (
              <div ref={setHost} />
            ) : (
              <p className="gone">The widget was taken off the page. Turn it back on to remount.</p>
            )}
          </div>
        </section>

        <aside className="panel" aria-label="Test controls">
          <fieldset className="segmented">
            <legend>The provider</legend>
            <div className="segments">
              {OUTCOMES.map((candidate) => (
                <label key={candidate}>
                  <input
                    type="radio"
                    name="outcome"
                    value={candidate}
                    checked={outcome === candidate}
                    onChange={() => setOutcome(candidate)}
                  />
                  <span>{OUTCOME_LABELS[candidate]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="switches">
            <legend>The page around it</legend>
            <label>
              <span>
                Hostile stylesheet
                <small>Red Comic Sans with !important on every element</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-checked={hostile}
                checked={hostile}
                onChange={(event) => setHostile(event.target.checked)}
              />
            </label>
            <label>
              <span>
                Widget on the page
                <small>Off unmounts it, on mounts it again</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-checked={present}
                checked={present}
                onChange={(event) => setPresent(event.target.checked)}
              />
            </label>
          </fieldset>

          <section className="log" aria-labelledby="log-title">
            <h2 id="log-title">Event log</h2>
            {log.length === 0 ? (
              <p className="empty">Pick a method to start.</p>
            ) : (
              <ol>
                {log.map((entry) => (
                  <li key={entry.id}>
                    <time>{entry.at}</time>
                    <span className={`source ${entry.source}`}>{entry.source}</span>
                    <code>{entry.text}</code>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="note">
            The provider here runs in this tab. In the full setup it is a separate server,
            <code>apps/mock-psp</code>, on another origin.
          </p>
        </aside>
      </main>
    </div>
  );
}
