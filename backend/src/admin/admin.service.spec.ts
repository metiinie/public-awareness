import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;

  const mockDb = {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ value: 10 }]),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 1 }]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 1 }]),
        }),
      }),
    }),
    query: {
      reports: { findMany: jest.fn().mockResolvedValue([]) },
      users: { findMany: jest.fn().mockResolvedValue([]) },
      auditLogs: { findMany: jest.fn().mockResolvedValue([]) },
      cities: { findMany: jest.fn().mockResolvedValue([]) },
      categories: { findMany: jest.fn().mockResolvedValue([]) },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: 'DATABASE_CONNECTION',
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logAction', () => {
    it('should insert an audit log entry', async () => {
      await service.logAction(1, 'TEST_ACTION', 'Test reason', 123);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('archiveReport', () => {
    it('should update report status and log the action', async () => {
      await service.archiveReport(123, 1);
      expect(mockDb.update).toHaveBeenCalled();
      // Verifies that the internal logAction was likely called (since mockDb.insert would be triggered)
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });
});
