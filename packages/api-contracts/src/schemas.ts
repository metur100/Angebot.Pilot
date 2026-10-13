import { z } from 'zod';
import { tr } from './locale';

/** Validation message in the current UI language, resolved when the value is validated. */
const msg = (de: string, en: string) => ({ error: () => tr(de, en) });

// Client-side validation. Mirrors the server's FluentValidation rules; the server remains authoritative.

const optionalText = (max: number) => z.string().trim().max(max, { error: () => tr(`Maximal ${max} Zeichen.`, `At most ${max} characters.`) }).optional().or(z.literal(''));

export const passwordSchema = z
  .string()
  .min(10, msg('Mindestens 10 Zeichen.', 'At least 10 characters.'))
  .max(128, msg('Maximal 128 Zeichen.', 'At most 128 characters.'))
  .regex(/[A-Za-zÄÖÜäöüß]/, msg('Mindestens ein Buchstabe.', 'At least one letter.'))
  .regex(/\d/, msg('Mindestens eine Ziffer.', 'At least one digit.'));

export const emailSchema = z.string().trim().min(1, msg('Bitte E-Mail-Adresse angeben.', 'Please enter an email address.')).email(msg('Bitte gültige E-Mail-Adresse angeben.', 'Please enter a valid email address.')).max(254);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, msg('Bitte Passwort eingeben.', 'Please enter your password.')),
});

export const registerSchema = z.object({
  displayName: z.string().trim().min(2, msg('Bitte Ihren Namen angeben.', 'Please enter your name.')).max(100),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, msg('Bitte stimmen Sie den Nutzungsbedingungen zu.', 'Please accept the terms of use.')),
});

export const companySchema = z.object({
  name: z.string().trim().min(2, msg('Bitte Firmennamen angeben.', 'Please enter a company name.')).max(200),
  addressLine1: optionalText(200),
  postalCode: z.string().trim().regex(/^\d{4,5}$/, msg('Bitte gültige Postleitzahl angeben.', 'Please enter a valid postcode.')).optional().or(z.literal('')),
  city: optionalText(100),
  email: emailSchema.optional().or(z.literal('')),
  phone: optionalText(50),
  vatId: z.string().trim().regex(/^[A-Z]{2}[A-Z0-9]{2,13}$/, msg('Format z. B. DE123456789.', 'Format e.g. DE123456789.')).optional().or(z.literal('')),
  defaultTaxMode: z.enum(['Standard', 'SmallBusiness', 'ReverseCharge']),
  quotationPrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, msg('1–8 Großbuchstaben oder Ziffern.', '1–8 capital letters or digits.')).optional().or(z.literal('')),
});

export const customerSchema = z
  .object({
    type: z.enum(['Business', 'Private']),
    companyName: optionalText(200),
    salutation: optionalText(30),
    firstName: optionalText(100),
    lastName: optionalText(100),
    email: emailSchema.optional().or(z.literal('')),
    phone: optionalText(50),
    billingStreet: optionalText(200),
    billingPostalCode: optionalText(10),
    billingCity: optionalText(100),
    billingCountry: z.string().trim().length(2).default('DE'),
    hasServiceAddress: z.boolean().default(false),
    serviceStreet: optionalText(200),
    servicePostalCode: optionalText(10),
    serviceCity: optionalText(100),
    serviceCountry: optionalText(2),
    vatId: optionalText(20),
    notes: optionalText(4000),
    followUpOptOut: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'Business' && !value.companyName) {
      ctx.addIssue({ code: 'custom', path: ['companyName'], message: tr('Bitte Firmennamen angeben.', 'Please enter a company name.') });
    }
    if (value.type === 'Private' && !value.lastName) {
      ctx.addIssue({ code: 'custom', path: ['lastName'], message: tr('Bitte Nachnamen angeben.', 'Please enter a last name.') });
    }
  });

export const lineItemSchema = z.object({
  title: z.string().trim().min(1, msg('Bitte Bezeichnung angeben.', 'Please enter a description.')).max(200),
  description: optionalText(2000),
  quantity: z.number(msg('Bitte Menge angeben.', 'Please enter a quantity.')).gt(0, msg('Die Menge muss größer als 0 sein.', 'The quantity must be greater than 0.')).max(1_000_000),
  unit: z.string().trim().min(1, msg('Einheit fehlt.', 'Unit is missing.')).max(20),
  unitPriceNet: z.number(msg('Bitte Preis angeben.', 'Please enter a price.')).min(0, msg('Der Preis darf nicht negativ sein.', 'The price must not be negative.')).max(10_000_000),
  discountPercent: z.number().min(0, msg('Mindestens 0 %.', 'At least 0%.')).max(100, msg('Höchstens 100 %.', 'At most 100%.')),
  taxRatePercent: z.number().min(0).max(100),
});

export const quotationSchema = z
  .object({
    // z.guid(): the API issues SQL Server sequential GUIDs, which are not RFC 4122 variants (z.uuid() would reject them).
    customerId: z.guid(msg('Bitte Kunden auswählen.', 'Please select a customer.')),
    title: z.string().trim().min(1, msg('Bitte Betreff angeben.', 'Please enter a subject.')).max(200),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg('Ungültiges Datum.', 'Invalid date.')),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg('Ungültiges Datum.', 'Invalid date.')),
    taxMode: z.enum(['Standard', 'SmallBusiness', 'ReverseCharge']),
    introText: optionalText(4000),
    closingText: optionalText(4000),
    terms: optionalText(4000),
    paymentTerms: optionalText(1000),
    internalNotes: optionalText(4000),
    lineItems: z.array(lineItemSchema).min(1, msg('Mindestens eine Position.', 'At least one line item.')).max(200),
  })
  .refine((v) => v.validUntil >= v.issueDate, { path: ['validUntil'], error: () => tr('Gültig bis muss nach dem Angebotsdatum liegen.', 'Valid until must be after the quotation date.') });

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;
export type CompanyForm = z.infer<typeof companySchema>;
export type CustomerForm = z.infer<typeof customerSchema>;
export type LineItemForm = z.infer<typeof lineItemSchema>;
export type QuotationForm = z.infer<typeof quotationSchema>;
