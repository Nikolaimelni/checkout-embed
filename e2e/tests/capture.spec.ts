import { expect, type Page, test } from '@playwright/test';

const OUT = '../docs/images';

const widget = (page: Page) => page.locator('#checkout');

const HOSTILE = `
  * { color: #d40000 !important; font-family: "Comic Sans MS", cursive !important;
      border-radius: 0 !important; letter-spacing: 0.06em !important; }
  h1 { text-decoration: underline wavy !important; }
`;

test.use({ viewport: { width: 900, height: 720 }, deviceScaleFactor: 2 });

test.describe('screenshots', { tag: '@docs' }, () => {
  test('the widget on a page with no framework', async ({ page }) => {
    await page.goto('/?amount=4999');
    await expect(widget(page).getByText('Choose how to pay')).toBeVisible();

    await page.screenshot({ path: `${OUT}/methods.png` });
  });

  test('the challenge, framed from the provider', async ({ page }) => {
    await page.goto('/?amount=1003');
    await expect(widget(page).getByText('Choose how to pay')).toBeVisible();
    await widget(page).getByRole('button', { name: 'Card', exact: true }).click();
    await widget(page).getByRole('button', { name: 'Pay' }).click();

    await expect(widget(page).getByRole('dialog')).toBeVisible();
    await expect(
      page.frameLocator('#checkout iframe').getByRole('button', { name: 'Approve' }),
    ).toBeVisible();

    await page.screenshot({ path: `${OUT}/challenge.png` });
  });

  test('the receipt, on the host page', async ({ page }) => {
    await page.goto('/?amount=4999');
    await expect(widget(page).getByText('Choose how to pay')).toBeVisible();
    await widget(page).getByRole('button', { name: 'Card', exact: true }).click();
    await widget(page).getByRole('button', { name: 'Pay' }).click();

    await expect(widget(page).getByRole('status')).toHaveText('Payment complete', {
      timeout: 15_000,
    });
    await expect(page.locator('#receipt')).toContainText('Paid.');

    await page.screenshot({ path: `${OUT}/receipt.png` });
  });

  test('the same widget on a page that is fighting it', async ({ page }) => {
    await page.goto('/?amount=4999');
    await expect(widget(page).getByText('Choose how to pay')).toBeVisible();

    await page.addStyleTag({ content: HOSTILE });
    await page.waitForTimeout(150);

    await page.screenshot({ path: `${OUT}/hostile.png` });
  });
});
