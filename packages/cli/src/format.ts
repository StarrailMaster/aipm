import chalk from 'chalk'

/**
 * Print a formatted table with aligned columns.
 * @param headers - Column header names
 * @param rows - Array of row data (each row is string[])
 * @param options - Optional column widths override
 */
export function printTable(
  headers: string[],
  rows: string[][],
  options?: { widths?: number[] }
): void {
  // Calculate column widths
  const widths = options?.widths ?? headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0)
    return Math.max(h.length, maxRow) + 2
  })

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('')
  console.log(chalk.cyan.bold(headerLine))
  console.log(chalk.gray('-'.repeat(headerLine.length)))

  // Print rows
  for (const row of rows) {
    const line = row.map((cell, i) => (cell || '').padEnd(widths[i])).join('')
    console.log(line)
  }
}

/**
 * Format a timestamp to a readable date string.
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

/**
 * Print a success message.
 */
export function printSuccess(message: string): void {
  console.log(chalk.green(`\u2713 ${message}`))
}

/**
 * Print an error message.
 */
export function printError(message: string): void {
  console.log(chalk.red(`\u2717 ${message}`))
}

/**
 * Print an info message.
 */
export function printInfo(message: string): void {
  console.log(chalk.cyan(`\u2139 ${message}`))
}

/**
 * Print a warning message.
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow(`\u26A0 ${message}`))
}
