import { Body, Controller, Inject, Get, HttpCode, Injectable, Logger, Module, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { IsIn, Matches } from 'class-validator';
import { DataSource } from 'typeorm';
import { UploadModule } from '../upload/upload.module';
import { STORAGE, StorageProvider } from '../upload/storage.provider';
import { RedisService } from '../redis/redis.service';
import { RedisRateLimitGuard } from '../../common/security/redis-rate-limit.guard';
import { RateLimit } from '../../common/security/rate-limit.decorator';

export class ClientErrorDto {
  @IsIn(['flutter', 'unhandled', 'network_unavailable', 'network_server'])
  category!: string;
  @Matches(/^[a-f0-9]{8}$/)
  fingerprint!: string;
  @IsIn(['android', 'iOS', 'linux', 'macOS', 'windows', 'fuchsia'])
  platform!: string;
}

@Controller('telemetry')
export class TelemetryController {
  private readonly logger = new Logger('ClientDiagnostics');

  @Post('client-errors')
  @HttpCode(202)
  @UseGuards(RedisRateLimitGuard)
  @RateLimit({scope: 'client-diagnostics', limit: 20, windowSeconds: 60})
  receive(@Body() event: ClientErrorDto) {
    // Copy only allowlisted scalars. No request context, identity or raw errors.
    this.logger.log(JSON.stringify({
      event: 'client_error', category: event.category,
      fingerprint: event.fingerprint, platform: event.platform,
    }));
    return {accepted: true};
  }
}

@Injectable()
export class ReadinessService {
  constructor(private readonly db: DataSource, private readonly redis: RedisService,@Inject(STORAGE) private readonly storage:StorageProvider) {}

  async check() {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.all([
          this.db.query('SELECT 1'),
          this.redis.ping(),
          this.storage.ready(),
        ]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Readiness timeout')), 1500);
        }),
      ]);
      return {status: 'ready'};
    } catch {
      // Do not disclose credentials, infrastructure addresses, or raw errors.
      throw new ServiceUnavailableException('Service not ready');
    } finally {
      clearTimeout(timer);
    }
  }
}

@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}
  @Get('live') live() { return {status: 'alive'}; }
  @Get('ready') ready() { return this.readiness.check(); }
}

@Module({imports:[UploadModule],controllers: [TelemetryController, HealthController], providers: [ReadinessService]})
export class OperationsModule {}
