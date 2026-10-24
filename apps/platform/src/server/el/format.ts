/** Hours as the page writes them: whole numbers bare, quarters as decimals. */
export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2).replace(/0$/u, "");
}
