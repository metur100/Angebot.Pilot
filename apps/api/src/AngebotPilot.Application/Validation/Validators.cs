using System.Text.RegularExpressions;
using AngebotPilot.Application.Common;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Quotations;
using FluentValidation;

namespace AngebotPilot.Application.Validation;

internal static partial class Rules
{
    public const int ShortText = 200;
    public const int LongText = 4000;

    [GeneratedRegex(@"^[A-Z0-9]{1,8}$")]
    public static partial Regex Prefix();

    [GeneratedRegex(@"^#[0-9A-Fa-f]{6}$")]
    public static partial Regex HexColor();

    [GeneratedRegex(@"^[A-Z]{2}[A-Z0-9]{2,13}$")]
    public static partial Regex VatId();

    [GeneratedRegex(@"^[A-Z]{2}$")]
    public static partial Regex Country();

    [GeneratedRegex(@"^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$")]
    public static partial Regex Iban();

    [GeneratedRegex(@"^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$")]
    public static partial Regex Bic();

    [GeneratedRegex(@"[A-Za-zÄÖÜäöüß]")]
    public static partial Regex Letter();

    [GeneratedRegex(@"\d")]
    public static partial Regex Digit();

    /// <summary>German/English message, resolved when validating so it follows the request language.</summary>
    public static IRuleBuilderOptions<T, TProperty> WithText<T, TProperty>(this IRuleBuilderOptions<T, TProperty> rule, string de, string en) =>
        rule.WithMessage(_ => Loc.T(de, en));

    public static IRuleBuilderOptions<T, string?> OptionalEmail<T>(this IRuleBuilder<T, string?> rule) =>
        rule.MaximumLength(254).EmailAddress().WithText("Bitte gültige E-Mail-Adresse angeben.", "Please enter a valid email address.").When(_ => true, ApplyConditionTo.CurrentValidator);

    public static IRuleBuilderOptions<T, string> Password<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithText("Bitte Passwort angeben.", "Please enter a password.")
            .MinimumLength(10).WithText("Das Passwort muss mindestens 10 Zeichen lang sein.", "The password must be at least 10 characters long.")
            .MaximumLength(128)
            .Must(p => Letter().IsMatch(p ?? string.Empty) && Digit().IsMatch(p ?? string.Empty))
            .WithText("Das Passwort muss mindestens einen Buchstaben und eine Ziffer enthalten.", "The password must contain at least one letter and one digit.");

    /// <summary>Validates an IBAN including its ISO 13616 mod-97 checksum.</summary>
    public static bool IsValidIban(string? value)
    {
        var iban = Text.Upper(value);
        if (iban is null || !Iban().IsMatch(iban))
        {
            return false;
        }

        var rearranged = iban[4..] + iban[..4];
        var remainder = 0;
        foreach (var ch in rearranged)
        {
            var digits = char.IsDigit(ch) ? (ch - '0').ToString() : (ch - 'A' + 10).ToString();
            foreach (var d in digits)
            {
                remainder = ((remainder * 10) + (d - '0')) % 97;
            }
        }

        return remainder == 1;
    }
}

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(254).WithText("Bitte gültige E-Mail-Adresse angeben.", "Please enter a valid email address.");
        RuleFor(x => x.Password).Password();
        RuleFor(x => x.DisplayName).NotEmpty().WithText("Bitte Ihren Namen angeben.", "Please enter your name.").MaximumLength(100);
        RuleFor(x => x.AcceptTerms).Equal(true).WithText("Bitte stimmen Sie den Nutzungsbedingungen zu.", "Please accept the terms of use.");
        RuleFor(x => x.Language).Must(Loc.IsSupported).When(x => x.Language is not null).WithText("Nicht unterstützte Sprache.", "Unsupported language.");
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().MaximumLength(254);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(256);
    }
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Token).NotEmpty().MaximumLength(128);
        RuleFor(x => x.NewPassword).Password();
    }
}

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword).Password().NotEqual(x => x.CurrentPassword).WithText("Das neue Passwort muss sich vom bisherigen unterscheiden.", "The new password must differ from the current one.");
    }
}

public sealed class UpdateProfileRequestValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileRequestValidator()
    {
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Language).Must(Loc.IsSupported).When(x => x.Language is not null).WithText("Nicht unterstützte Sprache.", "Unsupported language.");
    }
}

public sealed class CreateCompanyRequestValidator : AbstractValidator<CreateCompanyRequest>
{
    public CreateCompanyRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithText("Bitte Firmennamen angeben.", "Please enter the company name.").MaximumLength(Rules.ShortText);
        RuleFor(x => x.AddressLine1).MaximumLength(Rules.ShortText);
        RuleFor(x => x.PostalCode).MaximumLength(10);
        RuleFor(x => x.City).MaximumLength(100);
        RuleFor(x => x.Country).Must(c => c is null || Rules.Country().IsMatch(c.ToUpperInvariant())).WithText("Ländercode im Format DE.", "Country code in the format DE.");
        RuleFor(x => x.Email).OptionalEmail().When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.Phone).MaximumLength(50);
        RuleFor(x => x.VatId).Must(v => Rules.VatId().IsMatch(Text.Upper(v)!)).When(x => !string.IsNullOrWhiteSpace(x.VatId)).WithText("USt-IdNr. im Format DE123456789.", "VAT ID in the format DE123456789.");
        RuleFor(x => x.QuotationPrefix).Must(p => Rules.Prefix().IsMatch(p!.Trim().ToUpperInvariant())).When(x => !string.IsNullOrWhiteSpace(x.QuotationPrefix)).WithText("1–8 Großbuchstaben oder Ziffern.", "1–8 capital letters or digits.");
        RuleFor(x => x.DefaultTaxMode).IsInEnum();
    }
}

public sealed class UpdateCompanyRequestValidator : AbstractValidator<UpdateCompanyRequest>
{
    public UpdateCompanyRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(Rules.ShortText);
        RuleFor(x => x.AddressLine1).MaximumLength(Rules.ShortText);
        RuleFor(x => x.AddressLine2).MaximumLength(Rules.ShortText);
        RuleFor(x => x.PostalCode).MaximumLength(10);
        RuleFor(x => x.City).MaximumLength(100);
        RuleFor(x => x.Country).NotEmpty().Must(c => Rules.Country().IsMatch(c.ToUpperInvariant())).WithText("Ländercode im Format DE.", "Country code in the format DE.");
        RuleFor(x => x.Email).OptionalEmail().When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.Phone).MaximumLength(50);
        RuleFor(x => x.Website).MaximumLength(200).Must(w => Uri.TryCreate(w!.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? w : "https://" + w, UriKind.Absolute, out _))
            .When(x => !string.IsNullOrWhiteSpace(x.Website)).WithText("Bitte gültige Website angeben.", "Please enter a valid website.");
        RuleFor(x => x.VatId).Must(v => Rules.VatId().IsMatch(Text.Upper(v)!)).When(x => !string.IsNullOrWhiteSpace(x.VatId)).WithText("USt-IdNr. im Format DE123456789.", "VAT ID in the format DE123456789.");
        RuleFor(x => x.TaxNumber).MaximumLength(30);
        RuleFor(x => x.BrandColor).Must(c => Rules.HexColor().IsMatch(c)).WithText("Farbe im Format #RRGGBB.", "Colour in the format #RRGGBB.");
        RuleFor(x => x.TimeZone).Must(CompanyTime.IsValid).WithText("Unbekannte Zeitzone.", "Unknown time zone.");
        RuleFor(x => x.Language).Must(l => l is "de-DE" or "en-US").WithText("Nicht unterstützte Sprache.", "Unsupported language.");
    }
}

public sealed class CompanySettingsValidator : AbstractValidator<CompanySettingsDto>
{
    public CompanySettingsValidator()
    {
        RuleFor(x => x.QuotationPrefix).Must(p => Rules.Prefix().IsMatch(p ?? string.Empty)).WithText("1–8 Großbuchstaben oder Ziffern.", "1–8 capital letters or digits.");
        RuleFor(x => x.JobPrefix).Must(p => Rules.Prefix().IsMatch(p ?? string.Empty)).WithText("1–8 Großbuchstaben oder Ziffern.", "1–8 capital letters or digits.");
        RuleFor(x => x.DefaultValidityDays).InclusiveBetween(1, 365);
        RuleFor(x => x.DefaultTaxMode).IsInEnum();
        RuleFor(x => x.DefaultIntroText).MaximumLength(Rules.LongText);
        RuleFor(x => x.DefaultClosingText).MaximumLength(Rules.LongText);
        RuleFor(x => x.DefaultTerms).MaximumLength(Rules.LongText);
        RuleFor(x => x.PaymentTerms).MaximumLength(1000);
        RuleFor(x => x.EmailSignature).MaximumLength(1000);
        RuleFor(x => x.ReplyToEmail).OptionalEmail().When(x => !string.IsNullOrWhiteSpace(x.ReplyToEmail));
        RuleFor(x => x.BankAccountHolder).MaximumLength(100);
        RuleFor(x => x.BankName).MaximumLength(100);
        RuleFor(x => x.Iban).Must(Rules.IsValidIban).When(x => !string.IsNullOrWhiteSpace(x.Iban)).WithText("Bitte gültige IBAN angeben.", "Please enter a valid IBAN.");
        RuleFor(x => x.Bic).Must(b => Rules.Bic().IsMatch(Text.Upper(b)!)).When(x => !string.IsNullOrWhiteSpace(x.Bic)).WithText("Bitte gültige BIC angeben.", "Please enter a valid BIC.");
        RuleFor(x => x.Iban).NotEmpty().When(x => x.ShowBankDetails).WithText("Für die Anzeige der Bankverbindung ist eine IBAN erforderlich.", "An IBAN is required to show the bank details.");
        RuleFor(x => x.FirstReminderAfterDays).InclusiveBetween(2, 60);
        RuleFor(x => x.SecondReminderAfterDays).InclusiveBetween(4, 90).GreaterThan(x => x.FirstReminderAfterDays + 1)
            .When(x => x.SecondReminderEnabled).WithText("Die zweite Erinnerung muss mindestens 2 Tage nach der ersten liegen.", "The second reminder must be at least 2 days after the first.");
        RuleFor(x => x.ExpiryReminderDaysBefore).InclusiveBetween(1, 30);
        RuleFor(x => x.InvoicePrefix).Must(p => Rules.Prefix().IsMatch(p ?? string.Empty)).When(x => x.InvoicePrefix is not null).WithText("1–8 Großbuchstaben oder Ziffern.", "1–8 capital letters or digits.");
        RuleFor(x => x.InvoicePaymentDays).InclusiveBetween(0, 120).When(x => x.InvoicePaymentDays is not null);
        RuleFor(x => x.InvoiceIntroText).MaximumLength(Rules.LongText);
        RuleFor(x => x.InvoiceClosingText).MaximumLength(Rules.LongText);
        RuleFor(x => x.InvoiceReminderAfterDays).InclusiveBetween(1, 60).When(x => x.InvoiceReminderAfterDays is not null);
    }
}

public sealed class UpsertTaxRateRequestValidator : AbstractValidator<UpsertTaxRateRequest>
{
    public UpsertTaxRateRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.RatePercent).InclusiveBetween(0, 100).PrecisionScale(5, 2, true);
        RuleFor(x => x.IsDefault).Equal(false).When(x => x.IsArchived).WithText("Ein archivierter Steuersatz kann nicht Standard sein.", "An archived tax rate cannot be the default.");
    }
}

public sealed class CreateInvitationRequestValidator : AbstractValidator<CreateInvitationRequest>
{
    public CreateInvitationRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(254);
        RuleFor(x => x.Role).IsInEnum().NotEqual(MembershipRole.Owner).WithText("Inhaber:innen können nicht eingeladen werden.", "Owners cannot be invited.");
    }
}

public sealed class UpsertCustomerRequestValidator : AbstractValidator<UpsertCustomerRequest>
{
    public UpsertCustomerRequestValidator()
    {
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.CompanyName).NotEmpty().When(x => x.Type == CustomerType.Business).WithText("Bitte Firmennamen angeben.", "Please enter the company name.").MaximumLength(Rules.ShortText);
        RuleFor(x => x.LastName).NotEmpty().When(x => x.Type == CustomerType.Private).WithText("Bitte Nachnamen angeben.", "Please enter the last name.").MaximumLength(100);
        RuleFor(x => x.FirstName).MaximumLength(100);
        RuleFor(x => x.Salutation).MaximumLength(30);
        RuleFor(x => x.Email).OptionalEmail().When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.Phone).MaximumLength(50);
        RuleFor(x => x.BillingStreet).MaximumLength(Rules.ShortText);
        RuleFor(x => x.BillingPostalCode).MaximumLength(10);
        RuleFor(x => x.BillingCity).MaximumLength(100);
        RuleFor(x => x.BillingCountry).Must(c => Rules.Country().IsMatch(c!.ToUpperInvariant())).When(x => !string.IsNullOrWhiteSpace(x.BillingCountry)).WithText("Ländercode im Format DE.", "Country code in the format DE.");
        RuleFor(x => x.ServiceStreet).NotEmpty().When(x => x.HasServiceAddress).WithText("Bitte Straße der Leistungsadresse angeben.", "Please enter the street of the service address.").MaximumLength(Rules.ShortText);
        RuleFor(x => x.ServiceCity).NotEmpty().When(x => x.HasServiceAddress).WithText("Bitte Ort der Leistungsadresse angeben.", "Please enter the city of the service address.").MaximumLength(100);
        RuleFor(x => x.ServicePostalCode).MaximumLength(10);
        RuleFor(x => x.ServiceCountry).Must(c => Rules.Country().IsMatch(c!.ToUpperInvariant())).When(x => !string.IsNullOrWhiteSpace(x.ServiceCountry)).WithText("Ländercode im Format DE.", "Country code in the format DE.");
        RuleFor(x => x.VatId).Must(v => Rules.VatId().IsMatch(Text.Upper(v)!)).When(x => !string.IsNullOrWhiteSpace(x.VatId)).WithText("USt-IdNr. im Format DE123456789.", "VAT ID in the format DE123456789.");
        RuleFor(x => x.Notes).MaximumLength(Rules.LongText);
    }
}

public sealed class LineItemInputValidator : AbstractValidator<LineItemInput>
{
    public LineItemInputValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithText("Bitte Bezeichnung angeben.", "Please enter a description.").MaximumLength(Rules.ShortText);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Quantity).GreaterThan(0).WithText("Die Menge muss größer als 0 sein.", "The quantity must be greater than 0.")
            .LessThanOrEqualTo(QuotationCalculator.MaxQuantity).PrecisionScale(18, 3, true).WithText("Höchstens 3 Nachkommastellen.", "At most 3 decimal places.");
        RuleFor(x => x.Unit).NotEmpty().MaximumLength(20);
        RuleFor(x => x.UnitPriceNet).GreaterThanOrEqualTo(0).WithText("Der Preis darf nicht negativ sein.", "The price must not be negative.")
            .LessThanOrEqualTo(QuotationCalculator.MaxUnitPrice).PrecisionScale(18, 2, true).WithText("Höchstens 2 Nachkommastellen.", "At most 2 decimal places.");
        RuleFor(x => x.DiscountPercent).InclusiveBetween(0, 100).PrecisionScale(5, 2, true);
        RuleFor(x => x.TaxRatePercent).InclusiveBetween(0, 100).PrecisionScale(5, 2, true);
    }
}

public sealed class CalculateRequestValidator : AbstractValidator<CalculateRequest>
{
    public CalculateRequestValidator()
    {
        RuleFor(x => x.TaxMode).IsInEnum();
        RuleFor(x => x.LineItems).NotNull().Must(l => l.Count <= QuotationCalculator.MaxLineItems);
        RuleForEach(x => x.LineItems).SetValidator(new LineItemInputValidator());
    }
}

public sealed class CreateQuotationRequestValidator : AbstractValidator<CreateQuotationRequest>
{
    public CreateQuotationRequestValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithText("Bitte Kunden auswählen.", "Please select a customer.");
        RuleFor(x => x.Title).MaximumLength(Rules.ShortText);
        RuleFor(x => x.ValidUntil).GreaterThanOrEqualTo(x => x.IssueDate).When(x => x.IssueDate is not null && x.ValidUntil is not null)
            .WithText("Gültig bis muss nach dem Angebotsdatum liegen.", "“Valid until” must be after the quotation date.");
        RuleFor(x => x.TaxMode).IsInEnum().When(x => x.TaxMode is not null);
        RuleFor(x => x.IntroText).MaximumLength(Rules.LongText);
        RuleFor(x => x.ClosingText).MaximumLength(Rules.LongText);
        RuleFor(x => x.Terms).MaximumLength(Rules.LongText);
        RuleFor(x => x.PaymentTerms).MaximumLength(1000);
        RuleFor(x => x.InternalNotes).MaximumLength(Rules.LongText);
        RuleFor(x => x.LineItems).Must(l => l is null || l.Count <= QuotationCalculator.MaxLineItems).WithText("Höchstens 200 Positionen.", "At most 200 line items.");
        RuleForEach(x => x.LineItems).SetValidator(new LineItemInputValidator());
    }
}

public sealed class UpdateQuotationRequestValidator : AbstractValidator<UpdateQuotationRequest>
{
    public UpdateQuotationRequestValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithText("Bitte Kunden auswählen.", "Please select a customer.");
        RuleFor(x => x.Title).NotEmpty().WithText("Bitte Betreff angeben.", "Please enter a subject.").MaximumLength(Rules.ShortText);
        RuleFor(x => x.ValidUntil).GreaterThanOrEqualTo(x => x.IssueDate).WithText("Gültig bis muss nach dem Angebotsdatum liegen.", "“Valid until” must be after the quotation date.");
        RuleFor(x => x.ValidUntil).LessThanOrEqualTo(x => x.IssueDate.AddDays(365)).WithText("Die Gültigkeit darf höchstens ein Jahr betragen.", "The validity must not exceed one year.");
        RuleFor(x => x.TaxMode).IsInEnum();
        RuleFor(x => x.IntroText).MaximumLength(Rules.LongText);
        RuleFor(x => x.ClosingText).MaximumLength(Rules.LongText);
        RuleFor(x => x.Terms).MaximumLength(Rules.LongText);
        RuleFor(x => x.PaymentTerms).MaximumLength(1000);
        RuleFor(x => x.InternalNotes).MaximumLength(Rules.LongText);
        RuleFor(x => x.LineItems).NotNull().Must(l => l.Count <= QuotationCalculator.MaxLineItems).WithText("Höchstens 200 Positionen.", "At most 200 line items.");
        RuleForEach(x => x.LineItems).SetValidator(new LineItemInputValidator());
        RuleFor(x => x.RowVersion).NotEmpty();
    }
}

public sealed class SendQuotationRequestValidator : AbstractValidator<SendQuotationRequest>
{
    public SendQuotationRequestValidator()
    {
        RuleFor(x => x.Mode).IsInEnum();
        RuleFor(x => x.RecipientEmail).EmailAddress().MaximumLength(254).When(x => !string.IsNullOrWhiteSpace(x.RecipientEmail)).WithText("Bitte gültige E-Mail-Adresse angeben.", "Please enter a valid email address.");
        RuleFor(x => x.Subject).MaximumLength(200);
        RuleFor(x => x.Message).MaximumLength(Rules.LongText);
        RuleFor(x => x).Must(x => x.AttachPdf != false || x.IncludePublicLink)
            .When(x => x.Mode == SendMode.Email)
            .WithText("Bitte PDF anhängen oder einen Kundenlink einfügen.", "Please attach the PDF or include a customer link.");
    }
}

public sealed class DecisionRequestValidator : AbstractValidator<DecisionRequest>
{
    public DecisionRequestValidator() => RuleFor(x => x.Note).MaximumLength(1000);
}

public sealed class CancelRequestValidator : AbstractValidator<CancelRequest>
{
    public CancelRequestValidator() => RuleFor(x => x.Reason).MaximumLength(1000);
}

public sealed class ConvertToJobRequestValidator : AbstractValidator<ConvertToJobRequest>
{
    public ConvertToJobRequestValidator()
    {
        RuleFor(x => x.Title).MaximumLength(Rules.ShortText);
        RuleFor(x => x.Description).MaximumLength(Rules.LongText);
        RuleFor(x => x.Notes).MaximumLength(Rules.LongText);
        RuleFor(x => x.DueDate).GreaterThanOrEqualTo(x => x.PlannedStartDate).When(x => x.DueDate is not null && x.PlannedStartDate is not null)
            .WithText("Das Fälligkeitsdatum muss nach dem geplanten Start liegen.", "The due date must be after the planned start.");
    }
}

public sealed class UpdateJobRequestValidator : AbstractValidator<UpdateJobRequest>
{
    public UpdateJobRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(Rules.ShortText);
        RuleFor(x => x.Description).MaximumLength(Rules.LongText);
        RuleFor(x => x.Notes).MaximumLength(Rules.LongText);
        RuleFor(x => x.DueDate).GreaterThanOrEqualTo(x => x.PlannedStartDate).When(x => x.DueDate is not null && x.PlannedStartDate is not null)
            .WithText("Das Fälligkeitsdatum muss nach dem geplanten Start liegen.", "The due date must be after the planned start.");
        RuleFor(x => x.RowVersion).NotEmpty();
    }
}

public sealed class TemplateLineItemInputValidator : AbstractValidator<TemplateLineItemInput>
{
    public TemplateLineItemInputValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(Rules.ShortText);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.Quantity).GreaterThan(0).LessThanOrEqualTo(QuotationCalculator.MaxQuantity).PrecisionScale(18, 3, true);
        RuleFor(x => x.Unit).NotEmpty().MaximumLength(20);
        RuleFor(x => x.UnitPriceNet).GreaterThanOrEqualTo(0).LessThanOrEqualTo(QuotationCalculator.MaxUnitPrice).PrecisionScale(18, 2, true);
        RuleFor(x => x.DiscountPercent).InclusiveBetween(0, 100);
        RuleFor(x => x.TaxRatePercent).InclusiveBetween(0, 100).When(x => x.TaxRatePercent is not null);
    }
}

public sealed class UpsertTemplateRequestValidator : AbstractValidator<UpsertTemplateRequest>
{
    public UpsertTemplateRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithText("Bitte Namen angeben.", "Please enter a name.").MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(500);
        RuleFor(x => x.IntroText).MaximumLength(Rules.LongText);
        RuleFor(x => x.ClosingText).MaximumLength(Rules.LongText);
        RuleFor(x => x.Terms).MaximumLength(Rules.LongText);
        RuleFor(x => x.LineItems).NotNull().Must(l => l.Count <= QuotationCalculator.MaxLineItems);
        RuleForEach(x => x.LineItems).SetValidator(new TemplateLineItemInputValidator());
    }
}

public sealed class SaveAsTemplateRequestValidator : AbstractValidator<SaveAsTemplateRequest>
{
    public SaveAsTemplateRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public sealed class PublicAcceptRequestValidator : AbstractValidator<PublicAcceptRequest>
{
    public PublicAcceptRequestValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().WithText("Bitte geben Sie Ihren vollständigen Namen ein.", "Please enter your full name.").MinimumLength(3).MaximumLength(150);
        RuleFor(x => x.ConfirmBinding).Equal(true).WithText("Bitte bestätigen Sie die verbindliche Annahme.", "Please confirm the binding acceptance.");
        RuleFor(x => x.Note).MaximumLength(1000);
    }
}

public sealed class PublicRejectRequestValidator : AbstractValidator<PublicRejectRequest>
{
    public PublicRejectRequestValidator()
    {
        RuleFor(x => x.FullName).MaximumLength(150);
        RuleFor(x => x.Reason).MaximumLength(1000);
    }
}

public sealed class DeleteCompanyRequestValidator : AbstractValidator<DeleteCompanyRequest>
{
    public DeleteCompanyRequestValidator() => RuleFor(x => x.ConfirmName).NotEmpty();
}

public sealed class UpdateMemberRequestValidator : AbstractValidator<UpdateMemberRequest>
{
    public UpdateMemberRequestValidator() => RuleFor(x => x.Role).IsInEnum().WithText("Unbekannte Rolle.", "Unknown role.");
}

public sealed class ChangePlanRequestValidator : AbstractValidator<ChangePlanRequest>
{
    public ChangePlanRequestValidator() =>
        RuleFor(x => x.Plan).IsInEnum().NotEqual(SubscriptionPlan.Trial).WithText("Bitte einen gültigen Tarif wählen.", "Please choose a valid plan.");
}

public sealed class ChangeJobStatusRequestValidator : AbstractValidator<ChangeJobStatusRequest>
{
    public ChangeJobStatusRequestValidator() => RuleFor(x => x.Status).IsInEnum().WithText("Unbekannter Status.", "Unknown status.");
}

public sealed class CreateInvoiceRequestValidator : AbstractValidator<CreateInvoiceRequest>
{
    public CreateInvoiceRequestValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithText("Bitte Kunden auswählen.", "Please select a customer.");
        RuleFor(x => x.Title).MaximumLength(Rules.ShortText);
        RuleFor(x => x.ServiceDateTo).GreaterThanOrEqualTo(x => x.ServiceDateFrom).When(x => x.ServiceDateFrom is not null && x.ServiceDateTo is not null)
            .WithText("Das Ende des Leistungszeitraums muss nach dem Beginn liegen.", "The end of the service period must be after its start.");
        RuleFor(x => x.DueDate).GreaterThanOrEqualTo(x => x.IssueDate).When(x => x.IssueDate is not null && x.DueDate is not null)
            .WithText("Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.", "The due date must not be before the invoice date.");
        RuleFor(x => x.TaxMode).IsInEnum().When(x => x.TaxMode is not null);
        RuleFor(x => x.IntroText).MaximumLength(Rules.LongText);
        RuleFor(x => x.ClosingText).MaximumLength(Rules.LongText);
        RuleFor(x => x.PaymentTerms).MaximumLength(1000);
        RuleFor(x => x.BuyerReference).MaximumLength(100);
        RuleFor(x => x.InternalNotes).MaximumLength(Rules.LongText);
        RuleFor(x => x.LineItems).Must(l => l is null || l.Count <= QuotationCalculator.MaxLineItems).WithText("Höchstens 200 Positionen.", "At most 200 line items.");
        RuleForEach(x => x.LineItems).SetValidator(new LineItemInputValidator());
    }
}

public sealed class UpdateInvoiceRequestValidator : AbstractValidator<UpdateInvoiceRequest>
{
    public UpdateInvoiceRequestValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithText("Bitte Kunden auswählen.", "Please select a customer.");
        RuleFor(x => x.Title).NotEmpty().WithText("Bitte Betreff angeben.", "Please enter a subject.").MaximumLength(Rules.ShortText);
        RuleFor(x => x.ServiceDateTo).GreaterThanOrEqualTo(x => x.ServiceDateFrom).When(x => x.ServiceDateFrom is not null && x.ServiceDateTo is not null)
            .WithText("Das Ende des Leistungszeitraums muss nach dem Beginn liegen.", "The end of the service period must be after its start.");
        RuleFor(x => x.DueDate).GreaterThanOrEqualTo(x => x.IssueDate).WithText("Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen.", "The due date must not be before the invoice date.");
        RuleFor(x => x.DueDate).LessThanOrEqualTo(x => x.IssueDate.AddDays(365)).WithText("Das Zahlungsziel darf höchstens ein Jahr betragen.", "The payment term must not exceed one year.");
        RuleFor(x => x.TaxMode).IsInEnum();
        RuleFor(x => x.IntroText).MaximumLength(Rules.LongText);
        RuleFor(x => x.ClosingText).MaximumLength(Rules.LongText);
        RuleFor(x => x.PaymentTerms).MaximumLength(1000);
        RuleFor(x => x.BuyerReference).MaximumLength(100);
        RuleFor(x => x.InternalNotes).MaximumLength(Rules.LongText);
        RuleFor(x => x.LineItems).NotNull().Must(l => l.Count <= QuotationCalculator.MaxLineItems).WithText("Höchstens 200 Positionen.", "At most 200 line items.");
        RuleForEach(x => x.LineItems).SetValidator(new LineItemInputValidator());
        RuleFor(x => x.RowVersion).NotEmpty();
    }
}

public sealed class SendInvoiceRequestValidator : AbstractValidator<SendInvoiceRequest>
{
    public SendInvoiceRequestValidator()
    {
        RuleFor(x => x.Mode).IsInEnum();
        RuleFor(x => x.RecipientEmail).EmailAddress().MaximumLength(254).When(x => !string.IsNullOrWhiteSpace(x.RecipientEmail)).WithText("Bitte gültige E-Mail-Adresse angeben.", "Please enter a valid email address.");
        RuleFor(x => x.Subject).MaximumLength(200);
        RuleFor(x => x.Message).MaximumLength(Rules.LongText);
    }
}

public sealed class RecordPaymentRequestValidator : AbstractValidator<RecordPaymentRequest>
{
    public RecordPaymentRequestValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0).WithText("Der Betrag muss größer als 0 € sein.", "The amount must be greater than €0.")
            .LessThanOrEqualTo(1_000_000_000m).PrecisionScale(18, 2, true).WithText("Höchstens 2 Nachkommastellen.", "At most 2 decimal places.");
        RuleFor(x => x.PaidOn).NotEmpty().WithText("Bitte Zahlungsdatum angeben.", "Please enter the payment date.");
        RuleFor(x => x.Method).MaximumLength(50);
        RuleFor(x => x.Note).MaximumLength(500);
    }
}

public sealed class PaymentReminderRequestValidator : AbstractValidator<PaymentReminderRequest>
{
    public PaymentReminderRequestValidator()
    {
        RuleFor(x => x.RecipientEmail).EmailAddress().MaximumLength(254).When(x => !string.IsNullOrWhiteSpace(x.RecipientEmail)).WithText("Bitte gültige E-Mail-Adresse angeben.", "Please enter a valid email address.");
        RuleFor(x => x.Message).MaximumLength(Rules.LongText);
    }
}
