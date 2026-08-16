import type { Money } from '@checkout-embed/contracts';
import type { CheckoutState } from '@checkout-embed/core';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CHALLENGE_URL, card, savedCard, states } from '../testing/fixtures.js';
import { CheckoutView } from './CheckoutView.js';
import type { WidgetIntent } from './intents.js';

const total: Money = { amountMinor: 1000, currency: 'EUR' };

function show(state: CheckoutState): (intent: WidgetIntent) => void {
  const onIntent = vi.fn<(intent: WidgetIntent) => void>();
  render(<CheckoutView state={state} total={total} locale="en-US" onIntent={onIntent} />);
  return onIntent;
}

describe('every screen', () => {
  it.each(Object.entries(states))('shows the amount on %s', (_name, state) => {
    show(state);

    expect(screen.getByText(/10\.00/)).toBeInTheDocument();
  });

  it.each(Object.entries(states))('announces %s in a live region', (_name, state) => {
    show(state);

    expect(screen.getByRole('status')).not.toBeEmptyDOMElement();
  });
});

describe('choosing a method', () => {
  it('lists one button per method with its label', () => {
    show(states['methods'] as CheckoutState);

    expect(screen.getByRole('button', { name: /^Card$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Visa ending 4242/ })).toBeInTheDocument();
  });

  it('shows the last four digits of a saved card', () => {
    show(states['methods'] as CheckoutState);

    expect(screen.getByText(`•••• ${savedCard.last4}`)).toBeInTheDocument();
  });

  it('reports which method was chosen', async () => {
    const onIntent = show(states['methods'] as CheckoutState);

    await userEvent.click(screen.getByRole('button', { name: /^Card$/ }));

    expect(onIntent).toHaveBeenCalledWith({ type: 'select-method', methodId: card.id });
  });
});

describe('the details screen', () => {
  it('offers paying and going back', async () => {
    const onIntent = show(states['details'] as CheckoutState);

    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onIntent).toHaveBeenNthCalledWith(1, { type: 'pay' });
    expect(onIntent).toHaveBeenNthCalledWith(2, { type: 'go-back' });
  });
});

describe('the challenge', () => {
  it('frames the provider page in a labelled dialog', () => {
    show(states['requires_action'] as CheckoutState);

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTitle(/confirm this payment/i)).toHaveAttribute('src', CHALLENGE_URL);
  });

  it('moves focus into the dialog so its label is read out', () => {
    show(states['requires_action'] as CheckoutState);

    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('lets someone say they are done when the iframe never tells us', async () => {
    const onIntent = show(states['requires_action'] as CheckoutState);

    await userEvent.click(screen.getByRole('button', { name: /I have finished/ }));

    expect(onIntent).toHaveBeenCalledWith({ type: 'challenge-finished' });
  });

  it('acts on a message from the provider origin', () => {
    const onIntent = show(states['requires_action'] as CheckoutState);

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: new URL(CHALLENGE_URL).origin,
        data: { source: 'checkout-embed-3ds', intentId: 'pi_1', approved: true },
      }),
    );

    expect(onIntent).toHaveBeenCalledWith({ type: 'challenge-finished' });
  });

  it.each([
    [
      'another origin',
      'https://evil.test',
      { source: 'checkout-embed-3ds', intentId: 'pi_1', approved: true },
    ],
    [
      'another intent',
      new URL(CHALLENGE_URL).origin,
      { source: 'checkout-embed-3ds', intentId: 'pi_2', approved: true },
    ],
    [
      'another sender',
      new URL(CHALLENGE_URL).origin,
      { source: 'some-other-sdk', intentId: 'pi_1' },
    ],
    ['a bare string', new URL(CHALLENGE_URL).origin, 'done'],
  ])('ignores a message from %s', (_label, origin, data) => {
    const onIntent = show(states['requires_action'] as CheckoutState);

    window.dispatchEvent(new MessageEvent('message', { origin, data }));

    expect(onIntent).not.toHaveBeenCalled();
  });
});

describe('the end of the payment', () => {
  it('offers a retry when the provider said the failure was not final', () => {
    show(states['failed'] as CheckoutState);

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers no retry when it was', () => {
    show(states['failedFinal'] as CheckoutState);

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('shows what the provider actually said', () => {
    show(states['failed'] as CheckoutState);

    expect(screen.getByText('The bank said no.')).toBeInTheDocument();
  });

  it('closes from the receipt', async () => {
    const onIntent = show(states['succeeded'] as CheckoutState);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onIntent).toHaveBeenCalledWith({ type: 'dismiss' });
  });
});
