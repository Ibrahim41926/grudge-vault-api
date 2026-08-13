import { config } from './config.js'

interface RewriteReminderMessageInput {
  grudgeDescription: string
  grudgeTitle: string
  incidentDate: string
  originalMessage: string
  reminderMessageHint: string | null
  reminderTitle: string
  traitorName: string
  userId: string
}

interface OpenAIResponsePayload {
  error?: {
    message?: string
  }
  output?: Array<{
    content?: Array<{
      text?: string
      type?: string
    }>
  }>
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

export async function rewriteReminderMessageWithOpenAI(
  input: RewriteReminderMessageInput
): Promise<string> {
  if (!config.openAiApiKey) {
    return input.originalMessage
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openAiReminderModel,
      store: false,
      temperature: 0.8,
      max_output_tokens: 140,
      safety_identifier: input.userId,
      instructions: [
        'Tu réecris des rappels privés en francais.',
        'Le ton doit rester leger, ironique et non agressif.',
        'Interdictions absolues: menace, appel à la vengeance, humiliation, violence, harcelement.',
        'Conserve les informations utiles, mais garde le texte court et naturel.',
        'Retourne uniquement un JSON valide qui respecte le schema demande.',
      ].join(' '),
      text: {
        format: {
          type: 'json_schema',
          name: 'reminder_rewrite',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Le rappel final, en deux phrases maximum.',
              },
            },
            required: ['message'],
            additionalProperties: false,
          },
        },
      },
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildRewritePrompt(input),
            },
          ],
        },
      ],
    }),
  })

  const payload = (await response.json().catch(() => null)) as OpenAIResponsePayload | null

  if (!response.ok) {
    throw new Error(readOpenAIError(payload) ?? `OpenAI request failed with status ${response.status}.`)
  }

  const rawText = extractOutputText(payload)
  const rewrittenMessage = parseRewrittenMessage(rawText)

  if (!rewrittenMessage) {
    throw new Error('OpenAI returned an empty reminder rewrite.')
  }

  return rewrittenMessage
}

function buildRewritePrompt(input: RewriteReminderMessageInput): string {
  return [
    `Titre du rappel: ${input.reminderTitle}`,
    `Sujet: ${input.grudgeTitle}`,
    `Personne concernee: ${input.traitorName}`,
    `Date de l incident: ${input.incidentDate}`,
    `Description precise de ce qui s est passe: ${input.grudgeDescription}`,
    `Base du rappel a conserver: ${input.originalMessage}`,
    `Message optionnel saisi pour le rappel: ${input.reminderMessageHint || 'aucun'}`,
    '',
    'Reecris ce rappel pour un email et une notification interne.',
    'Contraintes:',
    '- francais naturel',
    '- une ou deux phrases maximum',
    '- ton leger et piquant, jamais agressif',
    '- pas de menace, pas d appel a la vengeance, pas d insulte',
    '- rappelle concretement ce que la personne a fait, en t appuyant d abord sur la description precise',
    '- garde le sens principal du message',
  ].join('\n')
}

function extractOutputText(payload: OpenAIResponsePayload | null): string {
  if (!payload?.output) {
    return ''
  }

  for (const item of payload.output) {
    if (!Array.isArray(item.content)) {
      continue
    }

    for (const contentItem of item.content) {
      if (contentItem.type === 'output_text' && typeof contentItem.text === 'string') {
        return contentItem.text
      }
    }
  }

  return ''
}

function parseRewrittenMessage(rawText: string): string {
  if (!rawText) {
    return ''
  }

  try {
    const parsed = JSON.parse(rawText) as { message?: unknown }
    if (typeof parsed.message === 'string') {
      return normalizeMessage(parsed.message)
    }
  } catch {}

  return normalizeMessage(rawText)
}

function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

function readOpenAIError(payload: OpenAIResponsePayload | null): string | null {
  return typeof payload?.error?.message === 'string' ? payload.error.message : null
}
