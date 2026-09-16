import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service.js';

@Controller()
export class AppController {
  constructor(private readonly database: DatabaseService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
    };
  }

  @Get('db')
  async getDatabaseStatus() {
    const database = await this.database.checkConnection();

    return {
      status: 'ok',
      ...database,
      uptime_seconds: Math.floor(process.uptime()),
    };
  }
}
