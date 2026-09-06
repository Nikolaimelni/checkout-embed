import { expect, type Page, test } from '@playwright/test';
import { INSTRUMENT, outstanding } from './leaks.ts';

const NEXT = 'http://localhost:5175';

const widget = (page: Page) => page.locator('#checkout');

async function openCart(page: Page): Promise<void> {
  await page.goto(`${NEXT}/cart`);
  await expect(widget(page).getByText('Choose how to pay')).toBeVisible();
}

test.describe('a server rendered page with a client widget', () => {
  test('serves the cart from the server and the widget from the client', async ({
    page,
    request,
  }) => {
    const html = await (await request.get(`${NEXT}/cart`)).text();

    // The page itself came off the server with its content in it, which is the only reason
    // this app is here rather than another plain HTML file.
    expect(html).toContain('This page is server rendered');
    expect(html).toContain('49.99');
    // And the widget did not, because it needs a shadow root to exist first.
    expect(html).not.toContain('Choose how to pay');

    await openCart(page);
    await expect(widget(page).getByText('Choose how to pay')).toBeVisible();
  });

  test('takes the widget back out on a client side navigation', async ({ page }) => {
    await openCart(page);

    await page.getByRole('link', { name: 'Leave without paying' }).click();

    await expect(page.getByText('The order is on its way.')).toBeVisible();
    // A client navigation, not a reload: the router swapped the tree without a round trip.
    await expect(page).toHaveURL(`${NEXT}/success`);
    await expect(widget(page)).toHaveCount(0);
  });

  test('tears the widget down quietly, over and over', async ({ page }) => {
    const complaints: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        complaints.push(message.text());
      }
    });
    page.on('pageerror', (error) => complaints.push(error.message));

    await page.addInitScript(INSTRUMENT);
    await openCart(page);

    // Three round trips. The absolute counts belong to the plain host, where no router is
    // adding its own; what this page can answer is whether tearing the widget down inside
    // somebody else's render pass is quiet, and whether the shadow root really empties.
    for (let round = 0; round < 3; round += 1) {
      await page.getByRole('link', { name: 'Leave without paying' }).click();
      await expect(page.getByText('The order is on its way.')).toBeVisible();
      await expect(page.locator('#checkout')).toHaveCount(0);

      await page.getByRole('link', { name: 'Back to the cart' }).click();
      await expect(widget(page).getByText('Choose how to pay')).toBeVisible();
    }

    const left = await outstanding(page, '#checkout');
    expect(left.nodes).toBeGreaterThan(0);

    // React warns when a root is unmounted synchronously from inside a render, which is
    // exactly what a host calling unmount() from an effect cleanup would cause.
    expect(complaints).toEqual([]);
  });

  test('sends the shopper to the receipt page when the payment lands', async ({ page }) => {
    await openCart(page);

    await widget(page).getByRole('button', { name: 'Card', exact: true }).click();
    await widget(page).getByRole('button', { name: 'Pay' }).click();

    await expect(page).toHaveURL(`${NEXT}/success`, { timeout: 15_000 });
    await expect(page.locator('#success-message')).toBeVisible();
  });
});
