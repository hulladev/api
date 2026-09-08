import { createAsync } from '@solidjs/router'
import { getHealth } from '../api/health'

export default function Home() {
  const health = createAsync(() => getHealth())
  return <main>@hulla/api SolidStart fixture: {health()}</main>
}
