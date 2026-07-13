type ParsedJson = { valid: true; value: unknown } | { valid: false; error: string };

export type ApiRequest = {
  baseUrl: string;
  path: string;
  options?: RequestInit;
  token?: string | null;
  timeoutMs?: number;
  fallbackErrorMessage?: string;
};

export class HttpRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HttpRequestError';
  }
}

export async function requestApiJson<T>({
  baseUrl,
  path,
  options = {},
  token,
  timeoutMs = 10000,
  fallbackErrorMessage = 'Request failed.',
}: ApiRequest): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error: unknown) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new Error('Request timed out. Check the backend connection.');
    }
    if (error instanceof TypeError) {
      throw new Error('Network request failed. Check your internet connection.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const text = await readResponseText(response);
  const parsed = parseJson(text);

  if (!response.ok) {
    const message = parsed.valid
      ? responseErrorMessage(parsed.value, fallbackErrorMessage)
      : (parsed as { valid: false; error: string }).error;
    throw new HttpRequestError(message, response.status);
  }

  if (!parsed.valid) {
    throw new Error('Unexpected response from the server.');
  }

  return unwrapApiResponse(parsed.value) as T;
}

async function readResponseText(response: Response) {
  try {
    return await response.text();
  } catch {
    throw new Error('Unable to read server response.');
  }
}

function parseJson(text: string): ParsedJson {
  if (!text) {
    return { valid: true, value: {} };
  }
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object'
      ? { valid: true, value }
      : { valid: false, error: 'Unexpected response from the server.' };
  } catch {
    return {
      valid: false,
      error: text.slice(0, 180) || 'Unexpected response from the server.',
    };
  }
}

function responseErrorMessage(value: unknown, fallback: string) {
  if (isStandardApiResponse(value)) {
    return String(
      (value as { message?: unknown; error?: unknown }).message ||
        (value as { error?: unknown }).error ||
        fallback,
    );
  }
  if (value && typeof value === 'object' && 'error' in value) {
    return String((value as { error?: unknown }).error || fallback);
  }
  return fallback;
}

function unwrapApiResponse(value: unknown) {
  if (isStandardApiResponse(value)) {
    return (value as { data?: unknown }).data ?? {};
  }
  return value;
}

function isStandardApiResponse(value: unknown) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'status' in value &&
      'programCode' in value &&
      'message' in value &&
      'data' in value,
  );
}
