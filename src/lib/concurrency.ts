const state = globalThis as typeof globalThis & { __papergridJobs?: Map<string, number> }
const jobs = state.__papergridJobs ??= new Map<string, number>()

// Bounded admission rather than retaining an unbounded queue of upload bodies.
export function tryAcquireJob(name: string, max = 1): (() => void) | null {
  const active = jobs.get(name) || 0
  if (active >= max) return null
  jobs.set(name, active + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    jobs.set(name, Math.max(0, (jobs.get(name) || 1) - 1))
  }
}
