import type { GrudgeCategory, NotificationType, ReminderFrequency } from '@prisma/client'

export const GRUDGE_CATEGORIES: GrudgeCategory[] = [
  'betrayal',
  'lies',
  'theft',
  'manipulation',
  'abandonment',
  'humiliation',
  'broken_promise',
  'gossip',
  'sabotage',
  'other',
]

export const REMINDER_FREQUENCIES: ReminderFrequency[] = ['once', 'daily', 'weekly', 'monthly', 'yearly', 'custom']

export const NOTIFICATION_TYPES: NotificationType[] = ['reminder', 'system', 'info']

export function isValidCategory(value: unknown): value is GrudgeCategory {
  return typeof value === 'string' && (GRUDGE_CATEGORIES as string[]).includes(value)
}

export function isValidFrequency(value: unknown): value is ReminderFrequency {
  return typeof value === 'string' && (REMINDER_FREQUENCIES as string[]).includes(value)
}

export function isValidSeverity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10
}

export function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function toNullableString(value: unknown): string | null {
  const trimmed = toTrimmedString(value)
  return trimmed || null
}

export function toValidDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}
