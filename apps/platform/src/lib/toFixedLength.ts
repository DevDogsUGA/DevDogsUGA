export default function toFixedLength(number: number, length: number) {
  let s = String(number);

  while (s.length < length) {
    s = "0" + s;
  }

  return s;
}
