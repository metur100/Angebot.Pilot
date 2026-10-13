import { customerTypeLabel, type CustomerDto } from '@angebotpilot/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, BellOff, FileText, Hammer, Mail, MoreHorizontal, Pencil, Phone, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCompany } from '@/app/company';
import { Badge, InvoiceStatusBadge, JobStatusBadge, QuotationStatusBadge } from '@/components/ui/Badge';
import { ButtonLink, IconButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, DetailList } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Alert, EmptyState, ErrorState, PageSkeleton, Spinner } from '@/components/ui/Feedback';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu';
import { PageHeader, table } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { invoiceAmount } from '@/features/invoices/shared';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatEur } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { ADMIN_ONLY_HINT } from '@/lib/roles';
import { formatAddress } from './CustomerForm';

function contactName(c: CustomerDto) {
  return [c.salutation, c.firstName, c.lastName].filter(Boolean).join(' ') || null;
}

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { companyId, can } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const customer = useQuery({ queryKey: qk.customer(companyId, id), queryFn: () => api.customers.get(companyId, id) });
  const quotations = useQuery({ queryKey: qk.customerQuotations(companyId, id), queryFn: () => api.customers.quotations(companyId, id) });
  const jobs = useQuery({ queryKey: qk.customerJobs(companyId, id), queryFn: () => api.customers.jobs(companyId, id) });
  const invoices = useQuery({ queryKey: qk.customerInvoices(companyId, id), queryFn: () => api.customers.invoices(companyId, id) });

  const archive = useMutation({
    mutationFn: (archived: boolean) => (archived ? api.customers.archive(companyId, id) : api.customers.unarchive(companyId, id)),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.customer(companyId, id), updated);
      void queryClient.invalidateQueries({ queryKey: qk.customers(companyId) });
      toast.success(updated.isArchived ? 'Kunde archiviert' : 'Kunde wiederhergestellt');
    },
    onError: (error) => toast.error('Aktion fehlgeschlagen', errorMessage(error)),
  });

  if (customer.isPending) return <PageSkeleton />;
  if (customer.isError) return <ErrorState error={customer.error} onRetry={() => void customer.refetch()} />;
  const c = customer.data;
  const billing = formatAddress(c.billingStreet, c.billingPostalCode, c.billingCity, c.billingCountry);
  const service = c.hasServiceAddress ? formatAddress(c.serviceStreet, c.servicePostalCode, c.serviceCity, c.serviceCountry) : null;

  return (
    <>
      <PageHeader
        title={c.displayName}
        back={{ to: '/kunden', label: 'Kunden' }}
        meta={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{customerTypeLabel[c.type]}</Badge>
            {c.isArchived && <Badge tone="muted" icon={Archive}>Archiviert</Badge>}
            {c.isAnonymized && <Badge tone="warning">Anonymisiert</Badge>}
            {c.followUpOptOut && <Badge tone="muted" icon={BellOff}>Keine Erinnerungen</Badge>}
          </div>
        }
        actions={
          <>
            {!c.isAnonymized && (
              <ButtonLink to={`/kunden/${c.id}/bearbeiten`} icon={Pencil}>
                Bearbeiten
              </ButtonLink>
            )}
            {!c.isArchived && !c.isAnonymized && (
              <ButtonLink to={`/angebote/neu?kunde=${c.id}`} variant="primary" icon={Plus}>
                Neues Angebot
              </ButtonLink>
            )}
            <Menu>
              <MenuTrigger asChild>
                <IconButton icon={MoreHorizontal} label="Weitere Aktionen" variant="secondary" />
              </MenuTrigger>
              <MenuContent>
                {c.isArchived ? (
                  <MenuItem icon={ArchiveRestore} onSelect={() => archive.mutate(false)}>
                    Wiederherstellen
                  </MenuItem>
                ) : (
                  <MenuItem icon={Archive} onSelect={() => archive.mutate(true)} description="Ausblenden, Daten bleiben erhalten">
                    Archivieren
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem
                  icon={Trash2}
                  danger
                  disabled={!can.deleteCustomers || c.isAnonymized}
                  description={!can.deleteCustomers ? ADMIN_ONLY_HINT : undefined}
                  onSelect={() => setConfirmDelete(true)}
                >
                  Löschen …
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      {c.isAnonymized && (
        <Alert tone="warning" className="mb-6" title="Personenbezogene Daten wurden entfernt">
          Dieser Kunde wurde anonymisiert. Seine Angebote, Aufträge und Rechnungen bleiben aufgrund von Aufbewahrungspflichten erhalten.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Kontaktdaten" />
            <CardBody>
              <DetailList
                items={[
                  ...(c.type === 'Business' ? [{ label: 'Ansprechpartner', value: contactName(c) }] : []),
                  {
                    label: 'E-Mail',
                    value: c.email && (
                      <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
                        <Mail aria-hidden size={14} />
                        {c.email}
                      </a>
                    ),
                  },
                  {
                    label: 'Telefon',
                    value: c.phone && (
                      <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
                        <Phone aria-hidden size={14} />
                        {c.phone}
                      </a>
                    ),
                  },
                  { label: 'Rechnungsadresse', value: billing && <span className="whitespace-pre-line">{billing}</span> },
                  ...(service ? [{ label: 'Leistungsadresse', value: <span className="whitespace-pre-line">{service}</span> }] : []),
                  ...(c.type === 'Business' ? [{ label: 'USt-IdNr.', value: c.vatId }] : []),
                  { label: 'Angelegt', value: formatDateTime(c.createdAt) },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Notizen" description="Nur intern sichtbar" />
            <CardBody>
              {c.notes ? (
                <p className="text-sm whitespace-pre-line text-neutral-800">{c.notes}</p>
              ) : (
                <p className="text-sm text-neutral-500">Keine Notizen.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Angebote"
              actions={
                !c.isArchived &&
                !c.isAnonymized && (
                  <ButtonLink to={`/angebote/neu?kunde=${c.id}`} size="sm" icon={Plus}>
                    Angebot
                  </ButtonLink>
                )
              }
            />
            {quotations.isPending ? (
              <div className="p-5">
                <Spinner />
              </div>
            ) : quotations.isError ? (
              <ErrorState error={quotations.error} onRetry={() => void quotations.refetch()} />
            ) : quotations.data.length === 0 ? (
              <EmptyState compact icon={FileText} title="Noch keine Angebote" description="Erstellen Sie das erste Angebot für diesen Kunden." />
            ) : (
              <div className={table.wrapper}>
                <table className={table.table}>
                  <thead>
                    <tr>
                      <th scope="col" className={table.th}>Nummer</th>
                      <th scope="col" className={table.th}>Betreff</th>
                      <th scope="col" className={table.th}>Status</th>
                      <th scope="col" className={cx(table.th, 'text-right')}>Datum</th>
                      <th scope="col" className={cx(table.th, 'text-right')}>Brutto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotations.data.map((q) => (
                      <tr key={q.id} className={table.row}>
                        <td className={cx(table.td, 'whitespace-nowrap')}>
                          <Link to={`/angebote/${q.id}`} className="font-medium text-neutral-900 hover:text-brand-700 hover:underline">
                            {q.number}
                          </Link>
                        </td>
                        <td className={cx(table.td, 'max-w-[240px] truncate')}>{q.title}</td>
                        <td className={table.td}>
                          <QuotationStatusBadge status={q.status} />
                        </td>
                        <td className={cx(table.td, table.num)}>{formatDate(q.issueDate)}</td>
                        <td className={cx(table.td, table.num, 'font-medium')}>{formatEur(q.grossTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Aufträge" />
            {jobs.isPending ? (
              <div className="p-5">
                <Spinner />
              </div>
            ) : jobs.isError ? (
              <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />
            ) : jobs.data.length === 0 ? (
              <EmptyState compact icon={Hammer} title="Noch keine Aufträge" description="Angenommene Angebote können Sie in Aufträge umwandeln." />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {jobs.data.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link to={`/auftraege/${j.id}`} className="font-medium text-neutral-900 hover:text-brand-700 hover:underline">
                        {j.number} · {j.title}
                      </Link>
                      <p className="text-[13px] text-neutral-500">
                        aus {j.quotationNumber}
                        {j.dueDate ? ` · fällig ${formatDate(j.dueDate)}` : ''}
                      </p>
                    </div>
                    <JobStatusBadge status={j.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Rechnungen"
              description={
                invoices.data && invoices.data.some((i) => i.openAmount > 0)
                  ? `Offen: ${formatEur(invoices.data.reduce((sum, i) => sum + i.openAmount, 0))}`
                  : undefined
              }
              actions={
                !c.isArchived &&
                !c.isAnonymized && (
                  <ButtonLink to={`/rechnungen/neu?kunde=${c.id}`} size="sm" icon={Plus}>
                    Neue Rechnung
                  </ButtonLink>
                )
              }
            />
            {invoices.isPending ? (
              <div className="p-5">
                <Spinner />
              </div>
            ) : invoices.isError ? (
              <ErrorState error={invoices.error} onRetry={() => void invoices.refetch()} />
            ) : invoices.data.length === 0 ? (
              <EmptyState
                compact
                icon={ReceiptText}
                title="Noch keine Rechnungen"
                description="Erstellen Sie eine Rechnung manuell oder aus einem Auftrag bzw. angenommenen Angebot dieses Kunden."
              />
            ) : (
              <div className={table.wrapper}>
                <table className={table.table}>
                  <thead>
                    <tr>
                      <th scope="col" className={table.th}>Nummer</th>
                      <th scope="col" className={table.th}>Betreff</th>
                      <th scope="col" className={table.th}>Status</th>
                      <th scope="col" className={cx(table.th, 'text-right')}>Datum</th>
                      <th scope="col" className={cx(table.th, 'text-right')}>Brutto</th>
                      <th scope="col" className={cx(table.th, 'text-right')}>Offen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.data.map((i) => (
                      <tr key={i.id} className={table.row}>
                        <td className={cx(table.td, 'whitespace-nowrap')}>
                          <Link
                            to={`/rechnungen/${i.id}`}
                            className={cx('font-medium hover:text-brand-700 hover:underline', i.number ? 'text-neutral-900' : 'text-neutral-500 italic')}
                          >
                            {i.number ?? 'Entwurf'}
                          </Link>
                        </td>
                        <td className={cx(table.td, 'max-w-[220px] truncate')}>{i.title}</td>
                        <td className={table.td}>
                          <InvoiceStatusBadge status={i.status} kind={i.kind} isOverdue={i.isOverdue} />
                        </td>
                        <td className={cx(table.td, table.num)}>{formatDate(i.issueDate)}</td>
                        <td className={cx(table.td, table.num, 'font-medium')}>{invoiceAmount(i.grossTotal, i.kind)}</td>
                        <td className={cx(table.td, table.num, i.isOverdue ? 'font-medium text-danger-text' : 'text-neutral-600')}>
                          {i.openAmount > 0 ? formatEur(i.openAmount) : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`${c.displayName} löschen?`}
        confirmLabel="Endgültig löschen"
        variant="danger"
        onConfirm={async () => {
          const result = await api.customers.delete(companyId, id);
          void queryClient.invalidateQueries({ queryKey: qk.customers(companyId) });
          if (result.result === 'anonymized') {
            toast.success('Kunde anonymisiert', 'Die Dokumente bleiben wegen Aufbewahrungspflichten erhalten.');
            void queryClient.invalidateQueries({ queryKey: qk.customer(companyId, id) });
          } else {
            toast.success('Kunde gelöscht');
            void navigate('/kunden', { replace: true });
          }
        }}
      >
        <div className="space-y-2 text-sm text-neutral-700">
          <p>
            <strong className="font-medium text-neutral-900">Ohne Angebote, Aufträge oder Rechnungen</strong> wird der Kunde vollständig gelöscht.
          </p>
          <p>
            <strong className="font-medium text-neutral-900">Mit Angeboten, Aufträgen oder Rechnungen</strong> werden stattdessen Name, Kontakt- und
            Adressdaten anonymisiert. Die Dokumente selbst bleiben wegen gesetzlicher Aufbewahrungspflichten erhalten.
          </p>
          <p className="text-neutral-500">Dieser Schritt kann nicht rückgängig gemacht werden. Zum Ausblenden genügt „Archivieren“.</p>
        </div>
      </ConfirmDialog>
    </>
  );
}
