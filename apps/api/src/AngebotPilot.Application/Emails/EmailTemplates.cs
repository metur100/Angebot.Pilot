using System.Globalization;
using System.Net;
using System.Text;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Quotations;

namespace AngebotPilot.Application.Emails;

public sealed record ComposedEmail(string Subject, string BodyText, string BodyHtml);

/// <summary>
/// German email templates. Every customer-facing quotation email names the sender company, the quotation
/// number, a clear next step and an opt-out link for reminders. No tracking pixels are added.
/// </summary>
public static class EmailTemplates
{
    private static readonly CultureInfo De = CultureInfo.GetCultureInfo("de-DE");

    public static string Eur(decimal value) => value.ToString("#,##0.00", De) + " €";

    public static string Date(DateOnly value) => value.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);

    public static string DefaultSubject(Quotation q, string companyName) => $"Ihr Angebot {q.Number} von {companyName}";

    public static string Salutation(string? contactName) =>
        string.IsNullOrWhiteSpace(contactName) ? "Guten Tag," : $"Guten Tag {contactName},";

    public static ComposedEmail QuotationSent(Quotation q, string companyName, string? subject, string? message, string? publicUrl, bool pdfAttached, string? signature, string? optOutUrl, string brandColor)
    {
        var intro = string.IsNullOrWhiteSpace(message)
            ? $"vielen Dank für Ihre Anfrage. Anbei erhalten Sie unser Angebot {q.Number} „{q.Title}“."
            : message.Trim();
        return Compose(
            subject ?? DefaultSubject(q, companyName),
            Salutation(q.RecipientContact),
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

    public static ComposedEmail DecisionNotification(Quotation q, bool accepted, string? decisionName, string? note, string detailUrl, string productName)
    {
        var verb = accepted ? "angenommen" : "abgelehnt";
        var lines = new List<string>
        {
            $"{q.RecipientName} hat das Angebot {q.Number} „{q.Title}“ über den Kundenlink {verb}.",
            $"Name laut Eingabe: {decisionName ?? "–"}",
            $"Angebotssumme: {Eur(q.GrossTotal)} brutto ({Eur(q.NetTotal)} netto)",
        };
        if (!string.IsNullOrWhiteSpace(note))
        {
            lines.Add($"Nachricht: {note}");
        }

        if (accepted)
        {
            lines.Add("Automatische Erinnerungen wurden beendet. Sie können das Angebot jetzt in einen Auftrag umwandeln.");
        }

        return Compose($"Angebot {q.Number} wurde {verb}", "Hallo,", lines, detailUrl, "Angebot öffnen", null, $"Ihr {productName}", productName, null, "#2F45D8");
    }

    public static ComposedEmail Invitation(string companyName, string inviterName, string roleLabel, string acceptUrl, string productName) =>
        Compose(
            $"Einladung zu {companyName} bei {productName}",
            "Hallo,",
            [$"{inviterName} hat Sie eingeladen, dem Team von {companyName} bei {productName} als {roleLabel} beizutreten.", "Die Einladung ist 7 Tage gültig."],
            acceptUrl,
            "Einladung annehmen",
            "Falls Sie diese Einladung nicht erwartet haben, können Sie diese E-Mail ignorieren.",
            $"Ihr {productName}",
            productName,
            null,
            "#2F45D8");

    public static ComposedEmail PasswordReset(string displayName, string resetUrl, string productName) =>
        Compose(
            $"Passwort zurücksetzen – {productName}",
            $"Hallo {displayName},",
            ["Sie haben angefordert, Ihr Passwort zurückzusetzen. Der Link ist 60 Minuten gültig und kann nur einmal verwendet werden."],
            resetUrl,
            "Neues Passwort festlegen",
            "Falls Sie das nicht waren, ignorieren Sie diese E-Mail. Ihr Passwort bleibt unverändert.",
            $"Ihr {productName}",
            productName,
            null,
            "#2F45D8");

    public static ComposedEmail EmailVerification(string displayName, string verifyUrl, string productName) =>
        Compose(
            $"Bitte bestätigen Sie Ihre E-Mail-Adresse – {productName}",
            $"Hallo {displayName},",
            ["willkommen bei " + productName + "! Bitte bestätigen Sie Ihre E-Mail-Adresse. Erst danach können Angebote per E-Mail an Kunden versendet werden."],
            verifyUrl,
            "E-Mail-Adresse bestätigen",
            "Der Link ist 48 Stunden gültig.",
            $"Ihr {productName}",
            productName,
            null,
            "#2F45D8");

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

    private static ComposedEmail Compose(string subject, string greeting, IEnumerable<string> paragraphs, string? actionUrl, string? actionLabel, string? afterAction, string signature, string footerName, string? optOutUrl, string brandColor)
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
        html.Append("<!DOCTYPE html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>")
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
                .Append(Enc(actionLabel ?? "Öffnen")).Append("</a></p>");
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
