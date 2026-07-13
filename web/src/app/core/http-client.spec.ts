import { HttpRequestError, requestApiJson } from './http-client';

function mockResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('requestApiJson', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('unwraps standard responses and preserves custom headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(
        JSON.stringify({
          status: 'success',
          programCode: 'OK',
          message: 'Success',
          data: { rides: 3 },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      requestApiJson<{ rides: number }>({
        baseUrl: 'https://example.test/api',
        path: '/rides',
        token: 'token-123',
        options: { headers: { 'Idempotency-Key': 'ride-1' } },
      }),
    ).resolves.toEqual({ rides: 3 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/api/rides',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-123',
          'Idempotency-Key': 'ride-1',
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('returns an empty object for an empty successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse('')));

    await expect(
      requestApiJson<Record<string, never>>({ baseUrl: 'https://example.test', path: '/empty' }),
    ).resolves.toEqual({});
  });

  it('rejects malformed successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse('not-json')));

    await expect(
      requestApiJson({ baseUrl: 'https://example.test', path: '/broken' }),
    ).rejects.toThrow('Unexpected response from the server.');
  });

  it('returns typed HTTP errors with provider messages and status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(
          JSON.stringify({
            status: 'error',
            programCode: 'INVALID',
            message: 'Ride was rejected.',
            data: null,
          }),
          422,
        ),
      ),
    );

    const error = await requestApiJson({ baseUrl: 'https://example.test', path: '/rides' }).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ message: 'Ride was rejected.', status: 422 });
  });

  it('uses raw response text for malformed HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse('Gateway unavailable', 503)));

    await expect(
      requestApiJson({ baseUrl: 'https://example.test', path: '/rides' }),
    ).rejects.toMatchObject({ message: 'Gateway unavailable', status: 503 });
  });

  it('converts fetch failures into the existing network message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(
      requestApiJson({ baseUrl: 'https://example.test', path: '/rides' }),
    ).rejects.toThrow('Network request failed. Check your internet connection.');
  });

  it('aborts requests using the existing timeout message', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
      ),
    );

    const request = requestApiJson({
      baseUrl: 'https://example.test',
      path: '/slow',
      timeoutMs: 25,
    });
    const expectation = expect(request).rejects.toThrow(
      'Request timed out. Check the backend connection.',
    );
    await vi.advanceTimersByTimeAsync(25);
    await expectation;
  });
});
