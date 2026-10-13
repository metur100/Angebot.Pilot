using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AngebotPilot.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "InvoiceId",
                table: "EmailDeliveries",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceClosingText",
                table: "CompanySettings",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceIntroText",
                table: "CompanySettings",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "InvoicePaymentDays",
                table: "CompanySettings",
                type: "int",
                nullable: false,
                defaultValue: 14);

            migrationBuilder.AddColumn<string>(
                name: "InvoicePrefix",
                table: "CompanySettings",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "RE");

            migrationBuilder.AddColumn<int>(
                name: "InvoiceReminderAfterDays",
                table: "CompanySettings",
                type: "int",
                nullable: false,
                defaultValue: 7);

            migrationBuilder.AddColumn<bool>(
                name: "InvoiceReminderEnabled",
                table: "CompanySettings",
                type: "bit",
                nullable: false,
                defaultValue: false);

            // Existing companies get the same invoice texts as newly created ones.
            migrationBuilder.Sql(
                "UPDATE [CompanySettings] SET [InvoiceIntroText] = N'vielen Dank für Ihren Auftrag. Für unsere Leistungen erlauben wir uns, Folgendes in Rechnung zu stellen:', "
                + "[InvoiceClosingText] = N'Vielen Dank für die gute Zusammenarbeit.' WHERE [InvoiceIntroText] IS NULL AND [InvoiceClosingText] IS NULL;");

            migrationBuilder.CreateTable(
                name: "Invoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Number = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    IssueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ServiceDateFrom = table.Column<DateOnly>(type: "date", nullable: true),
                    ServiceDateTo = table.Column<DateOnly>(type: "date", nullable: true),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TaxMode = table.Column<int>(type: "int", nullable: false),
                    IntroText = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    ClosingText = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    PaymentTerms = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    BuyerReference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    InternalNotes = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    Currency = table.Column<string>(type: "nchar(3)", fixedLength: true, maxLength: 3, nullable: false),
                    SubtotalBeforeDiscount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    NetTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrossTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    RecipientName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RecipientContact = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    RecipientAddress = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    RecipientStreet = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    RecipientPostalCode = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: true),
                    RecipientCity = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    RecipientCountry = table.Column<string>(type: "nchar(2)", fixedLength: true, maxLength: 2, nullable: false),
                    RecipientEmail = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: true),
                    RecipientVatId = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    QuotationId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    QuotationNumber = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    JobId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    JobNumber = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    CancelledInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CancelledInvoiceNumber = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    CancelledInvoiceIssueDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CancellationInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PdfFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    XmlFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PaidAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PaidOn = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    IssuedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    IssuedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SentAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancellationReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    LastReminderAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReminderCount = table.Column<int>(type: "int", nullable: false),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Invoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Invoices_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Invoices_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InvoiceEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ActorType = table.Column<int>(type: "int", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Details = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoiceEvents_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InvoiceLineItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Quantity = table.Column<decimal>(type: "decimal(18,3)", precision: 18, scale: 3, nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    UnitPriceNet = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    TaxRatePercent = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    LineTotalBeforeDiscount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineDiscount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineNet = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceLineItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoiceLineItems_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InvoicePayments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PaidOn = table.Column<DateOnly>(type: "date", nullable: false),
                    Method = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoicePayments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoicePayments_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EmailDeliveries_InvoiceId",
                table: "EmailDeliveries",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceEvents_InvoiceId_OccurredAt",
                table: "InvoiceEvents",
                columns: new[] { "InvoiceId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLineItems_InvoiceId_Position",
                table: "InvoiceLineItems",
                columns: new[] { "InvoiceId", "Position" });

            migrationBuilder.CreateIndex(
                name: "IX_InvoicePayments_CompanyId_PaidOn",
                table: "InvoicePayments",
                columns: new[] { "CompanyId", "PaidOn" });

            migrationBuilder.CreateIndex(
                name: "IX_InvoicePayments_InvoiceId",
                table: "InvoicePayments",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_CancelledInvoiceId",
                table: "Invoices",
                column: "CancelledInvoiceId",
                unique: true,
                filter: "[CancelledInvoiceId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_CompanyId_CustomerId",
                table: "Invoices",
                columns: new[] { "CompanyId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_CompanyId_IssueDate",
                table: "Invoices",
                columns: new[] { "CompanyId", "IssueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_CompanyId_Number",
                table: "Invoices",
                columns: new[] { "CompanyId", "Number" },
                unique: true,
                filter: "[Number] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_CompanyId_Status_DueDate",
                table: "Invoices",
                columns: new[] { "CompanyId", "Status", "DueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_CustomerId",
                table: "Invoices",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_JobId",
                table: "Invoices",
                column: "JobId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_QuotationId",
                table: "Invoices",
                column: "QuotationId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvoiceEvents");

            migrationBuilder.DropTable(
                name: "InvoiceLineItems");

            migrationBuilder.DropTable(
                name: "InvoicePayments");

            migrationBuilder.DropTable(
                name: "Invoices");

            migrationBuilder.DropIndex(
                name: "IX_EmailDeliveries_InvoiceId",
                table: "EmailDeliveries");

            migrationBuilder.DropColumn(
                name: "InvoiceId",
                table: "EmailDeliveries");

            migrationBuilder.DropColumn(
                name: "InvoiceClosingText",
                table: "CompanySettings");

            migrationBuilder.DropColumn(
                name: "InvoiceIntroText",
                table: "CompanySettings");

            migrationBuilder.DropColumn(
                name: "InvoicePaymentDays",
                table: "CompanySettings");

            migrationBuilder.DropColumn(
                name: "InvoicePrefix",
                table: "CompanySettings");

            migrationBuilder.DropColumn(
                name: "InvoiceReminderAfterDays",
                table: "CompanySettings");

            migrationBuilder.DropColumn(
                name: "InvoiceReminderEnabled",
                table: "CompanySettings");
        }
    }
}
