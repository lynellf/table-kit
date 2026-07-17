import { expect, test } from '@playwright/test';

test.describe('Functional parity browser host', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?functional-parity');
    await page.waitForLoadState('networkidle');
  });

  test('renders all four deterministic component scenarios', async ({ page }) => {
    await expect(page.getByTestId('client-data-grid').getByRole('grid')).toBeVisible();
    await expect(page.getByTestId('server-data-grid').getByRole('grid')).toBeVisible();
    await expect(page.getByTestId('client-pivot-grid').getByRole('treegrid')).toBeVisible();
    await expect(page.getByTestId('server-pivot-grid').getByRole('treegrid')).toBeVisible();
    await expect(page.getByTestId('server-data-grid').getByText('Person 001')).toBeVisible();
    await expect(page.getByTestId('server-pivot-grid').getByText('West')).toBeVisible();
  });

  test('keeps focused identity mounted while bounding virtualized DOM', async ({ page }) => {
    const scenario = page.getByTestId('client-data-grid');
    const grid = scenario.getByRole('grid');
    const firstCell = scenario.locator('[data-cell-id="1:name"]');
    await firstCell.focus();
    await expect(firstCell).toBeFocused();

    await grid.evaluate((element) => {
      element.scrollTop = 1_200;
      element.scrollLeft = 1_000;
      element.dispatchEvent(new Event('scroll'));
    });

    await expect(firstCell).toBeAttached();
    await expect.poll(() => scenario.locator('.tk-grid-row').count()).toBeLessThan(30);
    await expect
      .poll(() => scenario.locator('.tk-grid-column-header').count())
      .toBeLessThanOrEqual(12);
  });

  test('preserves browser click ordering and rejects a stale server page', async ({ page }) => {
    const client = page.getByTestId('client-data-grid');
    await client.getByText('Person 001').dblclick();
    await expect(page.getByTestId('event-log')).toContainText(
      'cell-click:1:name|row-click:1|cell-click:1:name|row-click:1|cell-double-click:1:name|row-double-click:1',
    );

    const server = page.getByTestId('server-data-grid');
    await expect(server.getByText('Person 001')).toBeVisible();
    await server.getByRole('button', { name: 'Next' }).click();
    await server.getByRole('button', { name: 'Sort name' }).click();
    await expect(server.getByText('Page 1 of 8')).toBeVisible();
    await expect(server.getByText('Person 001')).toBeVisible();
    await expect(server.getByText('Person 026')).toHaveCount(0);
  });

  test('expands client and server pivot paths with correct ARIA state', async ({ page }) => {
    for (const scenarioId of ['client-pivot-grid', 'server-pivot-grid']) {
      const scenario = page.getByTestId(scenarioId);
      const toggle = scenario.getByRole('button', { name: 'Expand West' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(scenario.getByText('Q1')).toBeVisible();
      await expect(scenario.getByRole('button', { name: 'Collapse West' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    }
  });
});
