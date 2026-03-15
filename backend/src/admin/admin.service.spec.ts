import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { DRIZZLE_PROVIDER } from '../db/db.module';

describe('AdminService', () => {
  let service: AdminService;

  const mockInsert = {
    values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: 1 }]) }),
  };

  const mockUpdate = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: 1 }]) }),
  };

  const mockDb = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ value: 10 }]),
      }),
    }),
    insert: jest.fn().mockReturnValue(mockInsert),
    update: jest.fn().mockReturnValue(mockUpdate),
    query: {
      reports:    { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      users:      { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      areas:      { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      adminActions: { findMany: jest.fn().mockResolvedValue([]) },
      auditLogs:  { findMany: jest.fn().mockResolvedValue([]) },
      cities:     { findMany: jest.fn().mockResolvedValue([]) },
      categories: { findMany: jest.fn().mockResolvedValue([]) },
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset chained mocks
    mockDb.update.mockReturnValue(mockUpdate);
    mockUpdate.set.mockReturnThis();
    mockUpdate.where.mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: 1 }]) });
    mockDb.insert.mockReturnValue(mockInsert);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DRIZZLE_PROVIDER, useValue: mockDb },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ----- logAction ---------------------------------------------------------
  describe('logAction', () => {
    it('inserts an audit log entry with ip', async () => {
      await service.logAction(1, 'TEST_ACTION', 'reason', 123, '10.0.0.1');
      expect(mockDb.insert).toHaveBeenCalled();
      const callArgs = mockInsert.values.mock.calls[0][0];
      expect(callArgs.action).toBe('TEST_ACTION');
      expect(callArgs.ip).toBe('10.0.0.1');
    });
  });

  // ----- logDeepAction -----------------------------------------------------
  describe('logDeepAction', () => {
    it('inserts an admin_actions entry with before/after/ip', async () => {
      await service.logDeepAction(1, 'BAN_USER', 'USER', 5, 'spam', { status: 'ACTIVE' }, { status: 'BANNED' }, '10.0.0.2');
      expect(mockDb.insert).toHaveBeenCalled();
      const callArgs = mockInsert.values.mock.calls[0][0];
      expect(callArgs.action).toBe('BAN_USER');
      expect(callArgs.ip).toBe('10.0.0.2');
      expect(callArgs.beforeJson).toContain('ACTIVE');
      expect(callArgs.afterJson).toContain('BANNED');
    });
  });

  // ----- archiveReport -----------------------------------------------------
  describe('archiveReport', () => {
    it('updates report status and inserts audit log', async () => {
      await service.archiveReport(123, 1, 'spam content');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  // ----- disableArea -------------------------------------------------------
  describe('disableArea', () => {
    it('sets isActive false and logs the action', async () => {
      await service.disableArea(2, 1, 'deprecated location', '10.0.0.1');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });
  
  // ----- getOverview -------------------------------------------------------
  describe('getOverview', () => {
    it('returns structured metrics for the dashboard', async () => {
      const result = await service.getOverview();
      expect(result).toHaveProperty('totalReports');
      expect(result).toHaveProperty('criticalUnverified');
      expect(result).toHaveProperty('flaggedForReview');
      expect(result).toHaveProperty('resolvedToday');
      expect(result).toHaveProperty('flaggedTrends');
      expect(result).toHaveProperty('suspiciousPatterns');
    });
  });
});
