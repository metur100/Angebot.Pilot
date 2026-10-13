import type { TemplateListItemDto } from '@angebotpilot/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, FileStack, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCompany } from '@/app/company';
import { ButtonLink, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu';
import { PageHeader, table } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { formatDate, formatEur, plural } from '@/lib/format';
import { qk } from '@/lib/queryKeys';

function TemplateActions({ template, onDelete }: { template: TemplateListItemDto; onDelete: () => void }) {
  const navigate = useNavigate();
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon={MoreHorizontal} label={`Aktionen für Vorlage ${template.name}`} size="sm" />
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={Pencil} onSelect={() => void navigate(`/vorlagen/${template.id}`)}>
          Bearbeiten
        </MenuItem>
        <MenuItem
          icon={FilePlus2}
          onSelect={() => void navigate(`/angebote/neu?vorlage=${template.id}`)}
          description="Neues Angebot mit Texten und Positionen dieser Vorlage"
        >
          Angebot aus Vorlage
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={Trash2} danger onSelect={onDelete}>
          Löschen …
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export default function TemplateListPage() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: qk.templates(companyId), queryFn: () => api.templates.list(companyId) });
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<TemplateListItemDto | null>(null);

  const items = useMemo(() => {
    const all = [...(templates.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const term = search.trim().toLocaleLowerCase('de');
    if (!term) return all;
    return all.filter((t) => t.name.toLocaleLowerCase('de').includes(term) || (t.description ?? '').toLocaleLowerCase('de').includes(term));
  }, [templates.data, search]);

  const hasTemplates = (templates.data?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Vorlagen"
        description="Wiederkehrende Leistungen als Vorlage speichern und Angebote in Sekunden erstellen."
        actions={
          <>
            {hasTemplates && (
              <ButtonLink to="/angebote/neu?vorlage=1" icon={FilePlus2}>
                Angebot aus Vorlage
              </ButtonLink>
            )}
            <ButtonLink to="/vorlagen/neu" variant="primary" icon={Plus}>
              Neue Vorlage
            </ButtonLink>
          </>
        }
      />

      <Card>
        {hasTemplates && (
          <div className="border-b border-neutral-100 px-4 py-3 sm:px-5">
            <div className="max-w-sm">
              <label htmlFor="template-search" className="sr-only">
                Vorlagen suchen
              </label>
              <Input
                id="template-search"
                type="search"
                icon={Search}
                placeholder="Name oder Beschreibung …"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        )}

        {templates.isPending ? (
          <TableSkeleton rows={5} columns={4} />
        ) : templates.isError ? (
          <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
        ) : !hasTemplates ? (
          <EmptyState
            icon={FileStack}
            title="Noch keine Vorlagen"
            description="Vorlagen enthalten Positionen, Texte und Bedingungen, die Sie häufig anbieten. Speichern Sie ein bestehendes Angebot als Vorlage (in der Angebotsansicht) oder legen Sie hier eine neue an."
            action={
              <ButtonLink to="/vorlagen/neu" variant="primary" icon={Plus}>
                Erste Vorlage anlegen
              </ButtonLink>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Keine Vorlagen gefunden"
            description="Keine Vorlage passt zu Ihrer Suche."
            action={
              <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setSearch('')}>
                Suche zurücksetzen
              </button>
            }
          />
        ) : (
          <>
            <div className={cx(table.wrapper, 'hidden md:block')}>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th scope="col" className={table.th}>Vorlage</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>Positionen</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>Summe netto</th>
                    <th scope="col" className={cx(table.th, 'text-right')}>Zuletzt geändert</th>
                    <th scope="col" className={cx(table.th, 'w-12')}>
                      <span className="sr-only">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className={table.row}>
                      <td className={cx(table.td, 'max-w-[420px]')}>
                        <Link to={`/vorlagen/${t.id}`} className="block truncate font-medium text-neutral-900 hover:text-brand-700 hover:underline">
                          {t.name}
                        </Link>
                        {t.description && <p className="truncate text-[13px] text-neutral-500">{t.description}</p>}
                      </td>
                      <td className={cx(table.td, table.num)}>{t.lineItemCount}</td>
                      <td className={cx(table.td, table.num, 'font-medium')}>{formatEur(t.netTotal)}</td>
                      <td className={cx(table.td, table.num, 'text-neutral-500')}>{formatDate(t.updatedAt)}</td>
                      <td className={cx(table.td, 'text-right')}>
                        <TemplateActions template={t} onDelete={() => setToDelete(t)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-neutral-100 md:hidden">
              {items.map((t) => (
                <li key={t.id} className="flex items-start gap-2 px-4 py-3">
                  <Link to={`/vorlagen/${t.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900">{t.name}</p>
                    {t.description && <p className="truncate text-[13px] text-neutral-500">{t.description}</p>}
                    <p className="mt-1.5 text-xs text-neutral-500">
                      {plural(t.lineItemCount, 'Position', 'Positionen')} · {formatEur(t.netTotal)} netto · geändert {formatDate(t.updatedAt)}
                    </p>
                  </Link>
                  <TemplateActions template={t} onDelete={() => setToDelete(t)} />
                </li>
              ))}
            </ul>
            <p className="border-t border-neutral-100 px-5 py-3 text-[13px] text-neutral-500 tabular">
              {plural(items.length, 'Vorlage', 'Vorlagen')}
            </p>
          </>
        )}
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title={`Vorlage „${toDelete?.name ?? ''}“ löschen?`}
        description="Die Vorlage steht danach nicht mehr zur Auswahl. Bereits erstellte Angebote bleiben unverändert."
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          await api.templates.delete(companyId, toDelete.id);
          await queryClient.invalidateQueries({ queryKey: qk.templates(companyId) });
          toast.success('Vorlage gelöscht', toDelete.name);
        }}
      />
    </>
  );
}
