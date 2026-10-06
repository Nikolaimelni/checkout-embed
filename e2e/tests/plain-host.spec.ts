import { expect, type Locator, type Page, test } from '@playwright/test';
import { INSTRUMENT, outstanding } from './leaks.ts';

const SUCCEEDS = 4999;
const DECLINES = 1051;
const NEEDS_3DS = 1003;
const STALLS = 1099;

const widget = (page: Page): Locator => page.locator('#checkout');

async function open(page: Page, amountMinor: number): Promise<void> {
  await page.goto(`/?amount=${amountMinor}`);
  await expect(widget(page).getByText('Choose how to pay')).toBeVisible();
}

test.describe('a shop page with no framework', () => {
  test('loads the widget through the loader and the config endpoint', async ({ page }) => {
    await open(page, SUCCEEDS);

    await expect(page.locator('script[data-checkout-embed-global]')).toHaveAttribute(
      'src',
      /from=config/,
    );
    await expect(widget(page).getByText('49.99')).toBeVisible();
  });

  test('walks a payment to a receipt on the host page', async ({ page }) => {
    await open(page, SUCCEEDS);

    await widget(page).getByRole('button', { name: 'Card', exact: true }).click();
    await widget(page).getByRole('button', { name: 'Pay' }).click();

    await expect(widget(page).getByRole('status')).toHaveText('Payment complete', {
      timeout: 15_000,
    });
    await expect(page.locator('#receipt')).toContainText('Paid. Reference pi_');
  });

  test('shows the decline the provider actually sent', async ({ page }) => {
    await open(page, DECLINES);

    await widget(page).getByRole('button', { name: 'Card', exact: true }).click();
    await widget(page).getByRole('button', { name: 'Pay' }).click();

    await expect(widget(page).getByRole('status')).toContainText('The payment was declined.');
    await expect(widget(page).getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('runs the 3DS challenge inside its iframe and settles afterwards', async ({ page }) => {
    await open(page, NEEDS_3DS);

    await widget(page).getByRole('button', { name: 'Card', exact: true }).click();
    await widget(page).getByRole('button', { name: 'Pay' }).click();

    const dialog = widget(page).getByRole('dialog');
    await expect(dialog).toBeVisible();

    const challenge = page.frameLocator('#checkout iframe');
    await expect(challenge.getByRole('heading', { name: /confirm your payment/i })).toBeVisible();

    await challenge.getByRole('button', { name: 'Approve' }).click();

    await expect(widget(page).getByRole('status')).toHaveText('Payment complete', {
      timeout: 15_000,
    });
    await expect(page.locator('#receipt')).toContainText('Paid.');
  });

  test('fails the payment when the challenge is rejected', async ({ page }) => {
    await open(page, NEEDS_3DS);

    await widget(page).getByRole('button', { name: 'Card', exact: true }).click();
    await widget(page).getByRole('button', { name: 'Pay' }).click();
    await page.frameLocator('#checkout iframe').getByRole('button', { name: 'Reject' }).click();

    await expect(widget(page).getByRole('status')).toContainText(/declined/i, {
      timeout: 15_000,
    });
  });
});

test.describe('style isolation', () => {
  const HOSTILE = `
    * { color: #d40000 !important; font-family: "Comic Sans MS", cursive !important;
        border-radius: 0 !important; letter-spacing: 0.08em !important; }
    button { background: #ff00ff !important; padding: 40px !important; }
  `;

  test('a host page cannot reach into the widget', async ({ page }) => {
    await open(page, SUCCEEDS);

    const sample = () =>
      page.evaluate(() => {
        const root = document.querySelector('#checkout')?.shadowRoot;
        const pick = (element: Element | null | undefined) => {
          if (!element) return null;
          const style = getComputedStyle(element);
          return {
            color: style.color,
            fontFamily: style.fontFamily,
            letterSpacing: style.letterSpacing,
            borderRadius: style.borderRadius,
            padding: style.padding,
            background: style.backgroundColor,
          };
        };

        return {
          card: pick(root?.querySelector('.root')),
          heading: pick(root?.querySelector('.heading')),
          method: pick(root?.querySelector('button.method')),
          hostPage: pick(document.querySelector('h1')),
        };
      });

    const before = await sample();

    await page.addStyleTag({ content: HOSTILE });
    await page.waitForTimeout(100);

    const after = await sample();

    expect(after.card).toEqual(before.card);
    expect(after.heading).toEqual(before.heading);
    expect(after.method).toEqual(before.method);
    expect(after.hostPage).not.toEqual(before.hostPage);
  });
});

test.describe('teardown', () => {
  test('terminate leaves nothing behind in the middle of a payment, twice over', async ({
    page,
  }) => {
    await page.addInitScript(INSTRUMENT);
    await open(page, STALLS);

    const payAndWait = async (): Promise<void> => {
      await widget(page).getByRole('button', { name: 'Card', exact: true }).click();
      await widget(page).getByRole('button', { name: 'Pay' }).click();
      await expect(widget(page).getByRole('status')).toHaveText('Waiting for confirmation');
    };

    const mountAgain = async (): Promise<void> => {
      await page.evaluate((amountMinor) => {
        const ce = (window as unknown as { checkoutEmbed: (...args: unknown[]) => void })
          .checkoutEmbed;
        ce('init', {
          config: {
            merchantKey: 'mk_test_acme',
            environment: 'sandbox',
            apiBaseUrl: 'http://localhost:4000',
          },
          auth: { getToken: () => Promise.resolve('demo-token') },
        });
        ce('mount', '#checkout', { amount: { amountMinor, currency: 'EUR' } });
      }, STALLS);
      await expect(widget(page).getByText('Choose how to pay')).toBeVisible();
    };

    const terminate = async () => {
      await page.evaluate(() => {
        (window as unknown as { checkoutEmbed: (...args: unknown[]) => void }).checkoutEmbed(
          'terminate',
        );
      });
      await page.waitForTimeout(250);
      return outstanding(page, '#checkout');
    };

    await payAndWait();
    const busy = await outstanding(page, '#checkout');
    expect(busy.nodes).toBeGreaterThan(0);

    const first = await terminate();
    expect(first.nodes).toBe(0);

    await mountAgain();
    await payAndWait();
    const second = await terminate();

    expect(second.nodes).toBe(0);
    expect(second.timers).toBe(first.timers);
    expect(second.listeners).toBe(first.listeners);
  });
});
