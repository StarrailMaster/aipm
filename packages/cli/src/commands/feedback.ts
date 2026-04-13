import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { apiPost } from '../api'
import { printSuccess, printError } from '../format'

interface FeedbackResponse {
  id: string
  rawDescription: string
  status: string
  iterationId: string | null
  feedPackageId: string | null
  createdAt: number
}

export const feedbackCommand = new Command('feedback')
  .description('Submit feedback for experience capture')
  .requiredOption('--description <text>', 'Feedback description (required)')
  .option('--iteration <id>', 'Associated iteration ID')
  .option('--feed <id>', 'Associated feed package ID')
  .action(async (options: { description: string; iteration?: string; feed?: string }) => {
    const { description, iteration, feed } = options

    const spinner = ora('Submitting feedback...').start()

    try {
      const body: Record<string, unknown> = {
        rawDescription: description,
      }
      if (iteration) {
        body.iterationId = iteration
      }
      if (feed) {
        body.feedPackageId = feed
      }

      const data = await apiPost<FeedbackResponse>('/api/v1/feedback', body)

      spinner.stop()
      printSuccess('Feedback submitted successfully')
      console.log(`  ID:     ${chalk.cyan(data.id)}`)
      console.log(`  Status: ${chalk.yellow(data.status)}`)
    } catch (err) {
      spinner.stop()
      const message = err instanceof Error ? err.message : 'Unknown error'
      printError(`Feedback submission failed: ${message}`)
      process.exit(1)
    }
  })
