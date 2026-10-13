using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using AngebotPilot.Application.Abstractions;
using MailKit;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace AngebotPilot.Infrastructure.Email;

public sealed class EmailOptions
{
    public const string Section = "Email";

    /// <summary>"Smtp" for real delivery, "Capture" to keep messages in a local development sink.</summary>
    public string Provider { get; set; } = "Capture";

    public string FromAddress { get; set; } = "no-reply@example.invalid";

    public string FromName { get; set; } = "AngebotPilot";

    public string? SmtpHost { get; set; }

    public int SmtpPort { get; set; } = 587;

    /// <summary>"StartTls" (port 587) or "SslOnConnect" (port 465).</summary>
    public string SmtpSecurity { get; set; } = "StartTls";

    public string? SmtpUsername { get; set; }

    public string? SmtpPassword { get; set; }

    /// <summary>Capture mode only: also write .eml files to this folder.</summary>
    public string? CaptureDirectory { get; set; }
}

internal static class MimeFactory
{
    public static MimeMessage Create(OutgoingEmail email, EmailOptions options)
    {
        var message = new MimeMessage();
        // The visible sender name is the company; the address stays the platform's verified sending address.
        message.From.Add(new MailboxAddress(email.FromDisplayName is null ? options.FromName : $"{email.FromDisplayName} via {options.FromName}", options.FromAddress));
        message.To.Add(MailboxAddress.Parse(email.To));
        if (!string.IsNullOrWhiteSpace(email.ReplyTo))
        {
            message.ReplyTo.Add(MailboxAddress.Parse(email.ReplyTo));
        }

        message.Subject = email.Subject;
        var domain = options.FromAddress.Contains('@', StringComparison.Ordinal) ? options.FromAddress[(options.FromAddress.IndexOf('@', StringComparison.Ordinal) + 1)..] : "angebotpilot.local";
        // Deterministic Message-ID per idempotency key, so a retried message is recognisable as the same message.
        message.MessageId = $"{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(email.IdempotencyKey)))[..32].ToLowerInvariant()}@{domain}";
        message.Headers.Add("Auto-Submitted", email.IdempotencyKey.StartsWith("followup:", StringComparison.Ordinal) ? "auto-generated" : "no");

        var builder = new BodyBuilder { TextBody = email.BodyText, HtmlBody = email.BodyHtml };
        foreach (var attachment in email.Attachments)
        {
            builder.Attachments.Add(attachment.FileName, attachment.Content, ContentType.Parse(attachment.ContentType));
        }

        message.Body = builder.ToMessageBody();
        return message;
    }
}

/// <summary>SMTP delivery via MailKit. "HandedOff" means the server accepted the message; it is not a delivery receipt.</summary>
public sealed class SmtpEmailSender(EmailOptions options, ILogger<SmtpEmailSender> logger) : IEmailSender
{
    public async Task<EmailSendResult> SendAsync(OutgoingEmail email, CancellationToken cancellationToken)
    {
        MimeMessage message;
        try
        {
            message = MimeFactory.Create(email, options);
        }
        catch (ParseException)
        {
            return new EmailSendResult(EmailSendOutcome.PermanentFailure, null, "Ungültige E-Mail-Adresse.");
        }

        using var client = new SmtpClient();
        try
        {
            var security = string.Equals(options.SmtpSecurity, "SslOnConnect", StringComparison.OrdinalIgnoreCase) ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls;
            await client.ConnectAsync(options.SmtpHost!, options.SmtpPort, security, cancellationToken);
            if (!string.IsNullOrEmpty(options.SmtpUsername))
            {
                await client.AuthenticateAsync(options.SmtpUsername, options.SmtpPassword ?? string.Empty, cancellationToken);
            }

            var response = await client.SendAsync(message, cancellationToken);
            await client.DisconnectAsync(true, cancellationToken);
            return new EmailSendResult(EmailSendOutcome.HandedOff, message.MessageId, null);
        }
        catch (SmtpCommandException e) when ((int)e.StatusCode >= 500)
        {
            logger.LogWarning("SMTP rejected message permanently: {StatusCode}", e.StatusCode);
            return new EmailSendResult(EmailSendOutcome.PermanentFailure, null, $"Vom Mailserver abgelehnt ({(int)e.StatusCode}).");
        }
        catch (SmtpCommandException e)
        {
            return new EmailSendResult(EmailSendOutcome.TemporaryFailure, null, $"Vorübergehender Fehler des Mailservers ({(int)e.StatusCode}).");
        }
        catch (AuthenticationException)
        {
            logger.LogError("SMTP authentication failed; check Email:SmtpUsername/SmtpPassword");
            return new EmailSendResult(EmailSendOutcome.TemporaryFailure, null, "Anmeldung am Mailserver fehlgeschlagen.");
        }
        catch (Exception e) when (e is IOException or ServiceNotConnectedException or SmtpProtocolException or System.Net.Sockets.SocketException or TimeoutException)
        {
            return new EmailSendResult(EmailSendOutcome.TemporaryFailure, null, "Mailserver nicht erreichbar.");
        }
    }
}

public sealed record CapturedEmail(Guid Id, string To, string Subject, string BodyText, string? BodyHtml, DateTimeOffset CreatedAt, IReadOnlyList<string> Attachments, string IdempotencyKey);

/// <summary>
/// Development/test sink: keeps the last messages in memory (readable via the dev-only endpoint) and optionally writes
/// .eml files. Never used in production.
/// </summary>
public sealed class CaptureEmailSender(EmailOptions options, TimeProvider clock) : IEmailSender
{
    private static readonly ConcurrentQueue<CapturedEmail> Messages = new();

    /// <summary>Set by tests to simulate provider failures for the next sends.</summary>
    public static ConcurrentQueue<EmailSendOutcome> ForcedOutcomes { get; } = new();

    public static IReadOnlyList<CapturedEmail> All => Messages.ToArray();

    public static void Clear() => Messages.Clear();

    public async Task<EmailSendResult> SendAsync(OutgoingEmail email, CancellationToken cancellationToken)
    {
        if (ForcedOutcomes.TryDequeue(out var forced) && forced != EmailSendOutcome.HandedOff)
        {
            return new EmailSendResult(forced, null, forced == EmailSendOutcome.TemporaryFailure ? "Simulierter vorübergehender Fehler" : "Simulierter dauerhafter Fehler");
        }

        var message = MimeFactory.Create(email, options);
        var captured = new CapturedEmail(Guid.NewGuid(), email.To, email.Subject, email.BodyText, email.BodyHtml, clock.GetUtcNow(),
            email.Attachments.Select(a => a.FileName).ToList(), email.IdempotencyKey);
        Messages.Enqueue(captured);
        while (Messages.Count > 500 && Messages.TryDequeue(out _))
        {
        }

        if (!string.IsNullOrWhiteSpace(options.CaptureDirectory))
        {
            Directory.CreateDirectory(options.CaptureDirectory);
            await message.WriteToAsync(Path.Combine(options.CaptureDirectory, $"{captured.CreatedAt:yyyyMMdd-HHmmss}-{captured.Id:N}.eml"), cancellationToken);
        }

        return new EmailSendResult(EmailSendOutcome.HandedOff, message.MessageId, null);
    }
}

/// <summary>Used in production when no SMTP provider is configured: every email fails permanently with a clear reason.</summary>
public sealed class DisabledEmailSender : IEmailSender
{
    public Task<EmailSendResult> SendAsync(OutgoingEmail email, CancellationToken cancellationToken) =>
        Task.FromResult(new EmailSendResult(EmailSendOutcome.PermanentFailure, null, "Kein E-Mail-Versanddienst konfiguriert."));
}
