const PUBLIC_AUTH_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password"
]);

export function shouldInvalidateAuthentication(
  hasToken: boolean,
  status: number | undefined,
  path: string
) {
  return Boolean(
    hasToken &&
    (status === 401 || status === 403) &&
    !PUBLIC_AUTH_PATHS.has(path)
  );
}
