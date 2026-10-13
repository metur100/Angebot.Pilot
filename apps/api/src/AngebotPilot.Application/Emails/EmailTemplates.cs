using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Invoices;
using AngebotPilot.Domain.Quotations;

namespace AngebotPilot.Application.Emails;

public sealed record ComposedEmail(string Subject, string BodyText, string BodyHtml);

/// <summary>
/// Email templates. Every customer-facing quotation email names the sender company, the quotation
/// number, a clear next step and an opt-out link for reminders. No tracking pixels are added.
/// Emails to customers are always German; account emails to AngebotPilot users (verification, password reset,
/// invitation, decision notification) use the recipient's language ("de"/"en"), passed explicitly because
/// background jobs and customer requests have no culture of the recipient.
/// </summary>
public static class EmailTemplates
{
    private static readonly CultureInfo De = CultureInfo.GetCultureInfo("de-DE");

    public static string Eur(decimal value) => value.ToString("#,##0.00", De) + " €";

    public static string Date(DateOnly value) => value.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);

    /// <summary>Amount for an account email: German format, or "€1,234.56" in English.</summary>
    private static string Money(decimal value, string language) =>
        Loc.Normalize(language) == Loc.English ? "€" + value.ToString("#,##0.00", CultureInfo.InvariantCulture) : Eur(value);

    public static string DefaultSubject(Quotation q, string companyName) => $"Ihr Angebot {q.Number} von {companyName}";

    public static string Salutation(string? contactName) =>
        string.IsNullOrWhiteSpace(contactName) ? "Guten Tag," : $"Guten Tag {contactName},";

    private static readonly Regex SalutationLine = new(
        @"^(guten\s+(tag|morgen|abend)|hallo|hi|moin|servus|grüß\s+gott|sehr\s+geehrte[rs]?|liebe[rs]?)\b[^.?]*[,!]?$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>
    /// Splits a custom message into greeting and body. When the message starts with its own salutation
    /// ("Guten Tag Frau Meier,"), that line replaces the default greeting instead of appearing twice.
    /// Body is null when the message is empty or consists of the salutation only.
    /// </summary>
    public static (string Greeting, string? Body) GreetingAndBody(string? message, string? contactName)
    {
        var trimmed = message?.Trim() ?? string.Empty;
        var lineEnd = trimmed.IndexOf('\n');
        var firstLine = (lineEnd < 0 ? trimmed : trimmed[..lineEnd]).Trim();
        if (firstLine.Length is > 0 and <= 100 && SalutationLine.IsMatch(firstLine))
        {
            var rest = lineEnd < 0 ? string.Empty : trimmed[(lineEnd + 1)..].Trim();
            return (firstLine, rest.Length == 0 ? null : rest);
        }

        return (Salutation(contactName), trimmed.Length == 0 ? null : trimmed);
    }

    public static ComposedEmail QuotationSent(Quotation q, string companyName, string? subject, string? message, string? publicUrl, bool pdfAttached, string? signature, string? optOutUrl, string brandColor)
    {
        var (greeting, body) = GreetingAndBody(message, q.RecipientContact);
        var intro = body ?? $"vielen Dank für Ihre Anfrage. Anbei erhalten Sie unser Angebot {q.Number} „{q.Title}“.";
        return Compose(
            subject ?? DefaultSubject(q, companyName),
            greeting,
            [intro, Summary(q)],
            publicUrl,
            publicUrl is null ? null : "Angebot ansehen und annehmen",
            NextStep(publicUrl, pdfAttached, q.ValidUntil),
            signature ?? $"Mit freundlichen Grüßen\n{companyName}",
            companyName,
            optOutUrl,
            brandColor);
    }

    public static ComposedEmail Reminder(FollowUpKind kind, Quotation q, string companyName, string? publicUrl, bool pdfAttached, string? signature, string? optOutUrl, string brandColor)
    {
        var (subject, text) = kind switch
        {
            FollowUpKind.ExpiryReminder => (
                $"Erinnerung: Angebot {q.Number} ist noch bis {Date(q.ValidUntil)} gültig",
                $"unser Angebot {q.Number} „{q.Title}“ ist noch bis zum {Date(q.ValidUntil)} gültig. Falls Sie Fragen haben oder etwas angepasst werden soll, melden Sie sich gern."),
            FollowUpKind.SecondReminder => (
                $"Nachfrage zu unserem Angebot {q.Number}",
                $"wir möchten noch einmal kurz an unser Angebot {q.Number} „{q.Title}“ erinnern. Gern beantworten wir Ihre Fragen oder passen das Angebot an Ihre Wünsche an."),
            _ => (
                $"Kurze Nachfrage zu unserem Angebot {q.Number}",
                $"vor einigen Tagen haben wir Ihnen unser Angebot {q.Number} „{q.Title}“ gesendet. Haben Sie schon Gelegenheit gehabt, es sich anzusehen?"),
        };
        return Compose(subject, Salutation(q.RecipientContact), [text, Summary(q)], publicUrl, publicUrl is null ? null : "Angebot ansehen", NextStep(publicUrl, pdfAttached, q.ValidUntil),
            signature ?? $"Mit freundlichen Grüßen\n{companyName}", companyName, optOutUrl, brandColor);
    }

    public static string DefaultSubject(Invoice invoice, string companyName) =>
        invoice.IsCancellation ? $"Stornorechnung {invoice.Number} von {companyName}" : $"Ihre Rechnung {invoice.Number} von {companyName}";

    public static ComposedEmail InvoiceSent(Invoice invoice, string companyName, string? subject, string? message, string? signature, string brandColor)
    {
        var (greeting, body) = GreetingAndBody(message, invoice.RecipientContact);
        var intro = body ?? (invoice.IsCancellation
            ? $"anbei erhalten Sie die Stornorechnung {invoice.Number} zu unserer Rechnung {invoice.CancelledInvoiceNumber}."
            : $"vielen Dank für Ihren Auftrag. Anbei erhalten Sie unsere Rechnung {invoice.Number} „{invoice.Title}“.");
        var summary = invoice.IsCancellation
            ? $"Stornorechnung: {invoice.Number}\nStorniert: Rechnung {invoice.CancelledInvoiceNumber}\nBetrag: −{Eur(invoice.GrossTotal)}"
            : $"Rechnungsnummer: {invoice.Number}\nRechnungsbetrag: {Eur(invoice.GrossTotal)}{(invoice.TaxMode == TaxMode.Standard ? " inkl. USt." : string.Empty)}\nZahlbar bis: {Date(invoice.DueDate)}";
        var after = invoice.IsCancellation
            ? "Die Rechnung finden Sie im Anhang als PDF. Sie enthält zusätzlich die strukturierten Rechnungsdaten (E-Rechnung im ZUGFeRD-Format)."
            : "Die Rechnung finden Sie im Anhang als PDF. Sie enthält zusätzlich die strukturierten Rechnungsdaten (E-Rechnung im ZUGFeRD-Format), die Ihre Buchhaltungssoftware direkt einlesen kann.";
        return Compose(subject ?? DefaultSubject(invoice, companyName), greeting, [intro, summary], null, null, after,
            signature ?? $"Mit freundlichen Grüßen\n{companyName}", companyName, null, brandColor);
    }

    public static ComposedEmail PaymentReminder(Invoice invoice, string companyName, string? message, string? signature, string brandColor)
    {
        var (greeting, body) = GreetingAndBody(message, invoice.RecipientContact);
        var intro = body ?? $"sicher ist es Ihrer Aufmerksamkeit entgangen: Unsere Rechnung {invoice.Number} „{invoice.Title}“ vom {Date(invoice.IssueDate)} war am {Date(invoice.DueDate)} fällig. Bis heute konnten wir noch keinen vollständigen Zahlungseingang feststellen.";
        var summary = $"Rechnungsnummer: {invoice.Number}\nRechnungsbetrag: {Eur(invoice.GrossTotal)}\nNoch offen: {Eur(invoice.OpenAmount)}\nFällig seit: {Date(invoice.DueDate)}";
        return Compose($"Zahlungserinnerung zu Rechnung {invoice.Number}", greeting, [intro, summary], null, null,
            $"Bitte überweisen Sie den offenen Betrag in den nächsten Tagen unter Angabe der Rechnungsnummer. Die Rechnung finden Sie zur Sicherheit noch einmal im Anhang. Sollte sich Ihre Zahlung mit dieser E-Mail überschnitten haben, betrachten Sie sie bitte als gegenstandslos.",
            signature ?? $"Mit freundlichen Grüßen\n{companyName}", companyName, null, brandColor);
    }

    public static ComposedEmail DecisionNotification(Quotation q, bool accepted, string? decisionName, string? note, string detailUrl, string productName, string language = Loc.German)
    {
        string L(string de, string en) => Loc.For(language, de, en);
        var verb = accepted ? L("angenommen", "accepted") : L("abgelehnt", "rejected");
        var lines = new List<string>
        {
            L($"{q.RecipientName} hat das Angebot {q.Number} „{q.Title}“ über den Kundenlink {verb}.", $"{q.RecipientName} has {verb} quotation {q.Number} “{q.Title}” via the customer link."),
            L($"Name laut Eingabe: {decisionName ?? "–"}", $"Name entered: {decisionName ?? "–"}"),
            L($"Angebotssumme: {Eur(q.GrossTotal)} brutto ({Eur(q.NetTotal)} netto)", $"Quotation total: {Money(q.GrossTotal, language)} gross ({Money(q.NetTotal, language)} net)"),
        };
        if (!string.IsNullOrWhiteSpace(note))
        {
            lines.Add(L($"Nachricht: {note}", $"Message: {note}"));
        }

        if (accepted)
        {
            lines.Add(L("Automatische Erinnerungen wurden beendet. Sie können das Angebot jetzt in einen Auftrag umwandeln.",
                "Automatic reminders have been stopped. You can now convert the quotation into a job."));
        }

        return Compose(L($"Angebot {q.Number} wurde {verb}", $"Quotation {q.Number} was {verb}"), L("Hallo,", "Hello,"), lines, detailUrl, L("Angebot öffnen", "Open quotation"), null,
            L($"Ihr {productName}", $"Your {productName} team"), productName, null, "#2F45D8", language);
    }

    /// <summary>The invitee may not have an account yet, so the inviter's language is used.</summary>
    public static ComposedEmail Invitation(string companyName, string inviterName, MembershipRole role, string acceptUrl, string productName, string language = Loc.German)
    {
        string L(string de, string en) => Loc.For(language, de, en);
        var roleLabel = role == MembershipRole.Admin ? L("Administrator:in", "administrator") : L("Mitarbeiter:in", "team member");
        return Compose(
            L($"Einladung zu {companyName} bei {productName}", $"Invitation to {companyName} on {productName}"),
            L("Hallo,", "Hello,"),
            [
                L($"{inviterName} hat Sie eingeladen, dem Team von {companyName} bei {productName} als {roleLabel} beizutreten.",
                    $"{inviterName} has invited you to join the {companyName} team on {productName} as {roleLabel}."),
                L("Die Einladung ist 7 Tage gültig.", "The invitation is valid for 7 days."),
            ],
            acceptUrl,
            L("Einladung annehmen", "Accept invitation"),
            L("Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.", "If you were not expecting this invitation, you can ignore this email."),
            L($"Ihr {productName}", $"Your {productName} team"),
            productName,
            null,
            "#2F45D8",
            language);
    }

    public static ComposedEmail PasswordReset(string displayName, string resetUrl, string productName, string language = Loc.German)
    {
        string L(string de, string en) => Loc.For(language, de, en);
        return Compose(
            L($"Passwort zurücksetzen – {productName}", $"Reset your password – {productName}"),
            L($"Hallo {displayName},", $"Hello {displayName},"),
            [L("Sie haben angefordert, Ihr Passwort zurückzusetzen. Der Link ist 60 Minuten gültig und kann nur einmal verwendet werden.",
                "You asked to reset your password. The link is valid for 60 minutes and can only be used once.")],
            resetUrl,
            L("Neues Passwort festlegen", "Set a new password"),
            L("Falls Sie das nicht waren, ignorieren Sie diese E-Mail. Ihr Passwort bleibt unverändert.", "If this wasn't you, please ignore this email. Your password stays unchanged."),
            L($"Ihr {productName}", $"Your {productName} team"),
            productName,
            null,
            "#2F45D8",
            language);
    }

    public static ComposedEmail EmailVerification(string displayName, string verifyUrl, string productName, string language = Loc.German)
    {
        string L(string de, string en) => Loc.For(language, de, en);
        return Compose(
            L($"Bitte bestätigen Sie Ihre E-Mail-Adresse – {productName}", $"Please confirm your email address – {productName}"),
            L($"Hallo {displayName},", $"Hello {displayName},"),
            [L("willkommen bei " + productName + "! Bitte bestätigen Sie Ihre E-Mail-Adresse. Erst danach können Angebote per E-Mail an Kunden versendet werden.",
                "welcome to " + productName + "! Please confirm your email address. Only then can quotations be sent to customers by email.")],
            verifyUrl,
            L("E-Mail-Adresse bestätigen", "Confirm email address"),
            L("Der Link ist 48 Stunden gültig.", "The link is valid for 48 hours."),
            L($"Ihr {productName}", $"Your {productName} team"),
            productName,
            null,
            "#2F45D8",
            language);
    }

    private static string Summary(Quotation q) =>
        $"Angebotsnummer: {q.Number}\nGesamtbetrag: {Eur(q.GrossTotal)}{(q.TaxMode == TaxMode.Standard ? " inkl. USt." : string.Empty)}\nGültig bis: {Date(q.ValidUntil)}";

    private static string NextStep(string? publicUrl, bool pdfAttached, DateOnly validUntil)
    {
        var source = (publicUrl, pdfAttached) switch
        {
            (not null, true) => "Das Angebot finden Sie im Anhang als PDF und über den Link oben. Dort können Sie es auch direkt online annehmen oder ablehnen.",
            (not null, false) => "Über den Link oben können Sie das Angebot ansehen, als PDF herunterladen und direkt online annehmen oder ablehnen.",
            _ => "Das Angebot finden Sie im Anhang als PDF. Für eine Annahme antworten Sie einfach auf diese E-Mail.",
        };
        return $"{source} Das Angebot ist bis zum {Date(validUntil)} gültig.";
    }

    private static ComposedEmail Compose(string subject, string greeting, IEnumerable<string> paragraphs, string? actionUrl, string? actionLabel, string? afterAction, string signature, string footerName, string? optOutUrl, string brandColor, string language = Loc.German)
    {
        var paragraphList = paragraphs.ToList();
        var text = new StringBuilder();
        text.AppendLine(greeting).AppendLine();
        foreach (var p in paragraphList)
        {
            text.AppendLine(p).AppendLine();
        }

        if (actionUrl is not null)
        {
            text.AppendLine($"{actionLabel}: {actionUrl}").AppendLine();
        }

        if (afterAction is not null)
        {
            text.AppendLine(afterAction).AppendLine();
        }

        text.AppendLine(signature);
        if (optOutUrl is not null)
        {
            text.AppendLine().AppendLine("—").AppendLine($"Sie möchten keine Erinnerungen zu diesem Angebot erhalten? Abmelden: {optOutUrl}");
        }

        var color = WebUtility.HtmlEncode(brandColor);
        var html = new StringBuilder();
        html.Append("<!DOCTYPE html><html lang=\"").Append(Loc.Normalize(language)).Append("\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>")
            .Append(Enc(subject)).Append("</title></head>")
            .Append("<body style=\"margin:0;padding:0;background:#F6F7F9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#141821;\">")
            .Append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#F6F7F9;padding:24px 12px;\"><tr><td align=\"center\">")
            .Append("<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px;background:#FFFFFF;border:1px solid #E2E5EA;border-radius:12px;\">")
            .Append("<tr><td style=\"height:6px;background:").Append(color).Append(";border-radius:12px 12px 0 0;\"></td></tr>")
            .Append("<tr><td style=\"padding:32px 32px 8px 32px;font-size:16px;line-height:24px;\">")
            .Append("<p style=\"margin:0 0 16px 0;\">").Append(Enc(greeting)).Append("</p>");
        foreach (var p in paragraphList)
        {
            html.Append("<p style=\"margin:0 0 16px 0;\">").Append(Enc(p).Replace("\n", "<br>")).Append("</p>");
        }

        if (actionUrl is not null)
        {
            html.Append("<p style=\"margin:24px 0;\"><a href=\"").Append(Enc(actionUrl))
                .Append("\" style=\"display:inline-block;background:").Append(color)
                .Append(";color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;\">")
                .Append(Enc(actionLabel ?? Loc.For(language, "Öffnen", "Open"))).Append("</a></p>");
        }

        if (afterAction is not null)
        {
            html.Append("<p style=\"margin:0 0 16px 0;color:#4D5566;\">").Append(Enc(afterAction)).Append("</p>");
        }

        html.Append("<p style=\"margin:24px 0 24px 0;\">").Append(Enc(signature).Replace("\n", "<br>")).Append("</p></td></tr>")
            .Append("<tr><td style=\"padding:16px 32px 24px 32px;border-top:1px solid #EEF0F3;font-size:12px;line-height:18px;color:#6B7485;\">")
            .Append(Enc(footerName));
        if (optOutUrl is not null)
        {
            html.Append("<br>Sie möchten keine Erinnerungen zu diesem Angebot erhalten? <a href=\"").Append(Enc(optOutUrl))
                .Append("\" style=\"color:#4D5566;\">Erinnerungen abbestellen</a>");
        }

        html.Append("</td></tr></table></td></tr></table></body></html>");
        return new ComposedEmail(subject, text.ToString().TrimEnd() + "\n", html.ToString());
    }

    private static string Enc(string value) => WebUtility.HtmlEncode(value);
}
