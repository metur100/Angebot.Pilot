using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using AngebotPilot.Application.Contracts;
using AngebotPilot.Domain;
using AngebotPilot.IntegrationTests.Infrastructure;

namespace AngebotPilot.IntegrationTests;

[Collection(ApiCollection.Name)]
public class AuthTests(ApiFactory api)
{
    [Fact]
    public async Task Register_login_me_and_wrong_password()
    {
        var user = await api.RegisterAsync("Ana Beispiel");
        var me = await user.GetAsync<MeDto>("/api/v1/me");
        Assert.Equal("Ana Beispiel", me.DisplayName);
        Assert.True(me.EmailVerified);
        Assert.Empty(me.Companies);

        var anonymous = api.CreateClient();
        var ok = await anonymous.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(user.Email, "Sicheres-Passwort-1", ClientKind.Mobile), ApiFactory.Json);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.NotNull((await ok.Content.ReadFromJsonAsync<AuthResponse>(ApiFactory.Json))!.RefreshToken);

        var wrong = await anonymous.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(user.Email, "falsch-1234567", ClientKind.Web), ApiFactory.Json);
        await ProblemAssert.HasAsync(wrong, HttpStatusCode.Unauthorized, "invalid_credentials");
        var unknown = await anonymous.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest("nobody@test.example", "falsch-1234567", ClientKind.Web), ApiFactory.Json);
        await ProblemAssert.HasAsync(unknown, HttpStatusCode.Unauthorized, "invalid_credentials");
    }

    [Fact]
    public async Task Duplicate_registration_and_weak_password_are_rejected()
    {
        var user = await api.RegisterAsync(verify: false);
        var client = api.CreateClient();
        var dup = await client.PostAsJsonAsync("/api/v1/auth/register", new RegisterRequest(user.Email.ToUpperInvariant(), "Sicheres-Passwort-1", "X", true), ApiFactory.Json);
        await ProblemAssert.HasAsync(dup, HttpStatusCode.Conflict, "email_taken");
        var weak = await client.PostAsJsonAsync("/api/v1/auth/register", new RegisterRequest("new@test.example", "kurz", "X", true), ApiFactory.Json);
        await ProblemAssert.HasAsync(weak, HttpStatusCode.BadRequest, "validation_failed");
        Assert.Contains("\"password\"", await weak.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Account_is_locked_after_repeated_failures()
    {
        var user = await api.RegisterAsync(verify: false);
        var client = api.CreateClient();
        for (var i = 0; i < 5; i++)
        {
            await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(user.Email, "falsch-1234567"), ApiFactory.Json);
        }

        var locked = await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(user.Email, "Sicheres-Passwort-1"), ApiFactory.Json);
        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);
        Assert.Contains("Zu viele", await locked.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Refresh_rotates_tokens_and_reuse_revokes_the_family()
    {
        var user = await api.RegisterAsync(verify: false);
        var client = api.CreateClient();
        var first = await client.PostAsJsonAsync("/api/v1/auth/refresh", new RefreshRequest(user.RefreshToken), ApiFactory.Json);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var rotated = (await first.Content.ReadFromJsonAsync<AuthResponse>(ApiFactory.Json))!.RefreshToken!;
        Assert.NotEqual(user.RefreshToken, rotated);

        // Replaying the old token after the grace window (e.g. stolen) revokes every token of the session.
        api.Clock.Advance(Application.Auth.AuthService.RotationGracePeriod + TimeSpan.FromSeconds(1));
        var replay = await client.PostAsJsonAsync("/api/v1/auth/refresh", new RefreshRequest(user.RefreshToken), ApiFactory.Json);
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        var afterReuse = await client.PostAsJsonAsync("/api/v1/auth/refresh", new RefreshRequest(rotated), ApiFactory.Json);
        Assert.Equal(HttpStatusCode.Unauthorized, afterReuse.StatusCode);
    }

    [Fact]
    public async Task Parallel_tab_refresh_within_grace_window_does_not_log_out()
    {
        var user = await api.RegisterAsync(verify: false);
        var client = api.CreateClient();
        var first = await client.PostAsJsonAsync("/api/v1/auth/refresh", new RefreshRequest(user.RefreshToken), ApiFactory.Json);
        var rotated = (await first.Content.ReadFromJsonAsync<AuthResponse>(ApiFactory.Json))!.RefreshToken!;

        // A second tab still holds the old token: rejected, but the session survives.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new RefreshRequest(user.RefreshToken), ApiFactory.Json)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new RefreshRequest(rotated), ApiFactory.Json)).StatusCode);
    }

    [Fact]
    public async Task Logout_revokes_refresh_token_and_protected_endpoints_need_a_token()
    {
        var user = await api.RegisterAsync(verify: false);
        var client = api.CreateClient();
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/logout", new LogoutRequest(user.RefreshToken), ApiFactory.Json)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new RefreshRequest(user.RefreshToken), ApiFactory.Json)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me")).StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/me")).StatusCode);
    }

    [Fact]
    public async Task Password_reset_via_emailed_single_use_token()
    {
        var user = await api.RegisterAsync(verify: false);
        var client = api.CreateClient();
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new ForgotPasswordRequest(user.Email), ApiFactory.Json)).StatusCode);
        // Unknown addresses get the same response (no account enumeration).
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new ForgotPasswordRequest("unknown@test.example"), ApiFactory.Json)).StatusCode);
        await api.RunJobsAsync();
        var token = ApiFactory.ExtractToken(ApiFactory.EmailsTo(user.Email).Last(m => m.Subject.StartsWith("Passwort", StringComparison.Ordinal)).BodyText, "reset-password?token=");

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/reset-password", new ResetPasswordRequest(token, "Neues-Passwort-22"), ApiFactory.Json)).StatusCode);
        Assert.Equal(HttpStatusCode.Gone, (await client.PostAsJsonAsync("/api/v1/auth/reset-password", new ResetPasswordRequest(token, "Anderes-Passwort-3"), ApiFactory.Json)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new RefreshRequest(user.RefreshToken), ApiFactory.Json)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(user.Email, "Neues-Passwort-22"), ApiFactory.Json)).StatusCode);
    }

    [Fact]
    public async Task Account_export_and_deletion_removes_sole_member_company()
    {
        var user = await api.RegisterAsync();
        var company = await user.CreateCompanyAsync("Löschfirma");
        await user.CreateCustomerAsync();
        var export = await user.RawGetAsync("/api/v1/me/export");
        Assert.Equal(HttpStatusCode.OK, export.StatusCode);
        Assert.Contains(user.Email, await export.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var wrong = await user.RawPostAsync("/api/v1/me/delete", new DeleteAccountRequest("falsch"));
        await ProblemAssert.HasAsync(wrong, HttpStatusCode.BadRequest, "validation_failed");
        Assert.Equal(HttpStatusCode.NoContent, (await user.RawPostAsync("/api/v1/me/delete", new DeleteAccountRequest("Sicheres-Passwort-1"))).StatusCode);
        Assert.Equal(0, await api.CountAsync<Domain.Companies.Company>(q => q.Where(c => c.Id == company.Id)));
        Assert.Equal(0, await api.CountAsync<Domain.Customers.Customer>(q => q.Where(c => c.CompanyId == company.Id)));
        Assert.Equal(0, await api.CountAsync<Domain.Users.User>(q => q.Where(u => u.Id == user.UserId)));
    }
}

[Collection(ApiCollection.Name)]
public class CompanyAndTeamTests(ApiFactory api)
{
    [Fact]
    public async Task Creating_a_company_makes_the_user_owner_with_defaults()
    {
        var user = await api.RegisterAsync();
        var company = await user.CreateCompanyAsync("Elektro Größe & Söhne");
        Assert.Equal(MembershipRole.Owner, company.MyRole);
        var me = await user.GetAsync<MeDto>("/api/v1/me");
        Assert.Equal(company.Id, Assert.Single(me.Companies).CompanyId);
        var rates = await user.GetAsync<List<TaxRateDto>>($"{user.C}/tax-rates");
        Assert.Contains(rates, r => r.RatePercent == 19m && r.IsDefault);
        Assert.Contains(rates, r => r.RatePercent == 7m);
        var settings = await user.GetAsync<CompanySettingsDto>($"{user.C}/settings");
        Assert.Equal("AN", settings.QuotationPrefix);
        var sub = await user.GetAsync<SubscriptionDto>($"{user.C}/subscription");
        Assert.Equal(SubscriptionStatus.Trialing, sub.Status);
        Assert.True(sub.HasFullAccess);
        Assert.Equal("mock", sub.Provider);
        Assert.False(sub.ProviderIsLive);
    }

    [Fact]
    public async Task Settings_are_validated()
    {
        var user = await api.RegisterAsync();
        await user.CreateCompanyAsync();
        var settings = await user.GetAsync<CompanySettingsDto>($"{user.C}/settings");
        var invalid = await user.RawPutAsync($"{user.C}/settings", settings with { Iban = "DE00123", ShowBankDetails = true, QuotationPrefix = "a b" });
        await ProblemAssert.HasAsync(invalid, HttpStatusCode.BadRequest, "validation_failed");
        var body = await invalid.Content.ReadAsStringAsync();
        Assert.Contains("\"iban\"", body, StringComparison.Ordinal);
        Assert.Contains("\"quotationPrefix\"", body, StringComparison.Ordinal);
        var saved = await user.PutAsync<CompanySettingsDto>($"{user.C}/settings", settings with { Iban = "DE89 3704 0044 0532 0130 00", ShowBankDetails = true, DefaultValidityDays = 14 });
        Assert.Equal("DE89370400440532013000", saved.Iban);
        Assert.Equal(14, saved.DefaultValidityDays);
    }

    [Fact]
    public async Task Invitation_flow_and_role_enforcement()
    {
        var owner = await api.RegisterAsync();
        await owner.CreateCompanyAsync("Teamfirma");
        var employee = await api.RegisterAsync();
        await owner.PostAsync<InvitationDto>($"{owner.C}/invitations", new CreateInvitationRequest(employee.Email, MembershipRole.Employee));
        await api.RunJobsAsync();
        var token = ApiFactory.ExtractToken(ApiFactory.EmailsTo(employee.Email).Last(m => m.Subject.StartsWith("Einladung", StringComparison.Ordinal)).BodyText, "invite?token=");

        // Someone else cannot use the invitation.
        var stranger = await api.RegisterAsync();
        await ProblemAssert.HasAsync(await stranger.RawPostAsync("/api/v1/invitations/accept", new AcceptInvitationRequest(token)), HttpStatusCode.Forbidden);

        var preview = await api.CreateClient().GetFromJsonAsync<InvitationPreviewDto>($"/api/v1/invitations/{token}", ApiFactory.Json);
        Assert.Equal("Teamfirma", preview!.CompanyName);
        var me = await employee.PostAsync<MeDto>("/api/v1/invitations/accept", new AcceptInvitationRequest(token));
        employee.UseCompany(Assert.Single(me.Companies).CompanyId);

        // Employees work with customers but cannot change settings, team or export data.
        await employee.CreateCustomerAsync();
        var settings = await owner.GetAsync<CompanySettingsDto>($"{owner.C}/settings");
        await ProblemAssert.HasAsync(await employee.RawPutAsync($"{employee.C}/settings", settings), HttpStatusCode.Forbidden);
        await ProblemAssert.HasAsync(await employee.RawPostAsync($"{employee.C}/invitations", new CreateInvitationRequest("x@test.example", MembershipRole.Employee)), HttpStatusCode.Forbidden);
        await ProblemAssert.HasAsync(await employee.RawGetAsync($"{employee.C}/customers/export.csv"), HttpStatusCode.Forbidden);
        await ProblemAssert.HasAsync(await employee.RawGetAsync($"{employee.C}/export"), HttpStatusCode.Forbidden);

        // Deactivation removes access immediately.
        var members = await owner.GetAsync<List<MemberDto>>($"{owner.C}/members");
        var membership = members.Single(m => m.UserId == employee.UserId);
        await owner.PostAsync<MemberDto>($"{owner.C}/members/{membership.MembershipId}/deactivate");
        await ProblemAssert.HasAsync(await employee.RawGetAsync($"{employee.C}/customers"), HttpStatusCode.NotFound);
        await owner.PostAsync<MemberDto>($"{owner.C}/members/{membership.MembershipId}/reactivate");
        Assert.Equal(HttpStatusCode.OK, (await employee.RawGetAsync($"{employee.C}/customers")).StatusCode);
    }

    [Fact]
    public async Task Undefined_or_numeric_roles_are_rejected()
    {
        var owner = await api.RegisterAsync();
        await owner.CreateCompanyAsync();
        var admin = await api.RegisterAsync();
        await owner.PostAsync<InvitationDto>($"{owner.C}/invitations", new CreateInvitationRequest(admin.Email, MembershipRole.Admin));
        await api.RunJobsAsync();
        var token = ApiFactory.ExtractToken(ApiFactory.EmailsTo(admin.Email).Last(m => m.Subject.StartsWith("Einladung", StringComparison.Ordinal)).BodyText, "invite?token=");
        var me = await admin.PostAsync<MeDto>("/api/v1/invitations/accept", new AcceptInvitationRequest(token));
        admin.UseCompany(me.Companies.Single().CompanyId);
        var self = (await admin.GetAsync<List<MemberDto>>($"{admin.C}/members")).Single(m => m.UserId == admin.UserId);

        // Privilege escalation attempts: numeric enum values and undefined names.
        foreach (var body in new[] { "{\"role\":3}", "{\"role\":99}", "{\"role\":\"SuperOwner\"}" })
        {
            using var content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
            var response = await admin.Client.PatchAsync($"{admin.C}/members/{self.MembershipId}", content);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        Assert.Equal(MembershipRole.Admin, (await admin.GetAsync<List<MemberDto>>($"{admin.C}/members")).Single(m => m.UserId == admin.UserId).Role);
        await ProblemAssert.HasAsync(await admin.RawGetAsync($"{admin.C}/export"), HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Last_owner_cannot_be_demoted_or_deactivated()
    {
        var owner = await api.RegisterAsync();
        await owner.CreateCompanyAsync();
        var members = await owner.GetAsync<List<MemberDto>>($"{owner.C}/members");
        var self = Assert.Single(members);
        var response = await owner.Client.PatchAsJsonAsync($"{owner.C}/members/{self.MembershipId}", new UpdateMemberRequest(MembershipRole.Admin), ApiFactory.Json);
        await ProblemAssert.HasAsync(response, HttpStatusCode.Conflict, "last_owner");
        await ProblemAssert.HasAsync(await owner.RawPostAsync($"{owner.C}/members/{self.MembershipId}/deactivate"), HttpStatusCode.Conflict, "cannot_deactivate_self");
    }

    [Fact]
    public async Task Trial_limits_members_and_expired_trial_is_read_only()
    {
        var owner = await api.RegisterAsync();
        var company = await owner.CreateCompanyAsync();
        // Trial allows 3 active members including open invitations.
        await owner.PostAsync<InvitationDto>($"{owner.C}/invitations", new CreateInvitationRequest("a@test.example", MembershipRole.Employee));
        await owner.PostAsync<InvitationDto>($"{owner.C}/invitations", new CreateInvitationRequest("b@test.example", MembershipRole.Employee));
        await ProblemAssert.HasAsync(await owner.RawPostAsync($"{owner.C}/invitations", new CreateInvitationRequest("c@test.example", MembershipRole.Employee)), HttpStatusCode.PaymentRequired, "member_limit");

        await api.WithDbAsync(async db =>
        {
            var sub = db.Subscriptions.Single(s => s.CompanyId == company.Id);
            sub.TrialEndsAt = api.Clock.GetUtcNow().AddMinutes(-1);
            return await db.SaveChangesAsync();
        });
        await ProblemAssert.HasAsync(await owner.RawPostAsync($"{owner.C}/customers", new UpsertCustomerRequest(CustomerType.Private, null, null, null, "X", null, null, null, null, null, null, false, null, null, null, null, null, null, false, null)),
            HttpStatusCode.PaymentRequired, "subscription_inactive");
        Assert.Equal(HttpStatusCode.OK, (await owner.RawGetAsync($"{owner.C}/customers")).StatusCode);

        // The mock provider applies a signed webhook; afterwards the company can write again.
        var change = await owner.PostAsync<ChangePlanResponse>($"{owner.C}/subscription/change-plan", new ChangePlanRequest(SubscriptionPlan.Team));
        Assert.True(change.ActivatedImmediately);
        Assert.Equal(SubscriptionPlan.Team, change.Subscription.Plan);
        Assert.Equal(SubscriptionStatus.Active, change.Subscription.Status);
        Assert.True(change.Subscription.HasFullAccess);
    }

    [Fact]
    public async Task Billing_webhook_rejects_invalid_signature()
    {
        var client = api.CreateClient();
        using var content = new StringContent("{\"Id\":\"evt\",\"Type\":\"subscription.activated\"}");
        content.Headers.Add("X-Mock-Signature", "00ff");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/v1/billing/webhooks/mock", content)).StatusCode);
    }

    [Fact]
    public async Task Logo_upload_validates_content_and_is_private()
    {
        var owner = await api.RegisterAsync();
        await owner.CreateCompanyAsync();
        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

        var ok = await Upload(owner, "logo.png", "image/png", png);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.True((await ok.Content.ReadFromJsonAsync<CompanyDto>(ApiFactory.Json))!.HasLogo);
        var logo = await owner.RawGetAsync($"{owner.C}/logo");
        Assert.Equal("image/png", logo.Content.Headers.ContentType!.MediaType);
        Assert.Equal(png, await logo.Content.ReadAsByteArrayAsync());

        await ProblemAssert.HasAsync(await Upload(owner, "logo.png", "image/png", "<svg onload=alert(1)>"u8.ToArray()), HttpStatusCode.BadRequest, "validation_failed");
        await ProblemAssert.HasAsync(await Upload(owner, "logo.svg", "image/svg+xml", "<svg/>"u8.ToArray()), HttpStatusCode.BadRequest, "validation_failed");
        await ProblemAssert.HasAsync(await Upload(owner, "big.png", "image/png", [.. png, .. new byte[1024 * 1024]]), HttpStatusCode.BadRequest, "validation_failed");

        var other = await api.RegisterAsync();
        await other.CreateCompanyAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await other.RawGetAsync($"{owner.C}/logo")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.CreateClient().GetAsync($"{owner.C}/logo")).StatusCode);
    }

    private static async Task<HttpResponseMessage> Upload(TestUser user, string name, string type, byte[] data)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(data);
        file.Headers.ContentType = new MediaTypeHeaderValue(type);
        form.Add(file, "file", name);
        return await user.Client.PutAsync($"{user.C}/logo", form);
    }
}
