/**
 * Simple line-based diff utility for prompt content.
 * Produces a unified-diff-like format for display.
 */

export function computeDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  const result: string[] = []
  const maxLen = Math.max(oldLines.length, newLines.length)

  // Simple line-by-line diff
  let i = 0
  let j = 0

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length) {
      if (oldLines[i] === newLines[j]) {
        result.push(`  ${oldLines[i]}`)
        i++
        j++
      } else {
        // Find next matching line
        let foundInNew = -1
        let foundInOld = -1

        // Look ahead in new lines for current old line
        for (let k = j + 1; k < Math.min(j + 5, newLines.length); k++) {
          if (newLines[k] === oldLines[i]) {
            foundInNew = k
            break
          }
        }

        // Look ahead in old lines for current new line
        for (let k = i + 1; k < Math.min(i + 5, oldLines.length); k++) {
          if (oldLines[k] === newLines[j]) {
            foundInOld = k
            break
          }
        }

        if (foundInNew >= 0 && (foundInOld < 0 || foundInNew - j <= foundInOld - i)) {
          // Lines were added
          while (j < foundInNew) {
            result.push(`+ ${newLines[j]}`)
            j++
          }
        } else if (foundInOld >= 0) {
          // Lines were removed
          while (i < foundInOld) {
            result.push(`- ${oldLines[i]}`)
            i++
          }
        } else {
          // Line was changed
          result.push(`- ${oldLines[i]}`)
          result.push(`+ ${newLines[j]}`)
          i++
          j++
        }
      }
    } else if (i < oldLines.length) {
      result.push(`- ${oldLines[i]}`)
      i++
    } else {
      result.push(`+ ${newLines[j]}`)
      j++
    }
  }

  if (maxLen === 0) {
    return '(no changes)'
  }

  return result.join('\n')
}
