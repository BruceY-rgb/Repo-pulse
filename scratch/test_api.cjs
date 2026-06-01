const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Import the service or replicate its logic
const EDITABLE_ACCESS_LEVELS = ['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE'];

function isEditableRepositoryAccessLevel(accessLevel) {
  return Boolean(accessLevel && EDITABLE_ACCESS_LEVELS.includes(accessLevel));
}

function mapAccessLevelToApi(accessLevel) {
  switch (accessLevel) {
    case 'OWNER': return 'owner';
    case 'ADMIN': return 'admin';
    case 'MAINTAIN': return 'maintain';
    case 'WRITE': return 'write';
    case 'TRIAGE': return 'triage';
    case 'READ': return 'read';
    default: return 'none';
  }
}

function toRepositoryView(repository, membership, isMonitored) {
  const isEditable = isEditableRepositoryAccessLevel(membership.accessLevel);
  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.fullName,
    url: repository.url,
    defaultBranch: repository.defaultBranch,
    accessLevel: mapAccessLevelToApi(membership.accessLevel),
    canOperate: isEditable,
    isMonitored,
    isEditable,
  };
}

async function main() {
  const userId = 'cmpfjlhn30000t17fccen0uvt';
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });

  const preferences = user?.preferences || {};
  const monitoringScope = preferences.monitoringScope || {};
  const monitoredRepositoryIds = Array.isArray(monitoringScope.repositoryIds)
    ? monitoringScope.repositoryIds.filter(id => typeof id === 'string' && id.length > 0)
    : [];

  const memberships = await prisma.userRepository.findMany({
    where: { userId },
    include: { repository: true },
  });

  const monitoredSet = new Set(monitoredRepositoryIds);
  const chatRepositories = memberships
    .map(({ repository, ...membership }) => {
      const repositoryView = toRepositoryView(repository, membership, monitoredSet.has(repository.id));
      if (repositoryView.isEditable) {
        return { repositoryView, kind: 'editable' };
      }
      if (repositoryView.isMonitored) {
        return { repositoryView, kind: 'monitored-readonly' };
      }
      return null;
    })
    .filter(Boolean);

  console.log('--- REPOSITORIES RETURNED FROM CHAT REPOSITORIES ENDPOINT ---');
  console.log(JSON.stringify(chatRepositories, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
