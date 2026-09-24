import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { STORAGE } from '../upload/storage.provider';
import { DataSource } from 'typeorm';
import { promises as fs } from 'fs';
import request from 'supertest';
import { HealthController, ReadinessService, TelemetryController } from './operations.module';
import { RedisService } from '../redis/redis.service';
import { RedisRateLimitGuard } from '../../common/security/redis-rate-limit.guard';

describe('operational endpoints', () => {
  let app: INestApplication;
  const db = {query: jest.fn().mockResolvedValue([{one: 1}])};
  const redis = {ping: jest.fn().mockResolvedValue('PONG'), incrementWithTTL: jest.fn().mockResolvedValue({count: 1, ttlSeconds: 60})};
  let log: jest.SpyInstance;
  const event = {category: 'flutter', fingerprint: '1234abcd', platform: 'iOS'};
  beforeAll(async () => {
    await fs.mkdir('uploads', {recursive: true});
    const module = await Test.createTestingModule({
      controllers: [HealthController, TelemetryController],
      providers: [ReadinessService, RedisRateLimitGuard, {provide:STORAGE,useValue:{ready:jest.fn().mockResolvedValue(undefined)}}, {provide: DataSource, useValue: db}, {provide: RedisService, useValue: redis}],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({whitelist: true, forbidNonWhitelisted: true, transform: true}));
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    await app.init();
  });
  afterAll(async () => { await app.close(); log.mockRestore(); });
  it('accepts only the diagnostic allowlist', async () => {
    await request(app.getHttpServer()).post('/telemetry/client-errors').send(event).expect(202);
    expect(log).toHaveBeenCalledWith(JSON.stringify({event: 'client_error', ...event}));
    for (const patch of [{email: 'private@example.test'}, {category: 'private note'}, {fingerprint: 'stack trace'}, {platform: 'anything'}]) {
      await request(app.getHttpServer()).post('/telemetry/client-errors').send({...event, ...patch}).expect(400);
    }
  });
  it('limits incoming reports', async () => {
    redis.incrementWithTTL.mockResolvedValueOnce({count: 21, ttlSeconds: 30});
    const response = await request(app.getHttpServer()).post('/telemetry/client-errors').send(event).expect(429);
    expect(response.headers['retry-after']).toBe('30');
  });
  it('reports readiness with database, Redis and local uploads available', async () => {
    await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(db.query).toHaveBeenCalledWith('SELECT 1');
    expect(redis.ping).toHaveBeenCalled();
  });
  it('keeps liveness independent of dependencies and hides connection errors', async () => {
    db.query.mockRejectedValueOnce(new Error('secret database address'));
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(JSON.stringify(response.body)).not.toContain('secret');
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });
  it('fails readiness when Redis is unavailable', async () => {
    redis.ping.mockRejectedValueOnce(new Error('redis password'));
    await request(app.getHttpServer()).get('/health/ready').expect(503);
  });
});
