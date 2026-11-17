import { SUBJECT_SETS, subjectOptionLabel } from './homework'
import type { Account, Item } from './store'

export const EC_CLASSES = SUBJECT_SETS.find(group => group.label === 'EC')!.options
export const EE_CLASSES = SUBJECT_SETS.find(group => group.label === 'EE')!.options
export const MATH_CLASSES = SUBJECT_SETS.find(group => group.label === 'Math')!.options
export const classLabel = subjectOptionLabel

export function validClasses(ec: string, ee: string, math: string) {
  return EC_CLASSES.includes(ec) && EE_CLASSES.includes(ee) && MATH_CLASSES.includes(math)
}

/** Unmapped/custom subjects remain classwide; mapped streams belong to one class. */
export function canSeeHomework(subject: string, user: Account) {
  if (user.role === 'admin') return true
  if (EC_CLASSES.includes(subject)) return subject === user.ec_class
  if (EE_CLASSES.includes(subject)) return subject === user.ee_class
  if (MATH_CLASSES.includes(subject)) return subject === user.math_class
  return true
}

export function visibleHomework(items: Item[], user: Account) {
  return items.filter(item => canSeeHomework(item.subject, user))
}
