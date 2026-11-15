import { expect, test } from '@playwright/test'

test('a visitor goes from the splash page to the 3×3 tutor', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Cubular' })).toBeVisible()

  await page.getByRole('link', { name: 'Solve the 3×3' }).click()

  await expect(page).toHaveURL('/app')
  await expect(page.getByRole('heading', { name: 'Tutor' })).toBeVisible()
})

test('a visitor goes from the splash page to the 2×2 Pocket Cube tutor', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: 'Solve the 2×2' }).click()

  await expect(page).toHaveURL('/app/2x2')
  await expect(page.getByRole('heading', { name: 'Tutor' })).toBeVisible()
})
