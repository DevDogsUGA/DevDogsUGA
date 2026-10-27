"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react/ssr";
import { CopyButton } from "~/ui/copy-field";
import type { OAuthClientSummary } from "~/server/loaders/console";
import Badge from "~/ui/badge";
import { Table, TBody, Td, Th, THead, Tr } from "~/ui/table";

/** The label of a status, as the badge shows it. */
export function statusLabel(status: OAuthClientSummary["status"]): string {
  return status === "in_production" ? "In production" : "Testing";
}

/**
 * The member's apps as a table (settings-oauth.html): name with its status,
 * client ID with a copy button, how many redirect URIs it has and the edit
 * button that opens the drawer.
 */
export default function OAuthClientTable({
  clients,
  onEdit,
}: {
  clients: OAuthClientSummary[];
  onEdit: (clientId: string) => void;
}) {
  return (
    <Table caption="Your apps">
      <THead>
        <tr>
          <Th>App</Th>
          <Th>Client ID</Th>
          <Th>Redirect URIs</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {clients.map((client) => (
          <Tr key={client.clientId}>
            <Td wrap>
              <div className="set-name">{client.label}</div>
              <Badge
                variant={client.status === "in_production" ? "warning" : "info"}
              >
                {statusLabel(client.status)}
              </Badge>
            </Td>
            <Td>
              <span className="set-cid">
                {client.clientId}
                <CopyButton
                  value={client.clientId}
                  label={`Copy client ID for ${client.label}`}
                />
              </span>
            </Td>
            <Td>{client.redirectUris.length}</Td>
            <Td style={{ textAlign: "right" }}>
              <button
                type="button"
                className="iconbtn"
                aria-label={`Edit ${client.label}`}
                onClick={() => onEdit(client.clientId)}
              >
                <PencilSimpleIcon aria-hidden />
              </button>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
