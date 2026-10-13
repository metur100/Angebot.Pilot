#!/usr/bin/env node
// Deployment smoke test for the AngebotPilot API (Node 22+, no dependencies).
//
//   node scripts/smoke-test.mjs https://angebotpilot.runasp.net [https://metur100.github.io]
//
// Creates two throw-away accounts (…@example.invalid), runs the core business flow (company → customer →
// quotation → PDF → manual send with customer link → public acceptance → job → CSV), checks tenant isolation,
// CORS and security headers, then deletes both accounts (which deletes their companies). Exit code 1 on failure.

const api = (process.argv[2] ?? 'http://localhost:5080').replace(/\/$/, '');
const webOrigin = process.argv[3] ?? 'https://metur100.github.io';
const stamp = Date.now();
const results = [];
const cleanup = [];

async function step(name, fn) {
  const started = performance.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Math.round(performance.now() - started), detail });
    console.log(`  ✔ ${name}${detail ? ` – ${detail}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) });
    console.log(`  ✘ ${name} – ${error?.message ?? error}`);
    throw error;
  }
}

async function call(method, path, { token, body, expect = [200], raw = false, headers = {} } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      'X-AngebotPilot-Client': 'mobile',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!expect.includes(response.status)) {
    const text = await response.text();
    throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 300)}`);
  }
  if (raw) return response;
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function register(label) {
  const email = `smoke-${label}-${stamp}@example.invalid`;
  const password = `Smoke-${stamp}-${Math.random().toString(36).slice(2)}9`;
  const auth = await call('POST', '/api/v1/auth/register', {
    body: { email, password, displayName: `Smoke ${label}`, acceptTerms: true, client: 'Mobile' },
    expect: [201],
  });
  cleanup.push({ token: auth.accessToken, password });
  return { email, password, token: auth.accessToken };
}

console.log(`AngebotPilot smoke test against ${api}`);
let exitCode = 0;
try {
  await step('health', async () => {
    const health = await call('GET', '/health');
    const ready = await call('GET', '/health/ready');
    assert(health.status === 'ok' && ready.status === 'ready', 'unexpected health payload');
    return `version ${health.version}`;
  });

  await step('security headers', async () => {
    const r = await call('GET', '/health', { raw: true });
    assert(r.headers.get('x-content-type-options') === 'nosniff', 'missing nosniff');
    assert(r.headers.get('x-frame-options') === 'DENY', 'missing X-Frame-Options');
    if (api.startsWith('https://')) {
      const http = await fetch(api.replace('https://', 'http://') + '/health', { redirect: 'manual' });
      assert([301, 302, 307, 308].includes(http.status), `HTTP is not redirected to HTTPS (status ${http.status})`);
    }
  });

  await step('CORS preflight for web origin', async () => {
    const r = await fetch(`${api}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: webOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-angebotpilot-client' },
    });
    assert(r.headers.get('access-control-allow-origin') === webOrigin, `origin not allowed (${r.status})`);
    const evil = await fetch(`${api}/api/v1/auth/login`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    assert(!evil.headers.get('access-control-allow-origin'), 'foreign origin allowed');
  });

  const owner = await register('owner');
  let companyId, customer, quotation, publicToken, job, invoice;

  await step('auth: register, me, invalid token rejected', async () => {
    const me = await call('GET', '/api/v1/me', { token: owner.token });
    assert(me.email === owner.email, 'me mismatch');
    await call('GET', '/api/v1/me', { token: 'invalid', expect: [401] });
  });

  await step('company + customer', async () => {
    const company = await call('POST', '/api/v1/companies', {
      token: owner.token, expect: [201],
      body: { name: `Smoke Test ${stamp}`, addressLine1: 'Teststraße 1', postalCode: '50667', city: 'Köln', country: 'DE', email: null, phone: null, vatId: null, defaultTaxMode: 'Standard', quotationPrefix: 'ST' },
    });
    companyId = company.id;
    customer = await call('POST', `/api/v1/companies/${companyId}/customers`, {
      token: owner.token, expect: [201],
      body: { type: 'Business', companyName: 'Smoke Kunde GmbH', email: null, hasServiceAddress: false, followUpOptOut: false, billingCountry: 'DE' },
    });
  });

  await step('quotation with server-side totals', async () => {
    quotation = await call('POST', `/api/v1/companies/${companyId}/quotations`, {
      token: owner.token, expect: [201],
      body: {
        customerId: customer.id, title: 'Smoke-Angebot',
        lineItems: [
          { title: 'Montage', quantity: 2.5, unit: 'Std.', unitPriceNet: 48, discountPercent: 10, taxRatePercent: 19 },
          { title: 'Material', quantity: 3, unit: 'Stk.', unitPriceNet: 19.99, discountPercent: 0, taxRatePercent: 19 },
          { title: 'Fachbuch', quantity: 1, unit: 'Stk.', unitPriceNet: 12.35, discountPercent: 0, taxRatePercent: 7 },
        ],
      },
    });
    assert(quotation.totals.grossTotal === 213.09, `gross total ${quotation.totals.grossTotal} ≠ 213.09`);
    return quotation.number;
  });

  await step('PDF generation', async () => {
    const r = await call('GET', `/api/v1/companies/${companyId}/quotations/${quotation.id}/pdf`, { token: owner.token, raw: true });
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert(r.headers.get('content-type')?.startsWith('application/pdf'), 'not a PDF');
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'invalid PDF header');
    return `${bytes.length} bytes`;
  });

  await step('send (manual) with customer link', async () => {
    const sent = await call('POST', `/api/v1/companies/${companyId}/quotations/${quotation.id}/send`, {
      token: owner.token, body: { mode: 'Manual', includePublicLink: true, scheduleFollowUps: false },
    });
    assert(sent.quotation.status === 'Sent', 'status not Sent');
    publicToken = /\/q\/([A-Za-z0-9_-]+)/.exec(sent.publicUrl)[1];
  });

  await step('public page: view + accept once', async () => {
    const view = await call('GET', `/api/v1/public/quotations/${publicToken}`);
    assert(view.canDecide && view.totals.grossTotal === 213.09, 'public view mismatch');
    assert(!JSON.stringify(view).includes(owner.email), 'public view leaks account email');
    await call('POST', `/api/v1/public/quotations/${publicToken}/accept`, { body: { fullName: 'Smoke Kunde', confirmBinding: true } });
    await call('POST', `/api/v1/public/quotations/${publicToken}/accept`, { body: { fullName: 'Again', confirmBinding: true }, expect: [409] });
    await call('GET', '/api/v1/public/quotations/this-token-does-not-exist-123456', { expect: [404] });
  });

  await step('convert to job', async () => {
    job = await call('POST', `/api/v1/companies/${companyId}/quotations/${quotation.id}/convert-to-job`, { token: owner.token, body: {} });
    assert(job.quotationId === quotation.id, 'job does not reference quotation');
    await call('POST', `/api/v1/companies/${companyId}/quotations/${quotation.id}/convert-to-job`, { token: owner.token, body: {}, expect: [409] });
    return job.number;
  });

  await step('invoice: draft from job, issue, ZUGFeRD PDF + XML', async () => {
    const c = `/api/v1/companies/${companyId}`;
    const draft = await call('POST', `${c}/jobs/${job.id}/invoice`, { token: owner.token, expect: [201] });
    assert(draft.number === null && draft.totals.grossTotal === 213.09, 'draft mismatch');
    assert(draft.issueProblems.length > 0, 'missing tax number/address not reported');
    await call('POST', `${c}/invoices/${draft.id}/issue`, { token: owner.token, expect: [409] });
    // Complete the company tax number and the customer address, then issue.
    const company = await call('GET', c, { token: owner.token });
    await call('PUT', c, { token: owner.token, body: { ...company, taxNumber: '214/5678/9012' } });
    const cust = await call('GET', `${c}/customers/${customer.id}`, { token: owner.token });
    await call('PUT', `${c}/customers/${customer.id}`, { token: owner.token, body: { ...cust, billingStreet: 'Kundenweg 2', billingPostalCode: '10115', billingCity: 'Berlin' } });
    invoice = await call('POST', `${c}/invoices/${draft.id}/issue`, { token: owner.token });
    assert(/^RE-\d{4}-0001$/.test(invoice.number) && invoice.hasEInvoice, `issue failed: ${invoice.number}`);
    const r = await call('GET', `${c}/invoices/${invoice.id}/pdf`, { token: owner.token, raw: true });
    const pdf = new TextDecoder('latin1').decode(new Uint8Array(await r.arrayBuffer()));
    assert(pdf.startsWith('%PDF-'), 'invalid PDF');
    assert(pdf.includes('factur-x.xml'), 'e-invoice not embedded in the PDF');
    assert(pdf.includes('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#'), 'Factur-X metadata missing');
    const xml = await (await call('GET', `${c}/invoices/${invoice.id}/xml`, { token: owner.token, raw: true })).text();
    assert(xml.includes('urn:cen.eu:en16931:2017') && xml.includes(invoice.number), 'e-invoice XML mismatch');
    return invoice.number;
  });

  await step('invoice: payment and cancellation', async () => {
    const c = `/api/v1/companies/${companyId}`;
    const today = new Date().toISOString().slice(0, 10);
    const paid = await call('POST', `${c}/invoices/${invoice.id}/payments`, { token: owner.token, body: { amount: invoice.openAmount, paidOn: today, method: 'Überweisung' } });
    assert(paid.status === 'Paid', `status ${paid.status}`);
    const cancelled = await call('POST', `${c}/invoices/${invoice.id}/cancel`, { token: owner.token, body: { reason: 'Smoke-Test' } });
    assert(cancelled.status === 'Cancelled' && /-0002$/.test(cancelled.cancellationInvoiceNumber), 'cancellation failed');
    return cancelled.cancellationInvoiceNumber;
  });

  await step('tenant isolation', async () => {
    const other = await register('other');
    await call('GET', `/api/v1/companies/${companyId}/quotations/${quotation.id}`, { token: other.token, expect: [404] });
    await call('GET', `/api/v1/companies/${companyId}/customers`, { token: other.token, expect: [404] });
  });

  await step('CSV export', async () => {
    const r = await call('GET', `/api/v1/companies/${companyId}/quotations/export.csv`, { token: owner.token, raw: true });
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, 'missing UTF-8 BOM');
    const text = new TextDecoder('utf-8').decode(bytes);
    assert(text.includes(quotation.number) && text.includes('Angenommen'), 'export content mismatch');
  });
} catch {
  exitCode = 1;
} finally {
  await step('cleanup: delete smoke accounts and their companies', async () => {
    for (const account of cleanup) {
      await call('POST', '/api/v1/me/delete', { token: account.token, body: { password: account.password }, expect: [204, 401] });
    }
  }).catch(() => { exitCode = 1; });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed${failed.length ? ` – FAILED: ${failed.map((f) => f.name).join(', ')}` : ''}`);
process.exit(exitCode || (failed.length ? 1 : 0));
