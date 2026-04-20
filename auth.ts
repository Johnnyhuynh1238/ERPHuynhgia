import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) return null;

        const matched = await bcrypt.compare(password, user.passwordHash);
        if (!matched) return null;

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
