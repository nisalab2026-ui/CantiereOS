/** Si rimonta a ogni navigazione: il contenuto entra con una breve animazione. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="cos-enter">{children}</div>;
}
