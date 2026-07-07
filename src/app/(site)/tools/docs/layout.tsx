import ConsoleTitle from "~/ui/page-title";

export default function DocsPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ConsoleTitle>
        <h2 className="flex w-full cursor-default items-center justify-center gap-3 text-sm/none font-semibold @sm:text-base/none">
          <span className="text-mauve-500">Dev Tools</span>
          <span
            className="inline-block h-3.5 w-0.5 shrink-0 rotate-20 bg-mauve-600"
            aria-hidden
          />
          <span className="text-white">Docs Preview</span>
        </h2>
      </ConsoleTitle>
      {children}
    </div>
  );
}
