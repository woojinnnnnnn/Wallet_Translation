export function shortenAddress(address: string) {
  if (address.length < 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

export function timestampFromSeconds(timestamp: string) {
  const seconds = Number(timestamp);

  if (Number.isNaN(seconds)) {
    return new Date().toISOString();
  }

  return new Date(seconds * 1000).toISOString();
}

export function trimAmount(value: string) {
  const [integer, decimals] = value.split('.');
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (!decimals) {
    return formattedInteger;
  }

  const trimmedDecimals = decimals.slice(0, 6).replace(/0+$/, '');
  return trimmedDecimals ? `${formattedInteger}.${trimmedDecimals}` : formattedInteger;
}
