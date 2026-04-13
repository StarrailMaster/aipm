import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { apiGet } from '../api'
import { printError } from '../format'

interface SquadStatus {
  squadId: string
  squadName: string
  currentStep: string
  currentTask: string
  blockers: string[]
  monthlyPlan: MonthlyPlanItem[]
}

interface MonthlyPlanItem {
  id: string
  title: string
  status: string
  progress: number
}

interface ProjectOverview {
  projectId: string
  projectName: string
  squads: SquadStatus[]
}

interface OkrSnapshot {
  krId: string
  krName: string
  targetValue: number
  currentValue: number
  unit: string
  status: 'on_track' | 'at_risk' | 'behind'
}

interface CompanyDashboard {
  projects: ProjectOverview[]
  okrSnapshot: OkrSnapshot[]
}

function formatStepBadge(step: string): string {
  const stepLabels: Record<string, string> = {
    SPEC: '1-SPEC',
    DESIGN: '2-DESIGN',
    REFINE: '3-REFINE',
    IMPLEMENT: '4-IMPLEMENT',
    ACCEPT: '5-ACCEPT',
    DONE: 'DONE',
  }
  const label = stepLabels[step] || step
  if (step === 'DONE') return chalk.green(`[${label}]`)
  return chalk.yellow(`[${label}]`)
}

function formatOkrStatus(status: string): string {
  switch (status) {
    case 'on_track':
      return chalk.green('ON TRACK')
    case 'at_risk':
      return chalk.yellow('AT RISK')
    case 'behind':
      return chalk.red('BEHIND')
    default:
      return status
  }
}

function formatProgressBar(progress: number): string {
  const width = 20
  const filled = Math.round((progress / 100) * width)
  const empty = width - filled
  const bar = chalk.green('\u2588'.repeat(filled)) + chalk.gray('\u2591'.repeat(empty))
  return `${bar} ${progress}%`
}

export const statusCommand = new Command('status')
  .description('Show project dashboard status')
  .option('--project <id>', 'Filter by project ID')
  .action(async (options: { project?: string }) => {
    const spinner = ora('Fetching dashboard...').start()

    try {
      let queryPath = '/api/v1/dashboard'
      if (options.project) {
        queryPath += `?projectId=${encodeURIComponent(options.project)}`
      }

      const dashboard = await apiGet<CompanyDashboard>(queryPath)

      spinner.stop()

      // --- Projects ---
      if (!dashboard.projects || dashboard.projects.length === 0) {
        console.log(chalk.gray('No projects found.'))
      } else {
        console.log(chalk.bold.underline('\nProjects'))
        console.log()

        for (const project of dashboard.projects) {
          const squadCount = project.squads.length
          console.log(
            chalk.bold(`  ${project.projectName}`) +
              chalk.gray(` (${squadCount} squad${squadCount !== 1 ? 's' : ''})`)
          )

          for (const squad of project.squads) {
            const step = formatStepBadge(squad.currentStep)
            console.log(`    ${chalk.cyan(squad.squadName)} ${step}`)
            console.log(`      Task: ${squad.currentTask}`)

            // Blockers in red
            if (squad.blockers.length > 0) {
              for (const blocker of squad.blockers) {
                console.log(chalk.red(`      BLOCKER: ${blocker}`))
              }
            }
          }
          console.log()
        }
      }

      // --- OKR Snapshot ---
      if (dashboard.okrSnapshot && dashboard.okrSnapshot.length > 0) {
        console.log(chalk.bold.underline('OKR Snapshot'))
        console.log()

        for (const kr of dashboard.okrSnapshot) {
          const progress = kr.targetValue > 0
            ? Math.round((kr.currentValue / kr.targetValue) * 100)
            : 0
          const statusLabel = formatOkrStatus(kr.status)
          const bar = formatProgressBar(progress)

          console.log(`  ${chalk.bold(kr.krName)}`)
          console.log(
            `    ${kr.currentValue}${kr.unit} / ${kr.targetValue}${kr.unit}  ${bar}  ${statusLabel}`
          )
        }
        console.log()
      }
    } catch (err) {
      spinner.stop()
      const message = err instanceof Error ? err.message : 'Unknown error'
      printError(`Status fetch failed: ${message}`)
      process.exit(1)
    }
  })
