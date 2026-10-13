using System.Text.RegularExpressions;
using AngebotPilot.Domain;

namespace AngebotPilot.Application.Common;

/// <summary>
/// System texts are stored in German when they are created (event details, follow-up and delivery reasons,
/// notifications, activity summaries). For English requests they are translated at read time, which also covers
/// historic rows. Only exact known phrases and strict patterns are translated; user-entered and unknown texts are
/// returned unchanged. German requests always get the stored text.
/// </summary>
public static class StoredText
{
    // Document numbers such as AN-2026-0042 or AN-2026-0042-R2.
    private const string Number = @"[A-Z0-9]{1,8}-\d{4}-\d+(?:-R\d+)?";
    private const string Email = @"\S+@\S+";
    private const string Amount = @"-?[\d.]+,\d{2} €";
    private const string Date = @"\d{2}\.\d{2}\.\d{4}";

    private static readonly Dictionary<string, string> Phrases = new(StringComparer.Ordinal)
    {
        // Follow-up / delivery cancellation reasons
        ["Angebot angenommen"] = "Quotation accepted",
        ["Angebot abgelehnt"] = "Quotation rejected",
        ["Angebot storniert"] = "Quotation cancelled",
        ["Angebot abgelaufen"] = "Quotation expired",
        ["Angebot nicht mehr vorhanden"] = "Quotation no longer exists",
        ["Angebot nicht mehr offen"] = "Quotation no longer open",
        ["Kunde wünscht keine Erinnerungen"] = "Customer does not want reminders",
        ["Kunde hat Erinnerungen abbestellt"] = "Customer unsubscribed from reminders",
        ["Kunde anonymisiert"] = "Customer anonymised",
        ["Keine E-Mail-Adresse hinterlegt"] = "No email address on file",
        ["Manuell beendet"] = "Stopped manually",
        ["Rechnung bezahlt"] = "Invoice paid",
        ["Rechnung storniert"] = "Invoice cancelled",

        // Event details
        ["1. Erinnerung"] = "1st reminder",
        ["2. Erinnerung"] = "2nd reminder",
        ["Erinnerung vor Ablauf"] = "Reminder before expiry",
        ["Ohne E-Mail durch den Anbieter übermittelt"] = "Delivered by the provider without email",
        ["Ohne E-Mail übermittelt (z. B. per Post)"] = "Delivered without email (e.g. by post)",
        ["Neuer Link, frühere Links widerrufen"] = "New link, previous links revoked",
        ["Als neuer Entwurf kopiert"] = "Copied as a new draft",
        ["Vom Anbieter erfasst"] = "Recorded by the provider",
        ["Über den Kundenlink"] = "Via the customer link",

        // Email delivery errors
        ["Empfängerdomain ist nicht zustellbar (reservierte Test-Domain)."] = "The recipient domain cannot receive email (reserved test domain).",
        ["Ungültige E-Mail-Adresse."] = "Invalid email address.",
        ["Anmeldung am Mailserver fehlgeschlagen."] = "Sign-in to the mail server failed.",
        ["Mailserver nicht erreichbar."] = "Mail server unreachable.",
        ["Simulierter vorübergehender Fehler"] = "Simulated temporary failure",
        ["Simulierter dauerhafter Fehler"] = "Simulated permanent failure",
        ["Kein E-Mail-Versanddienst konfiguriert."] = "No email delivery service configured.",
    };

    private static readonly Dictionary<string, string> EmailKinds = new(StringComparer.Ordinal)
    {
        ["Angebots-E-Mail"] = "Quotation email",
        ["1. Erinnerung"] = "1st reminder",
        ["2. Erinnerung"] = "2nd reminder",
        ["Erinnerung vor Ablauf"] = "Reminder before expiry",
        ["Rechnungs-E-Mail"] = "Invoice email",
        ["Zahlungserinnerung"] = "Payment reminder",
        ["E-Mail"] = "Email",
    };

    private static readonly (Regex Pattern, Func<Match, string> English)[] Patterns =
    [
        (Rx($"^(?<kind>{string.Join('|', EmailKinds.Keys.Select(Regex.Escape))}) an (?<to>{Email})$"), m => $"{EmailKinds[m.Groups["kind"].Value]} to {m.Groups["to"].Value}"),
        (Rx($"^Automatische Zahlungserinnerung an (?<to>{Email})$"), m => $"Automatic payment reminder to {m.Groups["to"].Value}"),
        (Rx($"^An (?<to>{Email})$"), m => $"To {m.Groups["to"].Value}"),
        (Rx($"^Kopie von (?<n>{Number}|Entwurf)$"), m => $"Copy of {Draft(m.Groups["n"].Value)}"),
        (Rx($"^Kopiert nach (?<n>{Number})$"), m => $"Copied to {m.Groups["n"].Value}"),
        (Rx($"^Revision (?<r>\\d+) von (?<n>{Number})$"), m => $"Revision {m.Groups["r"].Value} of {m.Groups["n"].Value}"),
        (Rx($"^Aus Auftrag (?<n>{Number})$"), m => $"From job {m.Groups["n"].Value}"),
        (Rx($"^Aus Angebot (?<n>{Number})$"), m => $"From quotation {m.Groups["n"].Value}"),
        (Rx("^Aus Vorlage „(?<t>.*)“$"), m => $"From template “{m.Groups["t"].Value}”"),
        (Rx($"^Stornorechnung zu (?<n>{Number})$"), m => $"Cancellation invoice for {m.Groups["n"].Value}"),
        (Rx($"^Ersetzt durch (?<n>{Number})$"), m => $"Superseded by {m.Groups["n"].Value}"),
        (Rx($"^(?<a>{Amount}) am (?<d>{Date})$"), m => $"{m.Groups["a"].Value} on {m.Groups["d"].Value}"),
        (Rx($"^(?<a>{Amount}) vom (?<d>{Date})$"), m => $"{m.Groups["a"].Value} paid on {m.Groups["d"].Value}"),
        (Rx("^Vom Anbieter erfasst: (?<note>.*)$"), m => $"Recorded by the provider: {m.Groups["note"].Value}"),
        (Rx("^Über den Kundenlink von (?<name>.+)$"), m => $"Via the customer link by {m.Groups["name"].Value}"),
        (Rx(@"^Vom Mailserver abgelehnt \((?<c>\d+)\)\.$"), m => $"Rejected by the mail server ({m.Groups["c"].Value})."),
        (Rx(@"^Vorübergehender Fehler des Mailservers \((?<c>\d+)\)\.$"), m => $"Temporary mail server error ({m.Groups["c"].Value})."),

        // Notifications
        (Rx($"^Angebot (?<n>{Number}) ist abgelaufen$"), m => $"Quotation {m.Groups["n"].Value} has expired"),
        (Rx($"^Angebot (?<n>{Number}) wurde angenommen$"), m => $"Quotation {m.Groups["n"].Value} was accepted"),
        (Rx($"^Angebot (?<n>{Number}) wurde abgelehnt$"), m => $"Quotation {m.Groups["n"].Value} was rejected"),
        (Rx($"^E-Mail zu Angebot (?<n>{Number}) konnte nicht versendet werden$"), m => $"Email for quotation {m.Groups["n"].Value} could not be sent"),
        (Rx($"^E-Mail zu Rechnung (?<n>{Number}) konnte nicht versendet werden$"), m => $"Email for invoice {m.Groups["n"].Value} could not be sent"),
        (Rx(@"^Das Angebot an (?<name>.+) wurde nicht innerhalb der Gültigkeit beantwortet\.$"), m => $"The quotation to {m.Groups["name"].Value} was not answered within its validity period."),
        (Rx("^(?<name>.+) hat das Angebot „(?<t>.*)“ angenommen\\.$"), m => $"{m.Groups["name"].Value} accepted the quotation “{m.Groups["t"].Value}”."),
        (Rx("^(?<name>.+) hat das Angebot „(?<t>.*)“ abgelehnt\\.$"), m => $"{m.Groups["name"].Value} rejected the quotation “{m.Groups["t"].Value}”."),
    ];

    // Activity summaries are only translated for the action that wrote them: summaries also contain plain names.
    private static readonly Dictionary<string, (Regex Pattern, Func<Match, string> English)[]> ActivityPatterns = new(StringComparer.Ordinal)
    {
        ["invoice.created"] =
        [
            (Rx($"^aus Auftrag (?<n>{Number})$"), m => $"from job {m.Groups["n"].Value}"),
            (Rx($"^aus Angebot (?<n>{Number})$"), m => $"from quotation {m.Groups["n"].Value}"),
            (Rx($"^Kopie von (?<n>{Number}|Entwurf)$"), m => $"copy of {Draft(m.Groups["n"].Value)}"),
            (Rx("^(?<t>.*) für (?<c>.+)$"), m => $"{m.Groups["t"].Value} for {m.Groups["c"].Value}"),
        ],
        ["quotation.deleted"] = [(Rx($"^(?<n>{Number}) \\(Nummer wird nicht erneut vergeben\\)$"), m => $"{m.Groups["n"].Value} (number will not be reused)")],
        ["invoice.reminder_sent"] = [(Rx($"^(?<n>{Number}) \\(automatisch\\)$"), m => $"{m.Groups["n"].Value} (automatic)")],
        ["invoice.cancelled"] = [(Rx($"^(?<n>{Number}) → Storno (?<s>{Number})$"), m => $"{m.Groups["n"].Value} → cancellation {m.Groups["s"].Value}")],
        ["job.created"] = [(Rx($"^(?<j>{Number}) aus (?<n>{Number})$"), m => $"{m.Groups["j"].Value} from {m.Groups["n"].Value}")],
        ["template.created"] = [(Rx($"^(?<t>.+) aus (?<n>{Number})$"), m => $"{m.Groups["t"].Value} from {m.Groups["n"].Value}")],
        ["member.invited"] = [(Rx($"^(?<e>{Email}) als (?<r>\\w+)$"), m => $"{m.Groups["e"].Value} as {m.Groups["r"].Value}")],
    };

    /// <summary>Event details, reasons, delivery errors and notification texts.</summary>
    public static string? Localize(string? text) =>
        text is null || !Loc.IsEnglish ? text : Phrases.TryGetValue(text, out var phrase) ? phrase : Translate(text, Patterns);

    /// <summary>Summary of an audit event shown in the activity feed.</summary>
    public static string? ActivitySummary(string action, string? summary) =>
        summary is null || !Loc.IsEnglish || !ActivityPatterns.TryGetValue(action, out var patterns) ? summary : Translate(summary, patterns);

    private static string Draft(string label) => label == "Entwurf" ? "draft" : label;

    private static string Translate(string text, (Regex Pattern, Func<Match, string> English)[] patterns)
    {
        foreach (var (pattern, english) in patterns)
        {
            var match = pattern.Match(text);
            if (match.Success)
            {
                return english(match);
            }
        }

        return text;
    }

    private static Regex Rx(string pattern) => new(pattern, RegexOptions.CultureInvariant | RegexOptions.ExplicitCapture, TimeSpan.FromMilliseconds(100));
}
