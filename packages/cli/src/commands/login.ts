import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { apiPost } from '../api'
import { setToken, setServerUrl, getServerUrl } from '../config'
import { printSuccess, printError } from '../format'

interface AuthResponse {
  token: string
  user: {
    id: string
    name: string
    email: string
    role: string
    avatar: string | null
    legacyRoles: string[]
  }
}

export const loginCommand = new Command('login')
  .description('Authenticate with the AIPM platform')
  .option('--server <url>', 'Server URL (e.g. http://localhost:3000)')
  .option('--email <email>', 'Login email')
  .option('--password <password>', 'Login password')
  .action(async (options: { server?: string; email?: string; password?: string }) => {
    const { server, email, password } = options

    // Set server URL if provided
    if (server) {
      setServerUrl(server)
      console.log(chalk.cyan(`Server URL set to: ${server}`))
    }

    // Validate required fields
    if (!email || !password) {
      console.log(chalk.yellow('Usage: aipm login --email <email> --password <password> [--server <url>]'))
      console.log()
      console.log(`  Current server: ${chalk.cyan(getServerUrl())}`)
      console.log()
      console.log('  Options:')
      console.log('    --server <url>      Set the AIPM server URL')
      console.log('    --email <email>     Your login email')
      console.log('    --password <pass>   Your login password')
      return
    }

    const spinner = ora('Logging in...').start()

    try {
      const data = await apiPost<AuthResponse>('/api/v1/auth/login', {
        email,
        password,
      })

      setToken(data.token)

      spinner.stop()
      printSuccess(`Logged in as ${chalk.bold(data.user.name)} (${data.user.email})`)
      console.log(`  Role: ${chalk.cyan(data.user.role)}`)
      console.log(`  Server: ${chalk.cyan(getServerUrl())}`)
    } catch (err) {
      spinner.stop()
      const message = err instanceof Error ? err.message : 'Unknown error'
      printError(`Login failed: ${message}`)
      process.exit(1)
    }
  })
