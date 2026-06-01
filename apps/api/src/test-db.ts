import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WorkbenchService } from './modules/workbench/workbench.service';

async function main() {
  console.log('--- CALLING WORKBENCH SERVICE DIRECTLY ---');
  // Bootstrap only the WorkbenchModule / AppModule to get the service instance
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const workbenchService = app.get(WorkbenchService);
    const userId = 'cmpfjlhn30000t17fccen0uvt';
    const result = await workbenchService.getWatchRepositories(userId);
    console.log(`Successfully fetched watch repositories. Count: ${result.length}`);
    for (const item of result.slice(0, 10)) {
      console.log(`- Repo: ${item.fullName}, isMonitored: ${item.isMonitored}, eventCount: ${item.eventCount}, canAddToMonitoring: ${item.canAddToMonitoring}`);
    }
    if (result.length > 10) {
      console.log(`- ... and ${result.length - 10} more`);
    }
  } catch (err) {
    console.error('Error calling WorkbenchService:', err);
  } finally {
    await app.close();
  }
}

main();
