import { createFileRoute } from '@tanstack/react-router'
import { SuccessStateView } from './-components/success-state-view'

export const Route = createFileRoute(
  '/_authenticated/app/o/$slug/billing/success',
)({
  component: SuccessStateView,
})
