import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Accounts: Supabase Auth (email/password now; OAuth providers later without code changes
 * here beyond a sign-in button) + our backend for everything that must be validated.
 *
 * Only PUBLIC values reach the browser: VITE_SUPABASE_URL + the publishable/anon key.
 * The service role never exists in the frontend.
 */

export interface Stats {
  matches: number;
  wins: number;
  losses: number;
  kos: number;
  deaths: number;
  damage_dealt: number;
}

export interface Rating {
  queue: string;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
}

export interface Profile {
  id: string;
  email: string | null;
  username: string;
  avatar_id: string;
  avatar_url: string | null;
  favorite_character: string;
  created_at: string;
  stats: Stats;
  ratings: Rating[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

/** Human messages for known error codes (never raw server text). */
export const ERROR_TEXT: Record<string, string> = {
  invalid_credentials: 'EMAIL OU SENHA INCORRETOS',
  email_not_confirmed: 'CONFIRME SEU EMAIL ANTES DE ENTRAR',
  user_already_exists: 'ESTE EMAIL JÁ TEM CONTA',
  weak_password: 'SENHA FRACA (MÍNIMO 8 CARACTERES)',
  username_taken: 'NOME DE USUÁRIO EM USO',
  invalid_request: 'DADOS INVÁLIDOS',
  rate_limited: 'MUITAS TENTATIVAS. AGUARDE UM POUCO',
  over_email_send_rate_limit: 'MUITOS EMAILS ENVIADOS. AGUARDE',
  file_too_large: 'IMAGEM MUITO GRANDE (MÁX 512 KB)',
  bad_extension: 'USE PNG OU WEBP',
  bad_content: 'ARQUIVO DE IMAGEM INVÁLIDO',
  bad_dimensions: 'IMAGEM ENTRE 16 E 1024 PX',
  unauthorized: 'SESSÃO EXPIRADA. ENTRE NOVAMENTE',
  offline: 'SERVIDOR INDISPONÍVEL',
  room_not_found: 'SALA NÃO ENCONTRADA',
  room_full: 'SALA CHEIA',
  room_closed: 'PARTIDA JÁ COMEÇOU OU TERMINOU',
  match_in_progress: 'PARTIDA JÁ COMEÇOU',
  outdated_client: 'ATUALIZE A PÁGINA (VERSÃO NOVA)',
  realtime_offline: 'SERVIDOR DE PARTIDAS INDISPONÍVEL',
  connection_lost: 'CONEXÃO PERDIDA',
  not_configured: 'CONTAS INDISPONÍVEIS NESTE BUILD',
};

export const errorText = (e: unknown): string => {
  const code = e instanceof ApiError ? e.code : (e as { code?: string })?.code ?? '';
  return ERROR_TEXT[code] ?? 'ALGO DEU ERRADO. TENTE DE NOVO';
};

class AccountService {
  private sb: SupabaseClient | null = null;
  private session: Session | null = null;
  profile: Profile | null = null;
  private listeners = new Set<() => void>();

  get configured(): boolean {
    return Boolean(SUPABASE_URL && SUPABASE_KEY && API_URL);
  }

  get signedIn(): boolean {
    return this.session !== null;
  }

  /** Current Supabase access token (for our backend's Authorization header). */
  get accessToken(): string | null {
    return this.session?.access_token ?? null;
  }

  async init(): Promise<void> {
    if (!this.configured || this.sb) return;
    this.sb = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'magiclash.auth' },
    });
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    this.sb.auth.onAuthStateChange((_event, session) => {
      this.session = session;
      if (!session) this.profile = null;
      this.emit();
    });
    if (this.session) await this.refreshProfile().catch(() => undefined);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  private client(): SupabaseClient {
    if (!this.sb) throw new ApiError(0, 'not_configured');
    return this.sb;
  }

  async signUp(email: string, password: string, username: string): Promise<'signed_in' | 'confirm_email'> {
    const { data, error } = await this.client().auth.signUp({ email, password, options: { data: { username } } });
    if (error) throw new ApiError(error.status ?? 400, error.code ?? 'invalid_request');
    if (!data.session) return 'confirm_email';
    this.session = data.session;
    await this.refreshProfile();
    return 'signed_in';
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client().auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(error.status ?? 400, error.code ?? 'invalid_credentials');
    this.session = data.session;
    await this.refreshProfile();
  }

  async signOut(): Promise<void> {
    await this.client().auth.signOut();
    this.session = null;
    this.profile = null;
    this.emit();
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.session?.access_token;
    let r: Response;
    try {
      r = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ApiError(0, 'offline');
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(r.status, typeof body.error === 'string' ? body.error : 'error');
    return body as T;
  }

  async refreshProfile(): Promise<Profile> {
    this.profile = await this.api<Profile>('/api/profiles/me');
    this.emit();
    return this.profile;
  }

  async updateProfile(changes: Partial<Pick<Profile, 'username' | 'favorite_character' | 'avatar_id'>>): Promise<Profile> {
    this.profile = await this.api<Profile>('/api/profiles/me', { method: 'PATCH', body: JSON.stringify(changes) });
    this.emit();
    return this.profile;
  }

  async uploadAvatar(file: File): Promise<Profile> {
    const form = new FormData();
    form.append('file', file, file.name);
    this.profile = await this.api<Profile>('/api/profiles/me/avatar', { method: 'POST', body: form });
    this.emit();
    return this.profile;
  }
}

export const account = new AccountService();

// ── Guest identity (no account) ─────────────────────────────────────────────

const GUEST_KEY = 'magiclash.guestName';
export const GUEST_NAME_RE = /^[A-Za-z0-9_]{3,12}$/;

export const guestName = (): string => {
  try {
    const v = localStorage.getItem(GUEST_KEY);
    if (v && GUEST_NAME_RE.test(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return 'VISITANTE';
};

export const setGuestName = (name: string): boolean => {
  if (!GUEST_NAME_RE.test(name)) return false;
  try {
    localStorage.setItem(GUEST_KEY, name);
  } catch {
    /* keep in memory only */
  }
  return true;
};

/** Name shown in HUD tags: account username, else guest name. */
export const displayName = (): string => (account.profile?.username ?? guestName()).slice(0, 12);
