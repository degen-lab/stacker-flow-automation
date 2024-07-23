export function getShortAddress(tx: string | undefined): string | null {
  if (!tx) {
    return null;
  }

  const start = tx.substring(0, 4),
    end = tx.slice(-4);

  return `${start}...${end}`;
}
