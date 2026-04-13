#!/usr/bin/env node
import { Command } from 'commander'
import { loginCommand } from './commands/login'
import { pullCommand } from './commands/pull'
import { listCommand } from './commands/list'
import { statusCommand } from './commands/status'
import { feedbackCommand } from './commands/feedback'

const program = new Command()
program
  .name('aipm')
  .description('AIPM CLI — AI-Native Project Management')
  .version('1.0.0')

program.addCommand(loginCommand)
program.addCommand(pullCommand)
program.addCommand(listCommand)
program.addCommand(statusCommand)
program.addCommand(feedbackCommand)

program.parse()
