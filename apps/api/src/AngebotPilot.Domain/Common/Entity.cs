namespace AngebotPilot.Domain.Common;

public abstract class Entity
{
    public Guid Id { get; set; }
}

/// <summary>Marks an entity that belongs to exactly one company (tenant).</summary>
public interface ICompanyOwned
{
    Guid CompanyId { get; }
}

/// <summary>
/// A business rule violation. The <see cref="Code"/> is a stable machine-readable identifier
/// returned to clients; the message is end-user text in the request language (see <see cref="Loc"/>).
/// </summary>
public sealed class DomainException : Exception
{
    public DomainException(string code, string message) : base(message)
    {
        Code = code;
    }

    public DomainException() : this("domain_error", Loc.T("Die Aktion ist nicht zulässig.", "This action is not allowed."))
    {
    }

    public DomainException(string message) : this("domain_error", message)
    {
    }

    public DomainException(string message, Exception innerException) : base(message, innerException)
    {
        Code = "domain_error";
    }

    public string Code { get; } = "domain_error";
}
