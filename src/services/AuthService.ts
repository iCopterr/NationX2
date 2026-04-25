// ============================================================
// Auth Service
// ============================================================
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UserModel, CreateUserDto } from '../models/User';
import { CountryModel } from '../models/Country';
import { ResourceModel } from '../models/Resource';
import { KnowledgeModel } from '../models/Knowledge';
import { PolicyModel } from '../models/Policy';
import { JwtPayload } from '../types';

const KNOWLEDGE_TYPES = ['technology', 'military', 'engineering', 'science', 'economics', 'medicine'] as const;
const RESOURCE_TYPES = ['metal', 'energy', 'food', 'oil', 'water', 'rare_earth'] as const;

export const AuthService = {
  async register(dto: CreateUserDto & { countryName: string; flagEmoji?: string }) {
    // Check uniqueness
    const existingUser = await UserModel.findByEmail(dto.email);
    if (existingUser) throw new Error('Email already in use');

    const existingUsername = await UserModel.findByUsername(dto.username);
    if (existingUsername) throw new Error('Username already taken');

    // Create user
    const user = await UserModel.create(dto);

    // Create country
    const country = await CountryModel.create({
      userId: user.id,
      name: dto.countryName,
      flagEmoji: dto.flagEmoji,
    });

    // Initialize starter resources
    for (const type of RESOURCE_TYPES) {
      const starterAmount = type === 'food' ? 500 : type === 'metal' ? 200 : 100;
      await ResourceModel.upsert(country.id, type, { capacity: 100000 });
      await ResourceModel.adjust(country.id, type, starterAmount);
    }

    // Initialize knowledge (all at 0)
    for (const type of KNOWLEDGE_TYPES) {
      await KnowledgeModel.ensureExists(country.id, type);
    }

    // Initialize default allocation
    await PolicyModel.upsertAllocation(country.id, {
      education: 20, economy: 20, technology: 10,
      healthcare: 10, military: 10, infrastructure: 10,
    });

    const token = AuthService.signToken(user.id, country.id);
    return { user: UserModel.sanitize(user), country, token };
  },

  async login(email: string, password: string) {
    const user = await UserModel.findByEmail(email);
    if (!user) throw new Error('Invalid credentials');

    const valid = await UserModel.comparePassword(password, user.password);
    if (!valid) throw new Error('Invalid credentials');

    const country = await CountryModel.findByUserId(user.id);
    if (!country) throw new Error('No country found for this user');

    const token = AuthService.signToken(user.id, country.id);
    return { user: UserModel.sanitize(user), country, token };
  },

  signToken(userId: string, countryId: string): string {
    return jwt.sign({ userId, countryId }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    });
  },

  verifyToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
  },
};
