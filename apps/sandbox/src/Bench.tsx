import type { Money } from '@checkout-embed/contracts';
import { createEventBus } from '@checkout-embed/core';
import { formatMoney, mountWidget, type WidgetIntent } from '@checkout-embed/widget';
import { useEffect, useRef, useState } from 'react';
import { createDriver, OUTCOMES, type Outcome } from './driver';
import { CHALLENGE_URL, METHODS, TOTAL } from './fixtures';

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
const REPOSITORY = 'https://github.com/Nikolaimelni/checkout-embed';

const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  succeed: 'Approve',
  decline: 'Decline',
  require_action: '3DS check',
};

const ORDER: readonly { readonly label: string; readonly amountMinor: number }[] = [
  { label: 'Bench vice, 150 mm', amountMinor: 850 },
  { label: 'Delivery', amountMinor: 150 },
];

type Source = 'widget' | 'shop';

type Entry = {
  readonly id: number;
  readonly at: string;
  readonly source: Source;
  readonly text: string;
};

const money = (amountMinor: number): string =>
  formatMoney({ amountMinor, currency: TOTAL.currency } satisfies Money, LOCALE);

export function Bench() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('succeed');
  const [hostile, setHostile] = useState(false);
  const [present, setPresent] = useState(true);
  const [log, setLog] = useState<readonly Entry[]>([]);
  const nextEntryId = useRef(0);

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
      setLog((entries) => [entry, ...entries].slice(0, 12));
    };

    const events = createEventBus();
    const unsubscribe = [
      events.on('method:selected', (event) => record('shop', `method:selected ${event.methodId}`)),
      events.on('payment:success', (event) => record('shop', `payment:success ${event.intentId}`)),
      events.on('payment:error', (event) => record('shop', `payment:error ${event.failure.code}`)),
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
        <span className="tag">Demo, test money only</span>
        <a className="source-link" href={REPOSITORY}>
          Source on GitHub
        </a>
      </header>

      <main className="layout">
        <section className="summary" aria-labelledby="order-title">
          <p className="eyebrow">Acme Hardware</p>
          <h1 id="order-title">Your order</h1>
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
          <p className="explain">
            The payment form is the widget. Everything around it pretends to be the shop that put it
            on its page.
          </p>
        </section>

        <div className="stage">
          {present ? (
            <div ref={setHost} />
          ) : (
            <p className="gone">The widget is off the page. Switch it back on to load it again.</p>
          )}
        </div>

        <aside className="panel" aria-labelledby="panel-title">
          <h2 id="panel-title">Try it</h2>

          <fieldset className="segmented">
            <legend>What the bank says</legend>
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
            <p className="hint">Then pick a card and press Pay.</p>
          </fieldset>

          <fieldset className="switches">
            <legend>Stress the shop page</legend>
            <label>
              <span>
                Break the shop's styles
                <small>
                  Turns the page into red Comic Sans. The widget is walled off from the page's CSS,
                  so it should not change.
                </small>
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
                Show the widget
                <small>Off removes it like a shop leaving the page, on brings it back.</small>
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
            <h3 id="log-title">What happened</h3>
            {log.length === 0 ? (
              <p className="hint">
                Nothing yet. Clicks show up as widget, events the shop hears as shop.
              </p>
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
            No server here: the payment provider runs inside this tab. The full project, with a real
            one, runs locally. <a href={`${REPOSITORY}#readme`}>How</a>.
          </p>
        </aside>
      </main>
    </div>
  );
}
