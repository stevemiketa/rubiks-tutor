import { expect, test } from '@playwright/test'

test('a visitor goes from the splash page to the tutor', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Cubular' })).toBeVisible()

  await page.getByRole('link', { name: 'Start solving' }).click()

  await expect(page).toHaveURL('/app')
  await expect(page.getByRole('heading', { name: 'Tutor' })).toBeVisible()
})
