import { z } from 'zod';
import {
  BENEFIT_CATEGORIES,
  BENEFIT_STATUSES,
  REFUND_STATUSES,
  REMINDER_KINDS,
  HOUSEHOLD_ROLES,
  PERMISSIONS,
  PLANS,
} from './db/schema';
import { isIsoDate } from './dates';
import { SUPPORTED_CURRENCIES } from './money';

/** Every trust boundary (server action, route handler) parses with one of these. */

export const optionalDate = z
  .string()
  .trim()
  .max(10)
  .refine((v) => v === '' || isIsoDate(v), 'Use a valid date.')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const amountString = z
  .string()
  .trim()
  .refine((v) => v === '' || /^-?\d{1,12}([.,]\d{1,2})?$/.test(v.replace(/[\s,]/g, (m) => (m === ',' ? ',' : ''))),
    'Enter an amount like 2500 or 2500.00.');

export const currencyField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => SUPPORTED_CURRENCIES.includes(v), 'Choose a supported currency.');

export const emailField = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')).refine((v) => v.length <= 254, 'That email is too long.');

export const passwordField = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'That password is too long.')
  .refine((v) => !/^\s+$/.test(v), 'Enter a password.');

export const signUpSchema = z.object({
  name: z.string().trim().max(80).default(''),
  email: emailField,
  password: passwordField,
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Enter your email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'The two new passwords do not match.',
    path: ['confirmPassword'],
  });

export const benefitSchema = z.object({
  title: z.string().trim().min(1, 'Give this record a name.').max(120),
  category: z.enum(BENEFIT_CATEGORIES),
  merchant: z.string().trim().max(80).default(''),
  currency: currencyField,
  originalValue: amountString.default(''),
  currentValue: amountString.default(''),
  unitLabel: z.string().trim().max(30).default(''),
  units: z.string().trim().regex(/^\d{0,6}$/, 'Units must be a whole number.').default(''),
  issuedAt: optionalDate,
  receivedAt: optionalDate,
  expiresAt: optionalDate,
  conditions: z.string().trim().max(2000).default(''),
  notes: z.string().trim().max(2000).default(''),
  tags: z.string().trim().max(200).default(''),
  code: z.string().trim().max(60).default(''),
  recurrence: z.enum(['none', 'monthly', 'quarterly', 'yearly']).default('none'),
  recurrenceUnits: z.string().trim().regex(/^\d{0,4}$/, 'Use a whole number.').default(''),
  recurrenceAnchor: optionalDate,
});

export const balanceEventSchema = z.object({
  type: z.enum(['usage', 'correction', 'verified_update', 'redeemed', 'revalidation']),
  amount: amountString.default(''),
  units: z.string().trim().regex(/^\d{0,6}$/, 'Units must be a whole number.').default(''),
  reason: z.string().trim().max(500).default(''),
  occurredAt: z.string().trim().refine(isIsoDate, 'Use a valid date.'),
  newExpiresAt: optionalDate,
});

export const benefitStatusSchema = z.object({ status: z.enum(BENEFIT_STATUSES) });

export const refundSchema = z.object({
  merchant: z.string().trim().min(1, 'Who owes you this refund?').max(80),
  orderRef: z.string().trim().max(60).default(''),
  referenceNumber: z.string().trim().max(60).default(''),
  currency: currencyField,
  amount: amountString.refine((v) => v !== '', 'Enter the refund amount.'),
  purchaseDate: optionalDate,
  initiatedAt: optionalDate,
  expectedByDate: optionalDate,
  method: z.string().trim().max(60).default(''),
  notes: z.string().trim().max(2000).default(''),
});

export const refundTransitionSchema = z.object({
  status: z.enum(REFUND_STATUSES),
  receivedAmount: amountString.default(''),
  note: z.string().trim().max(500).default(''),
  occurredAt: z.string().trim().refine(isIsoDate, 'Use a valid date.'),
  closedReason: z.string().trim().max(300).default(''),
});

export const reminderSchema = z.object({
  kind: z.enum(REMINDER_KINDS),
  label: z.string().trim().min(1, 'Describe what this reminder is for.').max(120),
  dueAt: z.string().trim().refine(isIsoDate, 'Use a valid date.'),
  benefitId: z.string().trim().max(40).default(''),
  refundCaseId: z.string().trim().max(40).default(''),
});

export const settingsSchema = z.object({
  name: z.string().trim().max(80).default(''),
  currency: currencyField,
  dateFormat: z.enum(['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']),
  timeZone: z.string().trim().min(1).max(60),
  theme: z.enum(['system', 'light', 'dark']),
  reminderOffsets: z
    .string()
    .trim()
    .regex(/^(\d{1,3})(\s*,\s*\d{1,3})*$/, 'Use day numbers separated by commas, for example 30, 14, 7.'),
  refundCheckInDays: z.coerce.number().int().min(1).max(90),
  notifyInApp: z.coerce.boolean().default(false),
  notifyBrowser: z.coerce.boolean().default(false),
  searchDocumentText: z.coerce.boolean().default(false),
});

export const householdSchema = z.object({ name: z.string().trim().min(1, 'Name this household.').max(80) });
export const inviteSchema = z.object({ role: z.enum(HOUSEHOLD_ROLES).exclude(['owner']) });
export const shareSchema = z.object({
  householdId: z.string().trim().min(1),
  resourceType: z.enum(['benefit', 'refund_case']),
  resourceId: z.string().trim().min(1),
  permission: z.enum(PERMISSIONS),
});
export const planSchema = z.object({ plan: z.enum(PLANS) });

export const claimActionSchema = z.object({
  kind: z.enum(['follow_up_drafted', 'called', 'emailed', 'chat', 'escalated', 'note']),
  summary: z.string().trim().min(1, 'Describe what you did.').max(500),
  assigneeUserId: z.string().trim().max(40).default(''),
  dueAt: optionalDate,
});

/** Flatten a ZodError into { field: message } for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** set by actions that need the page to show something after success */
  payload?: Record<string, unknown>;
};

/** Reads a FormData into a plain object; checkboxes become 'on' | undefined. */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') out[k] = v;
  return out;
}
