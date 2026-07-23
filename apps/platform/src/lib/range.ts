export default function range(end: number): IteratorObject<number, void, []>;
export default function range(
  end: number,
  inclusive: true,
): IteratorObject<number, void, []>;
export default function range(
  start: number,
  end: number,
): IteratorObject<number, void, []>;
export default function range(
  start: number,
  end: number,
  inclusive: true,
): IteratorObject<number, void, []>;
export default function* range(a: number, b?: number | true, c?: true) {
  const inclusive = b === true || c === true;
  const start = b === undefined ? 0 : a;
  const end = (typeof b === "number" ? b : a) + (inclusive ? 1 : 0);

  for (let i = start; i < end; i += Math.sign(end - start)) {
    yield i;
  }
}
