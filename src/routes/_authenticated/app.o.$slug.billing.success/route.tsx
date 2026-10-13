import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/app/o/$slug/billing/success',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/app/o/$slug/billing/success"!</div>
}
