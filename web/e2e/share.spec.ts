import { expect, test, type Page } from '@playwright/test'
import { clickFrontCenter, moveHistory, scramble } from './tutor.ts'

const shareButton = (page: Page) => page.getByRole('button', { name: 'Share', exact: true })

test('Share waits for the Scramble to finish', async ({ page }) => {
  await page.goto('/app')

  await expect(page.getByText('Scrambling…')).toBeVisible()
  await expect(shareButton(page)).toBeDisabled()
  await expect(page.getByText('Scrambling…')).toBeHidden({ timeout: 4000 })
  await expect(shareButton(page)).toBeEnabled()
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a share link opens the same Cube and Move history in a fresh browser', async ({ page, browser }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/app')
    const shared = (await scramble(page).textContent()) ?? ''
    await clickFrontCenter(page)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(moveHistory(page)).toHaveText(["M'", 'E', 'y'])

    await shareButton(page).click()
    const dialog = page.getByRole('dialog', { name: 'Share this Cube' })
    const link = dialog.getByRole('textbox', { name: 'Share link' })
    await expect(link).toHaveValue(/^http:\/\/127\.0\.0\.1:\d+\/s\/[\w-]{10}$/)
    const url = await link.inputValue()
    // The address bar shows the share link too.
    await expect(page).toHaveURL(url)
    await dialog.getByRole('button', { name: 'Copy link' }).click()
    await expect(dialog.getByText('Copied.')).toBeVisible()
    // The spec files have no DOM types, so the page runs this as a string.
    expect(await page.evaluate('navigator.clipboard.readText()')).toBe(url)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()

    // Someone else, with nothing saved in their browser.
    const recipientContext = await browser.newContext({ reducedMotion: 'reduce' })
    const recipient = await recipientContext.newPage()
    await recipient.goto(url)

    await expect(moveHistory(recipient)).toHaveText(["M'", 'E', 'y'])
    await expect(scramble(recipient)).toHaveText(shared)
    await expect(recipient).toHaveURL(url)

    // Their first Move makes it their own Session, at the tutor's address,
    // which a reload restores.
    await clickFrontCenter(recipient)
    await recipient.keyboard.press('ArrowDown')
    await expect(moveHistory(recipient)).toHaveText(["M'", 'E', 'y', 'M'])
    await expect(recipient).toHaveURL(/\/app$/)
    await recipient.reload()
    await expect(moveHistory(recipient)).toHaveText(["M'", 'E', 'y', 'M'])
    await recipientContext.close()

    // The link still opens the Snapshot as it was shared.
    const laterContext = await browser.newContext({ reducedMotion: 'reduce' })
    const later = await laterContext.newPage()
    await later.goto(url)
    await expect(moveHistory(later)).toHaveText(["M'", 'E', 'y'])
    await laterContext.close()

    // The sharer's next Move takes their address back to the tutor too.
    await clickFrontCenter(page)
    await page.keyboard.press('ArrowUp')
    await expect(page).toHaveURL(/\/app$/)
  })

  test('an unknown share link says "Snapshot not found" and can start a new Session', async ({ page }) => {
    await page.goto('/s/AAAAAAAAAA')

    await expect(page.getByRole('heading', { name: 'Snapshot not found' })).toBeVisible()
    await expect(shareButton(page)).toBeDisabled()

    await page.getByRole('button', { name: 'Start a new Session' }).click()

    await expect(page).toHaveURL(/\/app$/)
    await expect(scramble(page)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Snapshot not found' })).toHaveCount(0)
  })
})
