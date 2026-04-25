// ============================================================
// User Model
// ============================================================
import { query, queryOne } from '../database/pool';
import bcrypt from 'bcryptjs';

export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserDto {
  username: string;
  email: string;
  password: string;
}

export const UserModel = {
  async findById(id: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
  },

  async findByEmail(email: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
  },

  async findByUsername(username: string): Promise<User | null> {
    return queryOne<User>('SELECT * FROM users WHERE username = $1', [username]);
  },

  async create(dto: CreateUserDto): Promise<User> {
    const hashed = await bcrypt.hash(dto.password, 12);
    const row = await queryOne<User>(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3) RETURNING *`,
      [dto.username, dto.email, hashed]
    );
    if (!row) throw new Error('Failed to create user');
    return row;
  },

  async comparePassword(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  },

  /** Strip password from response */
  sanitize(user: User): Omit<User, 'password'> {
    const { password, ...safe } = user;
    return safe;
  },
};
