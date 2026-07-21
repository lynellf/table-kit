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

  test('freezes DataGrid columns and atomic PivotGrid groups in one scroll viewport', async ({
    page,
  }) => {
    const clientGrid = page.getByTestId('client-data-grid');
    const gridViewport = clientGrid.getByRole('grid');
    const selectionHeader = clientGrid.getByRole('columnheader', { name: 'Row selection' });
    const leftHeader = clientGrid.getByRole('columnheader', { name: 'Name' });
    const rightHeader = clientGrid.getByRole('columnheader', { name: 'Detail 12' });
    const leftGridCell = clientGrid.locator('[data-cell-id="1:name"]');
    const rightGridCell = clientGrid.locator('[data-cell-id="1:detail-11"]');

    await expect(leftHeader).toHaveAttribute('data-pinned', 'left');
    await expect(rightHeader).toHaveAttribute('data-pinned', 'right');
    const gridBoxesBefore = await Promise.all([
      selectionHeader.boundingBox(),
      leftHeader.boundingBox(),
      rightHeader.boundingBox(),
      leftGridCell.boundingBox(),
      rightGridCell.boundingBox(),
    ]);

    await gridViewport.evaluate((element) => {
      element.scrollLeft = 900;
      element.dispatchEvent(new Event('scroll'));
    });

    const gridPinnedElements = [
      selectionHeader,
      leftHeader,
      rightHeader,
      leftGridCell,
      rightGridCell,
    ];
    for (const [index, element] of gridPinnedElements.entries()) {
      const before = gridBoxesBefore[index];
      expect(before).not.toBeNull();
      await expect
        .poll(async () => Math.abs(((await element.boundingBox())?.x ?? 0) - (before?.x ?? 0)))
        .toBeLessThan(1);
    }
    await expect(leftHeader).toHaveCount(1);
    await expect(rightHeader).toHaveCount(1);
    await expect(leftGridCell).toHaveCount(1);
    await expect(rightGridCell).toHaveCount(1);

    const clientPivot = page.getByTestId('client-pivot-grid');
    const pivotViewport = clientPivot.getByRole('treegrid');
    const pivotRowHeader = clientPivot.getByRole('rowheader', { name: 'West' });
    const leftPivotHeader = clientPivot.getByRole('columnheader', { name: '2024' });
    const rightPivotHeader = clientPivot.getByRole('columnheader', { name: '__total__' });
    const promotedPivotCell = clientPivot
      .locator('[data-pivot-cell-id][data-column-id="[2024]::sales_avg"]')
      .first();

    await expect(leftPivotHeader).toHaveAttribute('data-pinned', 'left');
    await expect(rightPivotHeader).toHaveAttribute('data-pinned', 'right');
    await expect(promotedPivotCell).toHaveAttribute('data-pinned', 'left');
    const pivotBoxesBefore = await Promise.all([
      pivotRowHeader.boundingBox(),
      leftPivotHeader.boundingBox(),
      rightPivotHeader.boundingBox(),
      promotedPivotCell.boundingBox(),
    ]);

    await pivotViewport.evaluate((element) => {
      element.scrollLeft = 200;
      element.dispatchEvent(new Event('scroll'));
    });

    const pivotPinnedElements = [
      pivotRowHeader,
      leftPivotHeader,
      rightPivotHeader,
      promotedPivotCell,
    ];
    for (const [index, element] of pivotPinnedElements.entries()) {
      const before = pivotBoxesBefore[index];
      expect(before).not.toBeNull();
      await expect
        .poll(async () => Math.abs(((await element.boundingBox())?.x ?? 0) - (before?.x ?? 0)))
        .toBeLessThan(1);
    }
    await expect(leftPivotHeader).toHaveCount(1);
    await expect(rightPivotHeader).toHaveCount(1);
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
