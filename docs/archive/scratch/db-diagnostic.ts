import { PrismaClient } from '@repo-pulse/database';

async function main() {
  // Access schema's prisma client or instantiate prisma client manually.
  // Note: we can import { prisma } from '@repo-pulse/database' or instantiate new PrismaClient.
  const prisma = new PrismaClient();
  try {
    console.log('--- DB DIAGNOSTIC ---');
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        githubId: true,
        githubLogin: true,
      }
    });
    console.log(`Found ${users.length} user(s):`);
    for (const u of users) {
      console.log(`User ID: ${u.id}, Email: ${u.email}, GitHub Login: ${u.githubLogin || 'N/A'}`);
      
      const userRepos = await prisma.userRepository.findMany({
        where: { userId: u.id },
        include: {
          repository: true
        }
      });
      console.log(`  Total User-Repo Relationships: ${userRepos.length}`);
      const starred = userRepos.filter(ur => ur.isStarred);
      console.log(`  Starred relationships: ${starred.length}`);
      for (const ur of starred.slice(0, 5)) {
        console.log(`    - Starred Repo: ${ur.repository.fullName} (${ur.repository.id})`);
      }
      if (starred.length > 5) {
        console.log(`    - ... and ${starred.length - 5} more`);
      }
      
      const monitored = userRepos.filter(ur => ur.accessMode === 'MONITOR');
      console.log(`  Monitored relationships: ${monitored.length}`);
    }

    const repos = await prisma.repository.findMany({
      select: {
        id: true,
        fullName: true,
        platform: true,
      }
    });
    console.log(`Total Repositories in DB: ${repos.length}`);
    
  } catch (err) {
    console.error('Error during diagnostic:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
