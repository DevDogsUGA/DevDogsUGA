export default function isLocalUri(uriStr: string): boolean {
  let url: URL;
  try {
    url = new URL(uriStr);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  const h = url.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)
  );
}
