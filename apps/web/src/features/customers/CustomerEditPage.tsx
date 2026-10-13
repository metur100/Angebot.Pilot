import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useCompany } from '@/app/company';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter } from '@/components/ui/Card';
import { Alert, ErrorState, PageSkeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { CustomerForm } from './CustomerForm';
import type { UpsertCustomerRequest } from '@angebotpilot/api-contracts';

export default function CustomerEditPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const isNew = !id;

  const customer = useQuery({
    queryKey: qk.customer(companyId, id ?? ''),
    queryFn: () => api.customers.get(companyId, id!),
    enabled: !isNew,
  });

  const save = useMutation({
    mutationFn: (request: UpsertCustomerRequest) =>
      isNew ? api.customers.create(companyId, request) : api.customers.update(companyId, id, request),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: qk.customers(companyId) });
      queryClient.setQueryData(qk.customer(companyId, saved.id), saved);
      toast.success(isNew ? 'Kunde angelegt' : 'Änderungen gespeichert', saved.displayName);
      const returnTo = params.get('zurueck');
      void navigate(returnTo && returnTo.startsWith('/') ? returnTo.replace(':kunde', saved.id) : `/kunden/${saved.id}`, { replace: isNew });
    },
  });

  const title = isNew ? 'Neuer Kunde' : 'Kunde bearbeiten';
  const back = isNew ? { to: '/kunden', label: 'Kunden' } : { to: `/kunden/${id}`, label: customer.data?.displayName ?? 'Kunde' };

  if (!isNew && customer.isPending) return <PageSkeleton />;
  if (!isNew && customer.isError) return <ErrorState error={customer.error} onRetry={() => void customer.refetch()} />;

  return (
    <>
      <PageHeader title={title} back={back} description={isNew ? 'Pflichtfelder sind mit * markiert.' : customer.data?.displayName} />
      {conflict && (
        <Alert
          tone="warning"
          className="mb-4"
          title="Der Kunde wurde zwischenzeitlich geändert"
          actions={
            <Button
              size="sm"
              icon={RefreshCw}
              onClick={async () => {
                await customer.refetch();
                setConflict(false);
                setFormKey((k) => k + 1);
              }}
            >
              Neu laden (eigene Änderungen verwerfen)
            </Button>
          }
        >
          Jemand anderes hat diesen Kunden gespeichert, während Sie ihn bearbeitet haben. Laden Sie die aktuelle Fassung neu.
        </Alert>
      )}
      <Card>
        <CardBody className="py-6">
          <CustomerForm
            key={formKey}
            id="customer-form"
            customer={isNew ? null : customer.data}
            onSubmit={(request) => save.mutateAsync(request)}
            onConflict={() => setConflict(true)}
          />
        </CardBody>
        <CardFooter>
          <Button onClick={() => void navigate(back.to)}>Abbrechen</Button>
          <Button type="submit" form="customer-form" variant="primary" loading={save.isPending}>
            {isNew ? 'Kunde anlegen' : 'Speichern'}
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
