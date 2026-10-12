using System.Security.Cryptography;
using AngebotPilot.Application.Abstractions;
using AngebotPilot.Application.Common;
using AngebotPilot.Domain;
using AngebotPilot.Domain.Files;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.EntityFrameworkCore;

namespace AngebotPilot.Application.Files;

public sealed record UploadedFile(string FileName, string DeclaredContentType, long Length, Func<Stream> OpenReadStream);

/// <summary>
/// Stores files privately. The object key is generated server-side; uploaded file names are only used
/// (sanitised) as download names. Content type is determined from the file signature, not from the client.
/// </summary>
public sealed class FileService(IAppDbContext db, IFileStorageService storage, TimeProvider clock)
{
    public const long MaxLogoBytes = 1024 * 1024;

    private static readonly Dictionary<string, (string ContentType, byte[][] Signatures)> LogoTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = ("image/png", [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]]),
        [".jpg"] = ("image/jpeg", [[0xFF, 0xD8, 0xFF]]),
        [".jpeg"] = ("image/jpeg", [[0xFF, 0xD8, 0xFF]]),
    };

    public async Task<StoredFile> SaveLogoAsync(Guid companyId, Guid userId, UploadedFile upload, CancellationToken ct)
    {
        if (upload.Length <= 0)
        {
            throw Invalid("Die Datei ist leer.");
        }

        if (upload.Length > MaxLogoBytes)
        {
            throw Invalid("Das Logo darf höchstens 1 MB groß sein.");
        }

        var extension = Path.GetExtension(upload.FileName);
        if (!LogoTypes.TryGetValue(extension, out var type))
        {
            throw Invalid("Erlaubt sind PNG- oder JPEG-Dateien.");
        }

        using var buffer = new MemoryStream();
        await using (var input = upload.OpenReadStream())
        {
            await input.CopyToAsync(buffer, ct);
        }

        if (buffer.Length > MaxLogoBytes)
        {
            throw Invalid("Das Logo darf höchstens 1 MB groß sein.");
        }

        var bytes = buffer.ToArray();
        if (!type.Signatures.Any(sig => bytes.AsSpan().StartsWith(sig)))
        {
            throw Invalid("Der Dateiinhalt passt nicht zum Dateityp. Bitte laden Sie ein gültiges PNG- oder JPEG-Bild hoch.");
        }

        return await StoreAsync(companyId, userId, FilePurpose.CompanyLogo, $"logo{extension.ToLowerInvariant()}", type.ContentType, bytes, ct);
    }

    public Task<StoredFile> SavePdfAsync(Guid companyId, Guid? userId, string fileName, byte[] content, CancellationToken ct) =>
        StoreAsync(companyId, userId, FilePurpose.QuotationPdf, fileName, "application/pdf", content, ct);

    public async Task<(StoredFile File, StoredObject Content)?> OpenAsync(Guid companyId, Guid fileId, CancellationToken ct)
    {
        var file = await db.Files.IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.Id == fileId && f.CompanyId == companyId && f.Status == FileStatus.Active, ct);
        if (file is null)
        {
            return null;
        }

        var content = await storage.GetAsync(file.ObjectKey, ct);
        return content is null ? null : (file, content);
    }

    public async Task<byte[]?> ReadAllAsync(Guid companyId, Guid fileId, CancellationToken ct)
    {
        var opened = await OpenAsync(companyId, fileId, ct);
        if (opened is null)
        {
            return null;
        }

        await using var stream = opened.Value.Content.Content;
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms, ct);
        return ms.ToArray();
    }

    /// <summary>Marks a file as deleted and removes the object. Metadata is kept for the audit trail.</summary>
    public async Task DeleteAsync(Guid companyId, Guid fileId, CancellationToken ct)
    {
        var file = await db.Files.IgnoreQueryFilters().FirstOrDefaultAsync(f => f.Id == fileId && f.CompanyId == companyId, ct);
        if (file is null || file.Status == FileStatus.Deleted)
        {
            return;
        }

        file.Status = FileStatus.Deleted;
        file.DeletedAt = clock.GetUtcNow();
        await storage.DeleteAsync(file.ObjectKey, ct);
    }

    public static string SafeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars().Concat(['"', '\'', ';']).ToHashSet();
        var cleaned = new string(name.Select(c => invalid.Contains(c) || char.IsControl(c) ? '_' : c).ToArray()).Trim();
        if (cleaned.Length > 120)
        {
            cleaned = cleaned[..120];
        }

        return string.IsNullOrWhiteSpace(cleaned) ? "datei" : cleaned;
    }

    private async Task<StoredFile> StoreAsync(Guid companyId, Guid? userId, FilePurpose purpose, string fileName, string contentType, byte[] content, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        var folder = purpose == FilePurpose.CompanyLogo ? "logos" : "documents";
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var file = new StoredFile
        {
            Id = id,
            CompanyId = companyId,
            Purpose = purpose,
            ObjectKey = $"companies/{companyId:N}/{folder}/{id:N}{ext}",
            FileName = SafeFileName(fileName),
            ContentType = contentType,
            SizeBytes = content.LongLength,
            Sha256 = Convert.ToHexString(SHA256.HashData(content)),
            Status = FileStatus.Pending,
            CreatedAt = clock.GetUtcNow(),
            CreatedByUserId = userId,
        };

        // Metadata is written as Pending first, so an upload that succeeds while the database save fails is
        // detected and removed by orphan cleanup.
        db.Files.Add(file);
        await db.SaveChangesAsync(ct);
        using (var ms = new MemoryStream(content, writable: false))
        {
            await storage.PutAsync(file.ObjectKey, ms, contentType, ct);
        }

        file.Status = FileStatus.Active;
        return file;
    }

    private static ValidationException Invalid(string message) => new([new ValidationFailure("file", message)]);
}
