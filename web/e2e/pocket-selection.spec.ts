import { expect, test } from '@playwright/test'
import { moveHistory } from './tutor.ts'

// The 2×2 Pocket Cube shows only its corner Stickers, so the keyboard selects
// corners and nothing else: never the front face's center, which is a Phantom
// Sticker it never draws (ADR 0005).
test.use({ reducedMotion: 'reduce' })

// Reach the 2×2 the way the app does, through the splash picker: a hard load of
// /app/2x2 is served by client-side routing, not the server.
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Solve the 2×2' }).click()
  await expect(page).toHaveURL('/app/2x2')
  await expect(page.getByRole('heading', { name: 'Tutor' })).toBeVisible()
})

test('the keyboard selects only corners, never the phantom center', async ({ page }) => {
  // With no selection, the first press lands on the front face's top-left
  // corner — the 3×3 would start on its center, which the 2×2 doesn't have.
  await page.keyboard.press('d')
  await expect(page.getByText('Selected: front face, top-left')).toBeVisible()

  // Stepping hops corner to corner, skipping the frozen middle Stickers.
  await page.keyboard.press('d')
  await expect(page.getByText('Selected: front face, top-right')).toBeVisible()

  await page.keyboard.press('s')
  await expect(page.getByText('Selected: front face, bottom-right')).toBeVisible()

  // Across the edge the front and right faces share on screen.
  await page.keyboard.press('d')
  await expect(page.getByText('Selected: right face, bottom-left')).toBeVisible()
})

test('turning through a corner is an outer-layer Move, never a slice', async ({ page }) => {
  await page.keyboard.press('d')
  await expect(page.getByText('Selected: front face, top-left')).toBeVisible()

  // The arrow turns the Layer through the corner: an outer face Turn (L'), not
  // a middle slice (M/E/S), which a 2×2 has no Pieces to turn.
  await page.keyboard.press('ArrowUp')
  await expect(moveHistory(page)).toHaveText(["L'"])
})
