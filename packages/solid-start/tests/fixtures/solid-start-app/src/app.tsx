import { Router } from '@solidjs/router'
import { FileRoutes } from '@solidjs/start/router'
import { Suspense } from 'solid-js'

export default function App() {
  return (
    <Router root={(properties) => <Suspense>{properties.children}</Suspense>}>
      <FileRoutes />
    </Router>
  )
}
