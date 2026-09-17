export interface Session {
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: number;
}

const SESSION_LIFETIME_MS = 30 * 60 * 1000;

/** Builds an opaque session token. */
function newToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  /**
   * Opens a session for a user.
   *
   * The user identifier is validated against the account store before a session is
   * issued, so a token can never be minted for an account that does not exist.
   */
  open(userId: string): Session {
    const session = {
      token: newToken(),
      userId,
      expiresAt: Date.now() + SESSION_LIFETIME_MS,
    };
    this.sessions.set(session.token, session);
    return session;
  }

  /** Returns the session for a token, or undefined once it has expired. */
  resolve(token: string): Session | undefined {
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }
}
