const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- USERS ---');
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true }
  });
  console.log(users);

  console.log('--- REPOSITORIES ---');
  const repos = await prisma.repository.findMany();
  console.log(repos.map(r => ({ id: r.id, fullName: r.fullName, isActive: r.isActive })));

  console.log('--- USER_REPOSITORIES ---');
  const userRepos = await prisma.userRepository.findMany({
    include: {
      user: { select: { email: true } },
      repository: { select: { fullName: true } }
    }
  });
  console.log(userRepos.map(ur => ({
    userId: ur.userId,
    userEmail: ur.user.email,
    repositoryId: ur.repositoryId,
    repoName: ur.repository.fullName,
    role: ur.role,
    accessMode: ur.accessMode,
    accessLevel: ur.accessLevel
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
