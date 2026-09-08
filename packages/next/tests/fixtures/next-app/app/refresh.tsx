'use client'

import { useState } from 'react'
import { api } from '../browser-client'

export function Refresh() {
  const [health, setHealth] = useState('not refreshed')
  return <button onClick={async () => setHealth((await api.health()).body)}>{health}</button>
}
