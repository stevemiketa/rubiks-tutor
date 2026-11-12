import { expect, test, type Page } from '@playwright/test'
import { progress, solutionPanel, stages } from './tutor.ts'

async function movesPlayed(page: Page): Promise<{ played: number; total: number }> {
  const [played, total] = ((await progress(page).textContent()) ?? '').match(/\d+/g)?.map(Number) ?? []
  if (played === undefined || total === undefined) throw new Error('no Playback progress shown')
  return { played, total }
}

test('Solve waits until the Scramble has finished', async ({ page }) => {
  await page.goto('/app')
  const solve = solutionPanel(page).getByRole('button', { name: 'Solve' })

  await expect(page.getByText('Scrambling…')).toBeVisible()
  await expect(solve).toBeDisabled()

  await expect(page.getByText('Scrambling…')).toBeHidden({ timeout: 4000 })
  await expect(solve).toBeEnabled()
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('Solve lists the Stages, and Play and Pause animate through the Solution', async ({ page }) => {
    await page.goto('/app')
    const panel = solutionPanel(page)

    await panel.getByRole('button', { name: 'Solve' }).click()

    await expect(stages(page)).toHaveText(['White cross'])
    await expect(progress(page)).toHaveText(/^0 of \d+ Moves played$/)
    const { total } = await movesPlayed(page)
    expect(total).toBeGreaterThan(1)

    await panel.getByRole('button', { name: 'Play' }).click()
    await panel.getByRole('button', { name: 'Pause' }).click()
    await expect(panel.getByRole('button', { name: 'Play' })).toBeEnabled()
    // Paused: the Move animating finishes, and Playback goes no further.
    const paused = await movesPlayed(page)
    await page.waitForTimeout(1000)
    expect(await movesPlayed(page)).toEqual(paused)
    expect(paused.played).toBeLessThan(total)

    await panel.getByRole('button', { name: 'Play' }).click()

    await expect(progress(page)).toHaveText(`${total} of ${total} Moves played`, { timeout: total * 400 + 5000 })
    await expect(panel.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  test('Solve on an already-solved Cube says so', async ({ page }) => {
    // A journey can't solve a random Scramble by hand, so the server's answer
    // for a solved Cube (covered by the Go API tests) stands in.
    await page.route('**/api/solve', (route) => route.fulfill({ json: { solved: true } }))
    await page.goto('/app')

    await solutionPanel(page).getByRole('button', { name: 'Solve' }).click()

    await expect(solutionPanel(page).getByText('The Cube is already solved.')).toBeVisible()
    await expect(stages(page)).toHaveCount(0)
  })

  test('a failed Solve says so, and Retry tries again', async ({ page }) => {
    await page.route('**/api/solve', (route) => route.abort('internetdisconnected'))
    await page.goto('/app')

    await solutionPanel(page).getByRole('button', { name: 'Solve' }).click()

    const error = solutionPanel(page).getByRole('alert')
    await expect(error).toContainText('Solve couldn’t get a Solution')
    await page.unroute('**/api/solve')
    await error.getByRole('button', { name: 'Retry' }).click()

    await expect(error).toBeHidden()
    await expect(stages(page)).toHaveText(['White cross'])
  })
})
