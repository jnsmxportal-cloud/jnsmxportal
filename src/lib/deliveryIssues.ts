/**
 * What can be wrong with a delivery. Staff pick one or more in Delivery Received; the keys are
 * stored in `deliveries.issue_types`, and `discrepancy_units` is the (optional) units affected.
 */
export const DELIVERY_ISSUES = [
  { key: 'short', label: 'Short / missing' },
  { key: 'damaged', label: 'Damaged' },
  { key: 'wrong_item', label: 'Wrong item' },
  { key: 'expired', label: 'Expired / short-dated' },
  { key: 'over', label: 'Over-delivered' },
  { key: 'other', label: 'Other' },
] as const

export type DeliveryIssue = (typeof DELIVERY_ISSUES)[number]['key']

export function issueLabel(key: string): string {
  return DELIVERY_ISSUES.find((i) => i.key === key)?.label ?? key
}

/** Issue types of a delivery; deliveries logged before issue types only had "units short". */
export function deliveryIssues(d: { issue_types?: string[] | null; discrepancy_units: number }): string[] {
  if (d.issue_types?.length) return d.issue_types
  return d.discrepancy_units > 0 ? ['short'] : []
}

/** One line for lists and notifications, e.g. "Damaged, Short / missing · 6 units"; null = no issue. */
export function deliveryIssueText(d: { issue_types?: string[] | null; discrepancy_units: number }): string | null {
  const issues = deliveryIssues(d)
  if (!issues.length) return null
  const units = d.discrepancy_units > 0 ? ` · ${d.discrepancy_units} unit${d.discrepancy_units === 1 ? '' : 's'}` : ''
  return issues.map(issueLabel).join(', ') + units
}
