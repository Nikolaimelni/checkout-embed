import { type PaymentMethod, PaymentMethodSchema } from '@checkout-embed/contracts';
import { describe, expect, it } from 'vitest';
import { createDriver, type Outcome } from './driver';

const methods: readonly PaymentMethod[] = [
  PaymentMethodSchema.parse({ id: 'pm_card', kind: 'card', label: 'Card' }),
];

const card = methods[0] as PaymentMethod;

/** Runs the scheduled work at once, so a walk through the machine is a straight line. */
function driverFor(outcome: Outcome) {
  return createDriver({
    methods,
    outcome,
    challengeUrl: 'https://psp.test/3ds/pi_sandbox',
    schedule: (run) => run(),
  });
}

describe('createDriver', () => {
  it('starts empty and lists methods when the bench opens', () => {
    const driver = driverFor('succeed');

    expect(driver.getState().status).toBe('idle');

    driver.open();

    expect(driver.getState()).toMatchObject({ status: 'methods', methods });
  });

  it('walks a plain payment to a receipt', () => {
    const driver = driverFor('succeed');
    driver.open();

    driver.handle({ type: 'select-method', methodId: card.id });
    expect(driver.getState().status).toBe('details');

    driver.handle({ type: 'pay' });

    expect(driver.getState().status).toBe('succeeded');
  });

  it('walks a challenged payment through polling', () => {
    const driver = driverFor('require_action');
    driver.open();
    driver.handle({ type: 'select-method', methodId: card.id });

    driver.handle({ type: 'pay' });
    expect(driver.getState()).toMatchObject({
      status: 'requires_action',
      actionUrl: 'https://psp.test/3ds/pi_sandbox',
    });

    driver.handle({ type: 'challenge-finished' });

    expect(driver.getState().status).toBe('succeeded');
  });

  it('lands a decline somewhere a retry can start from', () => {
    const driver = driverFor('decline');
    driver.open();
    driver.handle({ type: 'select-method', methodId: card.id });

    driver.handle({ type: 'pay' });
    expect(driver.getState()).toMatchObject({ status: 'failed', retryable: true });

    driver.handle({ type: 'retry' });

    expect(driver.getState().status).toBe('methods');
  });

  it('goes back to the list from the details screen', () => {
    const driver = driverFor('succeed');
    driver.open();
    driver.handle({ type: 'select-method', methodId: card.id });

    driver.handle({ type: 'go-back' });

    expect(driver.getState().status).toBe('methods');
  });

  it('starts over from a receipt', () => {
    const driver = driverFor('succeed');
    driver.open();
    driver.handle({ type: 'select-method', methodId: card.id });
    driver.handle({ type: 'pay' });

    driver.handle({ type: 'dismiss' });

    expect(driver.getState().status).toBe('methods');
  });

  it('tells subscribers only when the state actually moved', () => {
    const driver = driverFor('succeed');
    let notifications = 0;
    driver.subscribe(() => {
      notifications += 1;
    });
    driver.open();

    // The machine has no transition for this one, so nobody should be woken up for it.
    driver.handle({ type: 'challenge-finished' });

    expect(notifications).toBe(1);
  });
});
