import { type PaymentMethod, PaymentMethodSchema } from '@checkout-embed/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDriver, type Outcome } from './driver';

const methods: readonly PaymentMethod[] = [
  PaymentMethodSchema.parse({ id: 'pm_card', kind: 'card', label: 'Card' }),
];

const card = methods[0] as PaymentMethod;

function driverFor(outcome: Outcome) {
  return createDriver({
    methods,
    total: { amountMinor: 1000, currency: 'EUR' },
    outcome,
    challengeUrl: 'https://psp.test/3ds/pi_sandbox',
  });
}

const answer = () => vi.runAllTimersAsync();

async function opened(outcome: Outcome) {
  const driver = driverFor(outcome);
  driver.start();
  await answer();
  return driver;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createDriver', () => {
  it('starts empty and lists methods once the provider answers', async () => {
    const driver = driverFor('succeed');

    expect(driver.getState().status).toBe('idle');

    driver.start();
    await answer();

    expect(driver.getState()).toMatchObject({ status: 'methods', methods });
  });

  it('walks a plain payment to a receipt through polling', async () => {
    const driver = await opened('succeed');

    driver.handle({ type: 'select-method', methodId: card.id });
    expect(driver.getState().status).toBe('details');

    driver.handle({ type: 'pay' });
    await answer();

    expect(driver.getState().status).toBe('succeeded');
  });

  it('walks a challenged payment through polling', async () => {
    const driver = await opened('require_action');
    driver.handle({ type: 'select-method', methodId: card.id });

    driver.handle({ type: 'pay' });
    await answer();
    expect(driver.getState()).toMatchObject({
      status: 'requires_action',
      actionUrl: 'https://psp.test/3ds/pi_sandbox',
    });

    driver.handle({ type: 'challenge-finished' });
    await answer();

    expect(driver.getState().status).toBe('succeeded');
  });

  it('reopens a closed challenge on retry, the way the SDK does', async () => {
    const driver = await opened('require_action');
    driver.handle({ type: 'select-method', methodId: card.id });
    driver.handle({ type: 'pay' });
    await answer();

    driver.handle({ type: 'challenge-dismissed' });
    expect(driver.getState()).toMatchObject({
      status: 'failed',
      failure: { code: 'action_abandoned' },
    });

    driver.handle({ type: 'retry' });
    await answer();

    expect(driver.getState().status).toBe('requires_action');
  });

  it('lands a decline somewhere a retry can start from', async () => {
    const driver = await opened('decline');
    driver.handle({ type: 'select-method', methodId: card.id });

    driver.handle({ type: 'pay' });
    await answer();
    expect(driver.getState()).toMatchObject({ status: 'failed', retryable: true });

    driver.handle({ type: 'retry' });
    await answer();

    expect(driver.getState().status).toBe('methods');
  });

  it('goes back to the list from the details screen', async () => {
    const driver = await opened('succeed');
    driver.handle({ type: 'select-method', methodId: card.id });

    driver.handle({ type: 'go-back' });

    expect(driver.getState().status).toBe('methods');
  });

  it('starts over from a receipt', async () => {
    const driver = await opened('succeed');
    driver.handle({ type: 'select-method', methodId: card.id });
    driver.handle({ type: 'pay' });
    await answer();

    driver.handle({ type: 'dismiss' });
    await answer();

    expect(driver.getState().status).toBe('methods');
  });

  it('tells subscribers only when the state actually moved', async () => {
    const driver = driverFor('succeed');
    let notifications = 0;
    driver.subscribe(() => {
      notifications += 1;
    });
    driver.start();
    await answer();

    driver.handle({ type: 'challenge-finished' });

    expect(notifications).toBe(1);
  });
});
