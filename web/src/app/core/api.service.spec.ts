import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

describe('ApiService', () => {
  const auth = {
    token: vi.fn(() => 'expired-token'),
    clearSession: vi.fn(),
  };
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    auth.token.mockClear();
    auth.clearSession.mockClear();
    router.navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        ApiService,
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('owns authenticated 401 session cleanup and navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            status: 'error',
            programCode: 'UNAUTHORIZED',
            message: 'Unauthorized',
            data: null,
          }),
        ),
      } as unknown as Response),
    );

    const api = TestBed.inject(ApiService);
    await expect(api.request('/profile')).rejects.toThrow(
      'Your session expired. Please sign in again.',
    );
    expect(auth.clearSession).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/auth']);
  });
});
