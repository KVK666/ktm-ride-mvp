export function optionalFiniteNumber(value: unknown) {
  if (value == null) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function finiteNumberOrZero(value: unknown) {
  return optionalFiniteNumber(value) ?? 0;
}
