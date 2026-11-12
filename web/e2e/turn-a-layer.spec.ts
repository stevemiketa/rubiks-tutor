import { expect, test } from '@playwright/test'
import { clickFrontCenter, moveHistory } from './tutor.ts'

// With reduced motion the Scramble appears already applied, so Turns work
// as soon as the page opens. Turns themselves still animate.
test.use({ reducedMotion: 'reduce' })

test.beforeEach(async ({ page }) => {
  await page.goto('/app')
})

test('selecting a Sticker and pressing an arrow key turns a Layer', async ({ page }) => {
  await clickFrontCenter(page)
  await page.keyboard.press('ArrowUp')

  await expect(moveHistory(page)).toHaveText(["M'"])
})

test('key presses made during an animation are all kept, in order', async ({ page }) => {
  await clickFrontCenter(page)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')

  await expect(moveHistory(page)).toHaveText(['E', "M'", "E'", 'M'])
})

test('an arrow key with nothing selected asks for a Sticker', async ({ page }) => {
  await page.keyboard.press('ArrowRight')

  await expect(page.getByText('Select a Sticker first')).toBeVisible()
  await expect(moveHistory(page)).toHaveCount(0)
})

test('the on-screen buttons turn the selected Sticker’s Layers', async ({ page }) => {
  await clickFrontCenter(page)

  await page.getByRole('button', { name: "Turn right: E" }).click()
  await page.getByRole('button', { name: "Turn left: E'" }).click()

  await expect(moveHistory(page)).toHaveText(['E', "E'"])
})
