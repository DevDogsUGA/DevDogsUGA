export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">{children}</div>
  );
}
