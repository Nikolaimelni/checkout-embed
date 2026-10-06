import type { HostMessage, Money } from '@checkout-embed/contracts';
import type { CheckoutState } from '@checkout-embed/core';
import type { ReactNode } from 'react';
import { Challenge } from './Challenge.js';
import { Button } from './HostElement.js';
import type { WidgetIntent } from './intents.js';
import { DEFAULT_LABELS, type Labels } from './labels.js';
import { MethodIcon } from './MethodIcon.js';
import { formatMoney } from './money.js';

/** What instance.update() pushes in, derived from the schema that validates it. */
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
    <div className="root" data-status={state.status}>
      <header className="summary">
        <h2 className="heading">{labels.heading}</h2>
        <p className="amount">{formatMoney(total, locale)}</p>
      </header>

      {/* Always in the tree, never empty on arrival: a live region inserted at the same
          moment as its text is not announced by most screen readers. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {host?.blockingMessage ?? announcementFor(state, labels)}
      </p>

      {host?.blockingMessage ? <p className="failure">{host.blockingMessage}</p> : renderBody()}

      <p className="secured">
        <Lock />
        {labels.secured}
      </p>
    </div>
  );

  function renderBody(): ReactNode {
    switch (state.status) {
      case 'idle':
        return (
          <>
            <ul className="methods" aria-hidden="true">
              <li className="skeleton" />
              <li className="skeleton" />
              <li className="skeleton" />
            </ul>
            <p className="status">{labels.loading}</p>
          </>
        );

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
                  <MethodIcon method={method} />
                  <span className="method-label">{method.label}</span>
                  {method.last4 ? <span className="method-hint">•••• {method.last4}</span> : null}
                  <Chevron />
                </button>
              </li>
            ))}
          </ul>
        );

      case 'details':
        return (
          <>
            <div className="method selected">
              <MethodIcon method={state.method} />
              <span className="method-label">{state.method.label}</span>
              {state.method.last4 ? (
                <span className="method-hint">•••• {state.method.last4}</span>
              ) : null}
            </div>
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
        return <Progress text={labels.confirming} />;

      case 'requires_action':
        return (
          <>
            <Progress text={labels.challengeTitle} />
            <Challenge
              actionUrl={state.actionUrl}
              intentId={state.intent.id}
              labels={labels}
              hostButtonTag={buttonTag}
              onFinished={() => onIntent({ type: 'challenge-finished' })}
              onDismissed={() => onIntent({ type: 'challenge-dismissed' })}
            />
          </>
        );

      case 'polling':
        return <Progress text={labels.polling} />;

      case 'succeeded':
        return (
          <>
            <div className="result">
              <span className="result-icon positive" aria-hidden="true">
                <Check />
              </span>
              <p className="result-title">{labels.succeeded}</p>
            </div>
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
            <div className="result">
              <span className="result-icon negative" aria-hidden="true">
                <Cross />
              </span>
              <p className="result-title">{labels.failed}</p>
              <p className="result-text">{state.failure.message}</p>
            </div>
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

type ProgressProps = {
  readonly text: string;
};

function Progress({ text }: ProgressProps) {
  return (
    <div className="progress">
      <span className="spinner" aria-hidden="true" />
      <p className="status">{text}</p>
    </div>
  );
}

function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

function Lock() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.8" fill="currentColor" />
      <path
        d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
