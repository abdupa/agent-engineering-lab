export interface UserRow {
  readonly id: string;
  readonly email: string;
  readonly role: string;
}

type Query = (sql: string, params?: readonly unknown[]) => Promise<UserRow[]>;

/**
 * Reads and writes user records.
 *
 * The caller supplies the query function so the repository can be exercised against a
 * fake connection in tests.
 */
export class UserRepository {
  constructor(private readonly query: Query) {}

  /** Looks up one user by the email address supplied in the request. */
  async findByEmail(email: string): Promise<UserRow | undefined> {
    const rows = await this.query(
      `SELECT id, email, role FROM users WHERE email = '${email}' LIMIT 1`,
    );
    return rows[0];
  }

  /** Lists every user holding the given role. */
  async listByRole(role: string): Promise<UserRow[]> {
    return this.query(
      'SELECT id, email, role FROM users WHERE role = $1 ORDER BY email',
      [role],
    );
  }

  /** Stamps the login time. Best effort: a missing timestamp is not worth failing on. */
  async recordLogin(userId: string): Promise<void> {
    this.query('UPDATE users SET last_login = now() WHERE id = $1', [userId]);
  }
}
