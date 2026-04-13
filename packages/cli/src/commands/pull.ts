import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import ora from 'ora'
import { apiGet } from '../api'
import { printSuccess, printError, printInfo } from '../format'

interface FeedFile {
  id: string
  name: string
  content: string
  layer: 'core' | 'context'
}

interface FeedPackage {
  id: string
  iterationId: string
  name: string
  phase: string
  status: string
  promptId: string | null
  coreFiles: FeedFile[]
  contextFiles: FeedFile[]
  dependsOn: string[]
  canParallel: boolean
  assigneeId: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

interface PaginatedFeeds {
  items: FeedPackage[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface AssembledFeed {
  feedPackageId: string
  feedName: string
  content: string
}

export const pullCommand = new Command('pull')
  .description('Pull feed packages and write assembled content to local files')
  .option('--iteration <id>', 'Filter by iteration ID')
  .option('--output <dir>', 'Output directory', './aipm-feeds/')
  .action(async (options: { iteration?: string; output: string }) => {
    const { iteration, output } = options
    const outputDir = path.resolve(output)

    const spinner = ora('Fetching feed packages...').start()

    try {
      // Build query path
      let feedPath = '/api/v1/feeds?pageSize=100'
      if (iteration) {
        feedPath += `&iterationId=${encodeURIComponent(iteration)}`
      }

      // Fetch feed list
      const feeds = await apiGet<PaginatedFeeds>(feedPath)

      if (!feeds.items || feeds.items.length === 0) {
        spinner.stop()
        printInfo('No feed packages found.')
        return
      }

      spinner.text = `Assembling ${feeds.items.length} feed packages...`

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      let pulledCount = 0

      for (const feed of feeds.items) {
        spinner.text = `Assembling: ${feed.name}...`

        try {
          const assembled = await apiGet<AssembledFeed>(
            `/api/v1/feeds/${feed.id}/assemble`
          )

          // Sanitize feed name for filename
          const safeName = feed.name
            .replace(/[<>:"/\\|?*]/g, '-')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')

          const filePath = path.join(outputDir, `${safeName}.md`)
          fs.writeFileSync(filePath, assembled.content, 'utf-8')
          pulledCount++
        } catch (err) {
          spinner.stop()
          const message = err instanceof Error ? err.message : 'Unknown error'
          printError(`Failed to assemble feed "${feed.name}": ${message}`)
          spinner.start()
        }
      }

      spinner.stop()
      printSuccess(`Pulled ${pulledCount} feed packages to ${output}`)
    } catch (err) {
      spinner.stop()
      const message = err instanceof Error ? err.message : 'Unknown error'
      printError(`Pull failed: ${message}`)
      process.exit(1)
    }
  })
