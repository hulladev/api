import picomatch from 'picomatch'

export function matchesGlob(path: string, pattern: string): boolean {
  return picomatch.isMatch(path, pattern)
}
