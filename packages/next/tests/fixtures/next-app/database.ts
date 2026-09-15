import 'server-only'

// Fixture data stands in for a server-only database dependency.
export function health() {
  if (process.env['HULLA_FIXTURE_DATABASE_FAIL']) throw new Error('HULLA_NEXT_PRIVATE_DATABASE')
  return 'ok'
}

export async function userForSession(session: string | undefined) {
  await new Promise((resolve) => setTimeout(resolve, session === 'ada' ? 15 : 1))
  return session === 'ada' ? 'Ada' : session === 'grace' ? 'Grace' : 'anonymous'
}
