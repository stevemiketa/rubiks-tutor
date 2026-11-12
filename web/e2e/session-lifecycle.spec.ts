import { expect, test } from '@playwright/test'
import { clickFrontCenter, moveHistory, scramble } from './tutor.ts'

// Every test gets a fresh browser context, so each starts with empty storage
// and therefore a new Session.

test('a new Session scrambles itself, and Turns wait until the Scramble finishes', async ({ page }) => {
  await page.goto('/app')

  await expect(scramble(page)).toBeVisible()
  await expect(page.getByText('Scrambling…')).toBeVisible()
  await clickFrontCenter(page)
  await expect(page.getByRole('button', { name: "Turn up: M'" })).toBeDisabled()
  // Ignored: the Scramble is still playing.
  await page.keyboard.press('ArrowUp')

  // It plays in about two seconds.
  await expect(page.getByText('Scrambling…')).toBeHidden({ timeout: 4000 })
  await expect(page.getByRole('button', { name: "Turn up: M'" })).toBeEnabled()
  await expect(moveHistory(page)).toHaveCount(0)

  await page.keyboard.press('ArrowUp')
  await expect(moveHistory(page)).toHaveText(["M'"])
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the Scramble appears already applied', async ({ page }) => {
    await page.goto('/app')

    await expect(scramble(page)).toBeVisible()
    await expect(page.getByText('Scrambling…')).toHaveCount(0)
    await clickFrontCenter(page)
    expect(await page.getByRole('button', { name: "Turn up: M'" }).isEnabled()).toBe(true)
  })

  test('"New scramble" starts over at once when no Moves were made', async ({ page }) => {
    await page.goto('/app')
    const first = await scramble(page).textContent()

    await page.getByRole('button', { name: 'New scramble', exact: true }).click()

    await expect(scramble(page)).not.toHaveText(first ?? '')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
  })

  test('"New scramble" asks first, in the page, once Moves were made', async ({ page }) => {
    // The question must be part of the page, never a browser dialog.
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.dismiss()
    })
    await page.goto('/app')
    const first = (await scramble(page).textContent()) ?? ''
    await clickFrontCenter(page)
    await page.keyboard.press('ArrowUp')
    await expect(moveHistory(page)).toHaveText(["M'"])

    await page.getByRole('button', { name: 'New scramble', exact: true }).click()
    const question = page.getByRole('alertdialog', { name: 'Start a new scramble?' })
    await expect(question).toBeVisible()
    await question.getByRole('button', { name: 'Keep this Cube' }).click()

    await expect(question).toBeHidden()
    await expect(scramble(page)).toHaveText(first)
    await expect(moveHistory(page)).toHaveText(["M'"])

    await page.getByRole('button', { name: 'New scramble', exact: true }).click()
    await question.getByRole('button', { name: 'Start a new scramble' }).click()

    await expect(question).toBeHidden()
    await expect(scramble(page)).not.toHaveText(first)
    await expect(moveHistory(page)).toHaveCount(0)
    expect(dialogs).toEqual([])
  })

  test('the Session survives a reload', async ({ page }) => {
    await page.goto('/app')
    const first = (await scramble(page).textContent()) ?? ''
    await clickFrontCenter(page)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    await expect(moveHistory(page)).toHaveText(["M'", 'E'])

    await page.reload()

    await expect(scramble(page)).toHaveText(first)
    await expect(moveHistory(page)).toHaveText(["M'", 'E'])
  })
})

test('a reload during the Scramble restores the same Scramble, already applied', async ({ page }) => {
  await page.goto('/app')
  await expect(page.getByText('Scrambling…')).toBeVisible()
  const first = (await scramble(page).textContent()) ?? ''

  await page.reload()

  await expect(scramble(page)).toHaveText(first)
  await expect(page.getByText('Scrambling…')).toHaveCount(0)
})
