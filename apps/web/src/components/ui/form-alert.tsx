/** Esito di un modulo: errore generale (role=alert) o conferma. */
export function FormAlert({
  error,
  message,
}: {
  error?: string | undefined;
  message?: string | undefined;
}) {
  return (
    <div aria-live="polite">
      {error && (
        <p
          role="alert"
          data-testid="form-error"
          className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{message}</p>
      )}
    </div>
  );
}
