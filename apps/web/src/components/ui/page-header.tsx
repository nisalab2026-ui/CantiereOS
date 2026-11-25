/** Intestazione di pagina: titolo, descrizione, azioni (solo azioni reali e permesse). */
export function PageHeader({
  title,
  description,
  actions,
  testId,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight" data-testid={testId}>
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className="flex max-w-full flex-wrap items-center gap-2 max-sm:w-full max-sm:*:justify-start!">
          {actions}
        </div>
      )}
    </div>
  );
}
