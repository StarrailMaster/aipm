import { Command } from 'commander'
import ora from 'ora'
import { apiGet } from '../api'
import { printTable, printError, printInfo } from '../format'

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface PromptItem {
  id: string
  name: string
  category: string
  tags: string[]
  visibility: string
  starCount: number
  forkCount: number
  createdAt: number
}

interface SkillItem {
  id: string
  name: string
  category: string
  tags: string[]
  visibility: string
  starCount: number
  forkCount: number
  createdAt: number
}

interface FeedItem {
  id: string
  name: string
  phase: string
  status: string
  canParallel: boolean
  sortOrder: number
  createdAt: number
}

interface TemplateItem {
  id: string
  name: string
  category: string
  visibility: string
  starCount: number
  forkCount: number
  createdAt: number
}

function buildQuery(options: { page?: string; category?: string }): string {
  const params = new URLSearchParams()
  if (options.page) {
    params.set('page', options.page)
  }
  if (options.category) {
    params.set('category', options.category)
  }
  params.set('pageSize', '20')
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

function formatPagination(data: PaginatedResponse<unknown>): string {
  return `Page ${data.page}/${data.totalPages} (${data.total} total)`
}

// --- Subcommand: prompts ---

const promptsCommand = new Command('prompts')
  .description('List prompts')
  .option('--page <n>', 'Page number')
  .option('--category <cat>', 'Filter by category')
  .action(async (options: { page?: string; category?: string }) => {
    const spinner = ora('Fetching prompts...').start()

    try {
      const query = buildQuery(options)
      const data = await apiGet<PaginatedResponse<PromptItem>>(`/api/v1/prompts${query}`)

      spinner.stop()

      if (!data.items || data.items.length === 0) {
        printInfo('No prompts found.')
        return
      }

      printTable(
        ['Name', 'Category', 'Tags', 'Visibility', 'Stars', 'Forks'],
        data.items.map((p) => [
          p.name,
          p.category,
          p.tags.join(', '),
          p.visibility,
          String(p.starCount),
          String(p.forkCount),
        ])
      )
      console.log()
      printInfo(formatPagination(data))
    } catch (err) {
      spinner.stop()
      const message = err instanceof Error ? err.message : 'Unknown error'
      printError(`Failed to list prompts: ${message}`)
      process.exit(1)
    }
  })

// --- Subcommand: skills ---

const skillsCommand = new Command('skills')
  .description('List skills')
  .option('--page <n>', 'Page number')
  .option('--category <cat>', 'Filter by category')
  .action(async (options: { page?: string; category?: string }) => {
    const spinner = ora('Fetching skills...').start()

    try {
      const query = buildQuery(options)
      const data = await apiGet<PaginatedResponse<SkillItem>>(`/api/v1/skills${query}`)

      spinner.stop()

      if (!data.items || data.items.length === 0) {
        printInfo('No skills found.')
        return
      }

      printTable(
        ['Name', 'Category', 'Tags', 'Visibility', 'Stars', 'Forks'],
        data.items.map((s) => [
          s.name,
          s.category,
          s.tags.join(', '),
          s.visibility,
          String(s.starCount),
          String(s.forkCount),
        ])
      )
      console.log()
      printInfo(formatPagination(data))
    } catch (err) {
      spinner.stop()
      const message = err instanceof Error ? err.message : 'Unknown error'
      printError(`Failed to list skills: ${message}`)
      process.exit(1)
    }
  })

// --- Subcommand: feeds ---

const feedsCommand = new Command('feeds')
  .description('List feed packages')
  .option('--page <n>', 'Page number')
  .action(async (options: { page?: string }) => {
    const spinner = ora('Fetching feed packages...').start()

    try {
      const query = buildQuery(options)
      const data = await apiGet<PaginatedResponse<FeedItem>>(`/api/v1/feeds${query}`)

      spinner.stop()

      if (!data.items || data.items.length === 0) {
        printInfo('No feed packages found.')
        return
      }

      printTable(
        ['Name', 'Phase', 'Status', 'Parallel', 'Order'],
        data.items.map((f) => [
          f.name,
          f.phase,
          f.status,
          f.canParallel ? 'Yes' : 'No',
          String(f.sortOrder),
        ])
      )
      console.log()
      printInfo(formatPagination(data))
    } catch (err) {
      spinner.stop()
      const message = err instanceof Error ? err.message : 'Unknown error'
      printError(`Failed to list feeds: ${message}`)
      process.exit(1)
    }
  })

// --- Subcommand: templates ---

const templatesCommand = new Command('templates')
  .description('List templates')
  .option('--page <n>', 'Page number')
  .option('--category <cat>', 'Filter by category')
  .action(async (options: { page?: string; category?: string }) => {
    const spinner = ora('Fetching templates...').start()

    try {
      const query = buildQuery(options)
      const data = await apiGet<PaginatedResponse<TemplateItem>>(`/api/v1/templates${query}`)

      spinner.stop()

      if (!data.items || data.items.length === 0) {
        printInfo('No templates found.')
        return
      }

      printTable(
        ['Name', 'Category', 'Visibility', 'Stars', 'Forks'],
        data.items.map((t) => [
          t.name,
          t.category,
          t.visibility,
          String(t.starCount),
          String(t.forkCount),
        ])
      )
      console.log()
      printInfo(formatPagination(data))
    } catch (err) {
      spinner.stop()
      const message = err instanceof Error ? err.message : 'Unknown error'
      printError(`Failed to list templates: ${message}`)
      process.exit(1)
    }
  })

// --- Main list command ---

export const listCommand = new Command('list')
  .description('List resources (prompts, skills, feeds, templates)')
  .addCommand(promptsCommand)
  .addCommand(skillsCommand)
  .addCommand(feedsCommand)
  .addCommand(templatesCommand)
