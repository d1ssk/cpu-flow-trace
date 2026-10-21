import { test, expect } from '@playwright/test';
import { articles, articleGroups } from '../../src/articles';

test('static article entries can be opened and reloaded, then return home', async ({ page }) => {
  test.setTimeout(90000);
  for (const locale of ['ja', 'en']) {
    for (const article of articles) {
      const response = await page.goto(`/${locale}/learn/${article.id}/`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(article.title[locale as 'ja' | 'en']);
      await expect(page.locator('.article-placeholder')).toBeVisible();
      await page.reload();
      await expect(page.locator('.article-placeholder')).toBeVisible();
      await page.locator('.primary-link').click();
      await expect(page.locator('.circuit-svg')).toBeVisible();
    }
  }
});

test('article index groups all thirteen entries and keeps the reading order across languages', async ({ page }) => {
  await page.goto('/ja/learn/');
  await expect(page.locator('.article-card')).toHaveCount(13);
  await expect(page.locator('.article-group h2')).toHaveText(articleGroups.map(group => group.title.ja));
  await expect(page.locator('.article-card h3')).toHaveText(articles.map(article => article.title.ja));
  await expect(page.locator('main')).not.toContainText('レッスン');
  await page.screenshot({ path: 'test-results/articles-ja.png', fullPage: true });
  await page.locator('.article-card').first().click();
  await expect(page.locator('.previous-article')).toHaveCount(0);
  for (let index = 1; index < articles.length; index++) {
    await page.locator('.next-article').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(articles[index].title.ja);
    await expect(page.locator('.previous-article')).toHaveAttribute('href', `/ja/learn/${articles[index - 1].id}/`);
  }
  await expect(page.locator('.next-article')).toHaveCount(0);
  await page.getByRole('link', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(articles[12].title.en);
  await page.locator('.previous-article').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(articles[11].title.en);
  await page.locator('.back-link').click();
  await expect(page.locator('.article-group h2')).toHaveText(articleGroups.map(group => group.title.en));
  await expect(page.locator('.article-card h3')).toHaveText(articles.map(article => article.title.en));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('heading', { name: 'The complete CPU', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.locator('.article-card').last()).toBeVisible();
  await page.screenshot({ path: 'test-results/articles-mobile-en.png', fullPage: true });
});
