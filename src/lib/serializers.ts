import type { Grudge, Notification, Person, Reminder, Tag, Upload } from '@prisma/client'
import { buildSignedFileUrl } from './signed-url.js'

export function serializePerson(person: Person) {
  return {
    id: person.id,
    user_id: person.userId,
    first_name: person.firstName,
    last_name: person.lastName,
    nickname: person.nickname,
    phone: person.phone,
    email: person.email,
    social_handle: person.socialHandle,
    created_at: person.createdAt,
    updated_at: person.updatedAt,
  }
}

export function serializeTag(tag: Tag) {
  return {
    id: tag.id,
    user_id: tag.userId,
    name: tag.name,
    color: tag.color,
    created_at: tag.createdAt,
  }
}

export function serializeUpload(upload: Upload) {
  return {
    id: upload.id,
    user_id: upload.userId,
    grudge_id: upload.grudgeId,
    file_name: upload.fileName,
    file_type: upload.fileType,
    file_size: upload.fileSize,
    mime_type: upload.mimeType,
    created_at: upload.createdAt,
    signed_url: buildSignedFileUrl(upload.storagePath),
  }
}

export function serializeReminder(reminder: Reminder & { grudge?: Pick<Grudge, 'firstName' | 'id' | 'lastName' | 'title'> | null }) {
  return {
    id: reminder.id,
    user_id: reminder.userId,
    grudge_id: reminder.grudgeId,
    title: reminder.title,
    message: reminder.message,
    frequency: reminder.frequency,
    custom_interval_days: reminder.customIntervalDays,
    next_trigger_at: reminder.nextTriggerAt,
    last_triggered_at: reminder.lastTriggeredAt,
    is_active: reminder.isActive,
    created_at: reminder.createdAt,
    updated_at: reminder.updatedAt,
    ...(reminder.grudge
      ? {
          grudge: {
            id: reminder.grudge.id,
            first_name: reminder.grudge.firstName,
            last_name: reminder.grudge.lastName,
            title: reminder.grudge.title,
          },
        }
      : {}),
  }
}

export function serializeNotification(notification: Notification) {
  return {
    id: notification.id,
    user_id: notification.userId,
    grudge_id: notification.grudgeId,
    reminder_id: notification.reminderId,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    is_read: notification.isRead,
    created_at: notification.createdAt,
  }
}

interface SerializeGrudgeExtras {
  reminders?: Reminder[]
  tags?: Tag[]
  uploads?: Upload[]
}

export function serializeGrudge(grudge: Grudge, extras: SerializeGrudgeExtras = {}) {
  return {
    id: grudge.id,
    user_id: grudge.userId,
    person_id: grudge.personId,
    first_name: grudge.firstName,
    last_name: grudge.lastName,
    nickname: grudge.nickname,
    phone: grudge.phone,
    email: grudge.email,
    social_handle: grudge.socialHandle,
    title: grudge.title,
    description: grudge.description,
    category: grudge.category,
    severity: grudge.severity,
    incident_date: grudge.incidentDate,
    is_archived: grudge.isArchived,
    is_favorite: grudge.isFavorite,
    created_at: grudge.createdAt,
    updated_at: grudge.updatedAt,
    ...(extras.tags ? { tags: extras.tags.map(serializeTag) } : {}),
    ...(extras.uploads ? { uploads: extras.uploads.map(serializeUpload) } : {}),
    ...(extras.reminders ? { reminders: extras.reminders.map((r) => serializeReminder(r)) } : {}),
  }
}
