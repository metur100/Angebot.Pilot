import { z } from 'zod';

// Client-side validation. Mirrors the server's FluentValidation rules; the server remains authoritative.

const optionalText = (max: number) => z.string().trim().max(max, `Maximal ${max} Zeichen.`).optional().or(z.literal(''));

export const passwordSchema = z
  .string()
  .min(10, 'Mindestens 10 Zeichen.')
  .max(128, 'Maximal 128 Zeichen.')
  .regex(/[A-Za-zÄÖÜäöüß]/, 'Mindestens ein Buchstabe.')
  .regex(/\d/, 'Mindestens eine Ziffer.');

export const emailSchema = z.string().trim().min(1, 'Bitte E-Mail-Adresse angeben.').email('Bitte gültige E-Mail-Adresse angeben.').max(254);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Bitte Passwort eingeben.'),
});

export const registerSchema = z.object({
  displayName: z.string().trim().min(2, 'Bitte Ihren Namen angeben.').max(100),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { message: 'Bitte stimmen Sie den Nutzungsbedingungen zu.' }),
});

export const companySchema = z.object({
  name: z.string().trim().min(2, 'Bitte Firmennamen angeben.').max(200),
  addressLine1: optionalText(200),
  postalCode: z.string().trim().regex(/^\d{4,5}$/, 'Bitte gültige Postleitzahl angeben.').optional().or(z.literal('')),
  city: optionalText(100),
  email: emailSchema.optional().or(z.literal('')),
  phone: optionalText(50),
  vatId: z.string().trim().regex(/^[A-Z]{2}[A-Z0-9]{2,13}$/, 'Format z. B. DE123456789.').optional().or(z.literal('')),
  defaultTaxMode: z.enum(['Standard', 'SmallBusiness', 'ReverseCharge']),
  quotationPrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, '1–8 Großbuchstaben oder Ziffern.').optional().or(z.literal('')),
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
      ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Bitte Firmennamen angeben.' });
    }
    if (value.type === 'Private' && !value.lastName) {
      ctx.addIssue({ code: 'custom', path: ['lastName'], message: 'Bitte Nachnamen angeben.' });
    }
  });

export const lineItemSchema = z.object({
  title: z.string().trim().min(1, 'Bitte Bezeichnung angeben.').max(200),
  description: optionalText(2000),
  quantity: z.number({ message: 'Bitte Menge angeben.' }).gt(0, 'Die Menge muss größer als 0 sein.').max(1_000_000),
  unit: z.string().trim().min(1, 'Einheit fehlt.').max(20),
  unitPriceNet: z.number({ message: 'Bitte Preis angeben.' }).min(0, 'Der Preis darf nicht negativ sein.').max(10_000_000),
  discountPercent: z.number().min(0, 'Mindestens 0 %.').max(100, 'Höchstens 100 %.'),
  taxRatePercent: z.number().min(0).max(100),
});

export const quotationSchema = z
  .object({
    customerId: z.string().uuid('Bitte Kunden auswählen.'),
    title: z.string().trim().min(1, 'Bitte Betreff angeben.').max(200),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum.'),
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datum.'),
    taxMode: z.enum(['Standard', 'SmallBusiness', 'ReverseCharge']),
    introText: optionalText(4000),
    closingText: optionalText(4000),
    terms: optionalText(4000),
    paymentTerms: optionalText(1000),
    internalNotes: optionalText(4000),
    lineItems: z.array(lineItemSchema).min(1, 'Mindestens eine Position.').max(200),
  })
  .refine((v) => v.validUntil >= v.issueDate, { path: ['validUntil'], message: 'Gültig bis muss nach dem Angebotsdatum liegen.' });

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;
export type CompanyForm = z.infer<typeof companySchema>;
export type CustomerForm = z.infer<typeof customerSchema>;
export type LineItemForm = z.infer<typeof lineItemSchema>;
export type QuotationForm = z.infer<typeof quotationSchema>;
