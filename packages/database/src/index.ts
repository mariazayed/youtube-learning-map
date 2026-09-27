import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * One shared connection pool per process. Reusing the client during development also prevents
 * Next.js hot reloads from opening a new pool on every module refresh.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Gracefully closes the process-local pool in scripts and controlled shutdown paths. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export * from '@prisma/client';
