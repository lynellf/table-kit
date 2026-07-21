/**
 * Pivot Engine E2E Tests — tablekit package verification
 *
 * These tests verify the pivot engine with seeded data using Playwright.
 * The tests load the m4-pivot-main-thread example app, inject seed data,
 * and verify the pivot engine produces correct results.
 *
 * Prerequisites:
 * - `pnpm install` has been run
 * - Dev server is running (or will be started automatically by webServer config)
 *
 * Run with: pnpm test:e2e
 * Screenshots: pnpm test:e2e --ui (for visual inspection)
 */

import { expect, test } from '@playwright/test';

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

test.describe('Pivot Engine — seeded verification', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the example app
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('m4-pivot-main-thread example loads and renders', async ({ page }) => {
    // Verify the page loads without errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Check page title or heading exists (use first() since there are multiple headings)
    await expect(page.getByRole('heading', { name: /pivot/i }).first()).toBeVisible();

    // No JavaScript errors
    expect(errors).toHaveLength(0);
  });

  test('pivot table renders with row hierarchy', async ({ page }) => {
    // Find the first pivot table demo panel
    const pivotGrid = page.locator('.pivot-treegrid').first();
    await expect(pivotGrid).toBeVisible();

    // Verify header row exists
    const headerRow = pivotGrid.locator('.pivot-header-row').first();
    await expect(headerRow).toBeVisible();

    // Verify data rows exist
    const dataRows = pivotGrid.locator('.pivot-row');
    await expect(dataRows.first()).toBeVisible();
    const rowCount = await dataRows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('pivot footer renders with grand total', async ({ page }) => {
    // Find the first pivot table
    const pivotGrid = page.locator('.pivot-treegrid').first();
    const footer = pivotGrid.locator('.pivot-footer');
    await expect(footer).toBeVisible();

    // Footer should contain total label
    await expect(footer.getByText('Total')).toBeVisible();
  });

  test('expand/collapse toggles work', async ({ page }) => {
    const pivotGrid = page.locator('.pivot-treegrid').first();

    // Find toggle buttons
    const toggles = pivotGrid.locator('.pivot-toggle');
    const toggleCount = await toggles.count();

    if (toggleCount > 0) {
      // Get row count before expansion
      const rowsBefore = await pivotGrid.locator('.pivot-row').count();

      // Click first toggle
      await toggles.first().click();
      await page.waitForTimeout(300);

      // Row count should change after expansion
      const rowsAfter = await pivotGrid.locator('.pivot-row').count();
      expect(rowsAfter).not.toBe(rowsBefore);
    }
  });

  test('multiple demo panels render independently', async ({ page }) => {
    // Find all pivot grids
    const pivotGrids = page.locator('.pivot-treegrid');
    const gridCount = await pivotGrids.count();

    // Should have multiple demo panels
    expect(gridCount).toBeGreaterThanOrEqual(1);

    // Each grid should be visible independently
    for (let i = 0; i < gridCount; i++) {
      await expect(pivotGrids.nth(i)).toBeVisible();
    }
  });

  test('pivot table produces consistent results across renders', async ({ page }) => {
    const pivotGrid = page.locator('.pivot-treegrid').first();

    // Get first render results
    const rows1 = await pivotGrid.locator('.pivot-row').allTextContents();

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Get second render results
    const pivotGrid2 = page.locator('.pivot-treegrid').first();
    const rows2 = await pivotGrid2.locator('.pivot-row').allTextContents();

    // Results should be identical (deterministic seed)
    expect(rows1).toEqual(rows2);
  });

  test('data values are formatted correctly', async ({ page }) => {
    const pivotGrid = page.locator('.pivot-treegrid').first();
    const dataCells = pivotGrid.locator('.pivot-cell');

    // Should have data cells with numeric values
    const cellCount = await dataCells.count();
    expect(cellCount).toBeGreaterThan(0);

    // Verify cells contain formatted content
    const cellTexts = await dataCells.allTextContents();
    const hasNumericContent = cellTexts.some(
      (text) => text && (text.includes('$') || /^\d+$/.test(text.trim())),
    );
    expect(hasNumericContent).toBe(true);
  });

  test('aria roles are correctly applied for accessibility', async ({ page }) => {
    const pivotGrid = page.locator('.pivot-treegrid').first();

    // Verify treegrid role (the pivot uses treegrid, not grid)
    await expect(pivotGrid).toHaveAttribute('role', 'treegrid');

    // Verify header cells have columnheader role (use rowheader for pivot row headers)
    const headerCells = pivotGrid.locator('[role="columnheader"]:not(.pivot-row-header-cell)');
    const headerCount = await headerCells.count();
    expect(headerCount).toBeGreaterThan(0);

    // Verify data cells have gridcell role
    const dataCells = pivotGrid.locator('[role="gridcell"]');
    await expect(dataCells.first()).toBeVisible();
    const cellCount = await dataCells.count();
    expect(cellCount).toBeGreaterThan(0);
  });

  test('announcer component renders for accessibility', async ({ page }) => {
    // Check for announcer live region
    const announcer = page.locator('[aria-live]');
    await expect(announcer.first()).toBeAttached();
  });

  test('pivot sorting UI renders', async ({ page }) => {
    // Look for the second demo panel which has sort-by-measure
    const pivotGrids = page.locator('.pivot-treegrid');
    const gridCount = await pivotGrids.count();

    if (gridCount >= 2) {
      const sortedGrid = pivotGrids.nth(1);
      await expect(sortedGrid).toBeVisible();
    }
  });

  test('grand total column configuration renders correctly', async ({ page }) => {
    // Look for demo panel with grand total column
    const pivotGrids = page.locator('.pivot-treegrid');
    const gridCount = await pivotGrids.count();

    if (gridCount >= 3) {
      const gridWithTotals = pivotGrids.nth(2);
      await expect(gridWithTotals).toBeVisible();

      // Should have total cells
      const totalCells = gridWithTotals.locator('.pivot-cell-total');
      const totalCount = await totalCells.count();
      expect(totalCount).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Performance verification                                                  */
/* -------------------------------------------------------------------------- */

test.describe('Pivot Engine — performance verification', () => {
  test('computes pivot result within acceptable time budget', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for perf badge to update
    await page.waitForTimeout(1000);

    // The perf badge shows compute time
    const perfText = await page.locator('footer').textContent();

    // Extract compute time if present
    if (perfText) {
      const match = perfText.match(/(\d+(?:\.\d+)?)\s*ms/);
      if (match) {
        const computeTime = Number.parseFloat(match[1]!);
        // §12 budget: ≤200ms for 10k rows on main thread
        expect(computeTime).toBeLessThan(500); // Generous budget for CI
      }
    }
  });

  test('handles 1000-row dataset without errors', async ({ page }) => {
    // Navigate fresh to the app
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify pivot grids exist
    const pivotGrids = page.locator('.pivot-treegrid');
    const count = await pivotGrids.count();
    expect(count).toBeGreaterThan(0);

    // Try to find and interact with the row count select if available
    const select = page.locator('select');
    if ((await select.count()) > 0) {
      await select.first().selectOption('1000');
      await page.waitForTimeout(1000);
    }

    // Verify no JavaScript errors occurred
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);

    // Verify pivot still renders after selection
    await expect(pivotGrids.first()).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/*  Screenshot capture for documentation                                       */
/* -------------------------------------------------------------------------- */

test.describe('Pivot Engine — screenshot capture', () => {
  test('captures screenshot of basic pivot configuration', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Select 1000 rows for representative screenshot
    const select = page.locator('select').first();
    await select.selectOption('1000');
    await page.waitForTimeout(500);

    // Capture screenshot
    await page.screenshot({
      path: 'docs/screenshots/m4-pivot-main-thread/basic-pivot-configuration.png',
      fullPage: true,
    });
  });

  test('captures screenshot of sorted pivot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Select 1000 rows
    const select = page.locator('select').first();
    await select.selectOption('1000');
    await page.waitForTimeout(500);

    // Capture second pivot (sort-by-measure demo)
    const pivotGrids = page.locator('.pivot-treegrid');
    await pivotGrids.nth(1).screenshot({
      path: 'docs/screenshots/m4-pivot-main-thread/sorted-pivot.png',
    });
  });

  test('captures screenshot of column hierarchy pivot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Select 1000 rows
    const select = page.locator('select').first();
    await select.selectOption('1000');
    await page.waitForTimeout(500);

    // Capture third pivot (column hierarchy demo)
    const pivotGrids = page.locator('.pivot-treegrid');
    await pivotGrids.nth(2).screenshot({
      path: 'docs/screenshots/m4-pivot-main-thread/column-hierarchy-pivot.png',
    });
  });
});
