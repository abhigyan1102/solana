export function truncateAddress(value: string, chars = 4) {
  if (!value || value.length <= chars * 2 + 3) {
    return value;
  }

  return `${value.slice(0, chars)}...${value.slice(-chars)}`;
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  return Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}
