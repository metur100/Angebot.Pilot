using AngebotPilot.Domain.Common;

namespace AngebotPilot.Domain.Customers;

public sealed class Customer : Entity, ICompanyOwned
{
    public Guid CompanyId { get; set; }

    public CustomerType Type { get; set; }

    /// <summary>Firmenname; required for business customers.</summary>
    public string? CompanyName { get; set; }

    public string? Salutation { get; set; }

    public string? FirstName { get; set; }

    public string? LastName { get; set; }

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public string? BillingStreet { get; set; }

    public string? BillingPostalCode { get; set; }

    public string? BillingCity { get; set; }

    public string BillingCountry { get; set; } = "DE";

    public bool HasServiceAddress { get; set; }

    public string? ServiceStreet { get; set; }

    public string? ServicePostalCode { get; set; }

    public string? ServiceCity { get; set; }

    public string? ServiceCountry { get; set; }

    public string? VatId { get; set; }

    public string? Notes { get; set; }

    /// <summary>The customer asked not to receive automated reminders.</summary>
    public bool FollowUpOptOut { get; set; }

    public DateTimeOffset? FollowUpOptOutAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public DateTimeOffset? ArchivedAt { get; set; }

    /// <summary>Set when personal data was erased while quotations must be retained.</summary>
    public DateTimeOffset? AnonymizedAt { get; set; }

    public byte[] RowVersion { get; set; } = [];

    public string DisplayName
    {
        get
        {
            var person = string.Join(' ', new[] { FirstName, LastName }.Where(s => !string.IsNullOrWhiteSpace(s)));
            if (Type == CustomerType.Business && !string.IsNullOrWhiteSpace(CompanyName))
            {
                return CompanyName!;
            }

            return string.IsNullOrWhiteSpace(person) ? (CompanyName ?? Email ?? "Unbenannter Kunde") : person;
        }
    }

    public string? ContactPerson
    {
        get
        {
            var person = string.Join(' ', new[] { FirstName, LastName }.Where(s => !string.IsNullOrWhiteSpace(s)));
            return string.IsNullOrWhiteSpace(person) ? null : person;
        }
    }

    public void Anonymize(DateTimeOffset now)
    {
        CompanyName = Type == CustomerType.Business ? CompanyName : null;
        Salutation = null;
        FirstName = null;
        LastName = "Gelöschter Kunde";
        Email = null;
        Phone = null;
        BillingStreet = null;
        ServiceStreet = null;
        ServicePostalCode = null;
        ServiceCity = null;
        HasServiceAddress = false;
        Notes = null;
        VatId = null;
        AnonymizedAt = now;
        ArchivedAt ??= now;
        UpdatedAt = now;
    }
}
