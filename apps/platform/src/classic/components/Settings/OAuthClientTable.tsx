import Link from "next/link";
import { PencilSimpleIcon } from "@phosphor-icons/react/ssr";
import type { OAuthClientSummary } from "~/server/loaders/console";
import Badge from "~/classic/ui/badge";
import CopyIdButton from "~/classic/components/Settings/CopyIdButton";

/** The label of a status, as the badge shows it. */
export function statusLabel(status: OAuthClientSummary["status"]): string {
  return status === "in_production" ? "In production" : "Testing";
}

/**
 * The member's apps as a table (settings-oauth.html): name with its status,
 * client ID with a copy button, how many redirect URIs it has and the edit
 * link that opens the app's page.
 */
export default function OAuthClientTable({
  clients,
}: {
  clients: OAuthClientSummary[];
}) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-mauve-800">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Your apps</caption>
        <thead className="border-b border-mauve-800 text-xs font-extrabold tracking-widest text-mauve-500 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3">
              App
            </th>
            <th scope="col" className="px-4 py-3">
              Client ID
            </th>
            <th scope="col" className="px-4 py-3">
              Redirect URIs
            </th>
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mauve-800">
          {clients.map((client) => (
            <tr key={client.clientId}>
              <td className="px-4 py-3">
                <div className="mb-1 font-medium text-white">
                  {client.label}
                </div>
                <Badge
                  variant={
                    client.status === "in_production" ? "warning" : "info"
                  }
                >
                  {statusLabel(client.status)}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2 font-mono text-xs text-mauve-300">
                  {client.clientId}
                  <CopyIdButton
                    value={client.clientId}
                    label={`Copy client ID for ${client.label}`}
                  />
                </span>
              </td>
              <td className="px-4 py-3 text-mauve-300">
                {client.redirectUris.length}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/dashboard/oauth/${client.clientId}`}
                  className="inline-flex rounded-sm p-1.5 text-mauve-300 transition-colors outline-none hover:bg-mauve-800 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={`Edit ${client.label}`}
                >
                  <PencilSimpleIcon aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
