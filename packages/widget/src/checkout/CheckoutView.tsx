import type { HostMessage, Money } from '@checkout-embed/contracts';
import type { CheckoutState } from '@checkout-embed/core';
import type { ReactNode } from 'react';
import { Challenge } from './Challenge.js';
import { Button } from './HostElement.js';
import type { WidgetIntent } from './intents.js';
import { DEFAULT_LABELS, type Labels } from './labels.js';
import { formatMoney } from './money.js';

/**
 * What the merchant pushes in through instance.update(). Derived from the schema that
 * validates it rather than restated, so the two cannot drift.
 */
export type HostState = Omit<Extract<HostMessage, { type: 'host/update' }>, 'type'>;

export type HostComponents = {
  readonly button?: string | undefined;
};

export type CheckoutViewProps = {
  readonly state: CheckoutState;
  readonly total: Money;
  readonly locale: string;
  readonly labels?: Partial<Labels> | undefined;
  readonly components?: HostComponents | undefined;
  readonly host?: HostState | undefined;
  readonly onIntent: (intent: WidgetIntent) => void;
};

function isOutsideLimits(total: Money, host: HostState | undefined): boolean {
  const limits = host?.limits;
  if (!limits) return false;

  return total.amountMinor < limits.minMinor || total.amountMinor > limits.maxMinor;
}

function announcementFor(state: CheckoutState, labels: Labels): string {
  switch (state.status) {
    case 'idle':
      return labels.loading;
    case 'methods':
      return labels.chooseMethod;
    case 'details':
      return state.method.label;
    case 'confirming':
      return labels.confirming;
    case 'requires_action':
      return labels.challengeTitle;
    case 'polling':
      return labels.polling;
    case 'succeeded':
      return labels.succeeded;
    case 'failed':
      return `${labels.failed}. ${state.failure.message}`;
  }
}

export function CheckoutView({
  state,
  total,
  locale,
  labels: overrides,
  components,
  host,
  onIntent,
}: CheckoutViewProps): ReactNode {
  const labels = { ...DEFAULT_LABELS, ...overrides };
  const outsideLimits = isOutsideLimits(total, host);
  const buttonTag = components?.button;

  return (
    <div className="root">
      <h1 className="heading">{labels.heading}</h1>
      <p className="amount">{formatMoney(total, locale)}</p>

      {/* Always in the tree, never empty on arrival: a live region inserted at the same
          moment as its text is not announced by most screen readers. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {host?.blockingMessage ?? announcementFor(state, labels)}
      </p>

      {host?.blockingMessage ? <p className="failure">{host.blockingMessage}</p> : renderBody()}
    </div>
  );

  function renderBody(): ReactNode {
    switch (state.status) {
      case 'idle':
        return <p className="status">{labels.loading}</p>;

      case 'methods':
        return (
          <ul className="methods">
            {state.methods.map((method) => (
              <li key={method.id}>
                <button
                  className="method"
                  type="button"
                  onClick={() => onIntent({ type: 'select-method', methodId: method.id })}
                >
                  <span className="method-label">{method.label}</span>
                  {method.last4 ? <span className="method-hint">•••• {method.last4}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        );

      case 'details':
        return (
          <>
            <p className="status">{state.method.label}</p>
            {outsideLimits ? <p className="failure">{labels.outsideLimits}</p> : null}
            <div className="actions">
              <Button
                hostTag={buttonTag}
                disabled={outsideLimits}
                onClick={() => onIntent({ type: 'pay' })}
              >
                {labels.pay}
              </Button>
              <Button
                hostTag={buttonTag}
                variant="secondary"
                onClick={() => onIntent({ type: 'go-back' })}
              >
                {labels.back}
              </Button>
            </div>
          </>
        );

      case 'confirming':
        return <p className="status">{labels.confirming}</p>;

      case 'requires_action':
        return (
          <>
            <p className="status">{labels.challengeTitle}</p>
            <Challenge
              actionUrl={state.actionUrl}
              intentId={state.intent.id}
              labels={labels}
              hostButtonTag={buttonTag}
              onFinished={() => onIntent({ type: 'challenge-finished' })}
            />
          </>
        );

      case 'polling':
        return <p className="status">{labels.polling}</p>;

      case 'succeeded':
        return (
          <>
            <p className="status">{labels.succeeded}</p>
            <div className="actions">
              <Button
                hostTag={buttonTag}
                variant="secondary"
                onClick={() => onIntent({ type: 'dismiss' })}
              >
                {labels.close}
              </Button>
            </div>
          </>
        );

      case 'failed':
        return (
          <>
            <p className="failure">{state.failure.message}</p>
            <div className="actions">
              {state.retryable ? (
                <Button hostTag={buttonTag} onClick={() => onIntent({ type: 'retry' })}>
                  {labels.retry}
                </Button>
              ) : null}
              <Button
                hostTag={buttonTag}
                variant="secondary"
                onClick={() => onIntent({ type: 'dismiss' })}
              >
                {labels.close}
              </Button>
            </div>
          </>
        );
    }
  }
}
