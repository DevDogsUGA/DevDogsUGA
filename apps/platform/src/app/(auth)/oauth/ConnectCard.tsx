import type { ReactNode } from "react";
import AuthCard from "~/classic/components/AuthCard";

/**
 * The centred card the `devtools oauth` approval pages sit on (connect and
 * device): the baseline's consent card surface, a heading, a plain sentence of
 * what is being asked, and the actions.
 */
export default function ConnectCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <AuthCard className="max-w-lg">
      <h1 className="text-xl font-semibold text-white">{title}</h1>
      {description && (
        <p className="mt-1 mb-6 text-sm text-mauve-400">{description}</p>
      )}
      {children}
    </AuthCard>
  );
}
