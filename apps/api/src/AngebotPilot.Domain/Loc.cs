using System.Globalization;

namespace AngebotPilot.Domain;

/// <summary>
/// Language of user-facing messages (German default, English). Inline pairs keep the German original next to its
/// translation. The current request's UI culture (set from Accept-Language by the API) selects the text; number and
/// date formatting is never affected. Documents for customers (PDF, e-invoice, CSV, customer emails) stay German.
/// </summary>
public static class Loc
{
    public const string German = "de";
    public const string English = "en";

    public static readonly CultureInfo GermanCulture = CultureInfo.GetCultureInfo("de-DE");
    public static readonly CultureInfo EnglishCulture = CultureInfo.GetCultureInfo("en");

    /// <summary>True when the current UI culture is English.</summary>
    public static bool IsEnglish => CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == English;

    /// <summary>"de" or "en" for the current UI culture.</summary>
    public static string Current => IsEnglish ? English : German;

    /// <summary>German or English text for the current request.</summary>
    public static string T(string de, string en) => IsEnglish ? en : de;

    /// <summary>German or English text for an explicit language (emails to users, background jobs).</summary>
    public static string For(string? language, string de, string en) => Normalize(language) == English ? en : de;

    public static bool IsSupported(string? language) => language is German or English;

    /// <summary>Maps any input to a supported language; everything that is not English is German.</summary>
    public static string Normalize(string? language) =>
        language is not null && language.Trim().StartsWith(English, StringComparison.OrdinalIgnoreCase) ? English : German;

    public static CultureInfo Culture(string? language) => Normalize(language) == English ? EnglishCulture : GermanCulture;

    /// <summary>Temporarily switches the UI culture, e.g. to compose a message in a recipient's language.</summary>
    public static IDisposable Use(string? language)
    {
        var previous = CultureInfo.CurrentUICulture;
        CultureInfo.CurrentUICulture = Culture(language);
        return new Restore(previous);
    }

    private sealed class Restore(CultureInfo previous) : IDisposable
    {
        public void Dispose() => CultureInfo.CurrentUICulture = previous;
    }
}
