import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Ô đăng nhập nhận email HOẶC số điện thoại (users.phone). Field vẫn tên "email" để khỏi đổi form/next-auth.
const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

// In-memory rate limit cho staff login (single-server deployment).
// 10 sai trong 15 phút → khoá 15 phút theo email. Mất khi restart app (chấp nhận trade-off).
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
type AttemptRecord = { count: number; firstAt: number; blockedUntil: number };
const loginAttempts = new Map<string, AttemptRecord>();

function isLoginBlocked(email: string): boolean {
  const rec = loginAttempts.get(email);
  if (!rec) return false;
  const now = Date.now();
  if (rec.blockedUntil > now) return true;
  if (now - rec.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(email);
    return false;
  }
  return false;
}

function recordLoginFail(email: string) {
  const now = Date.now();
  const rec = loginAttempts.get(email);
  if (!rec || now - rec.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(email, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= LOGIN_MAX) {
    rec.blockedUntil = now + LOGIN_BLOCK_MS;
    console.warn(`[auth] LOGIN_BLOCK email=${email} attempts=${rec.count}`);
  }
}

// SĐT: bỏ ký tự thừa, +84/84 → 0. Chỉ nhận khi đúng 1 user active khớp (trùng số → từ chối).
async function findActiveUserByPhone(input: string) {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("84") && digits.length === 11) digits = `0${digits.slice(2)}`;
  if (!/^0\d{9}$/.test(digits)) return null;
  const rest = digits.slice(1);
  const users = await prisma.user.findMany({
    where: { isActive: true, phone: { in: [digits, `84${rest}`, `+84${rest}`] } },
    take: 2,
  });
  return users.length === 1 ? users[0] : null;
}

function clearLoginAttempts(email: string) {
  loginAttempts.delete(email);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    // Credentials provider dùng JWT strategy
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 ngày
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Email & Mật khẩu",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const normalizedEmail = email.toLowerCase();

        if (isLoginBlocked(normalizedEmail)) return null;

        const user = normalizedEmail.includes("@")
          ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
          : await findActiveUserByPhone(normalizedEmail);

        if (!user || !user.isActive) {
          recordLoginFail(normalizedEmail);
          return null;
        }

        const matched = await bcrypt.compare(password, user.passwordHash);
        if (!matched) {
          recordLoginFail(normalizedEmail);
          return null;
        }

        clearLoginAttempts(normalizedEmail);
        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: string }).role;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
      }

      if (token.userId) {
        const latestUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: {
            role: true,
            isActive: true,
            mustChangePassword: true,
            fullName: true,
            email: true,
          },
        });

        if (!latestUser || !latestUser.isActive) {
          return {};
        }

        token.role = latestUser.role;
        token.mustChangePassword = latestUser.mustChangePassword;
        token.name = latestUser.fullName;
        token.email = latestUser.email;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string | undefined) ?? "";
        session.user.role = (token.role as string | undefined) ?? "";
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
});
