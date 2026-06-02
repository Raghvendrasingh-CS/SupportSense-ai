import { calculateROI } from '../routes/analytics.js';

describe('ROI Calculation Engine Unit Tests', () => {
  test('returns zero savings and no null values when ticket store is empty', () => {
    const result = calculateROI([]);

    expect(result.totalDollarsSaved).toBe(0);
    expect(result.resolvedCount).toBe(0);
    expect(result.totalTickets).toBe(0);
    expect(result.avgProcessingVelocityReductionPercent).toBe(0);
    expect(result.costPerTicket).toBe(0);
    expect(result.totalTokensUsed).toBe(0);

    // Assert that no property is null, undefined, or NaN
    Object.keys(result).forEach(key => {
      expect(result[key]).not.toBeNull();
      expect(result[key]).not.toBeUndefined();
      expect(result[key]).not.toBe(NaN);
    });
  });

  test('handles tickets with undefined priority without throwing', () => {
    const tickets = [
      { id: 'TKT-001', status: 'resolved', priority: null },
      { id: 'TKT-002', status: 'resolved', priority: undefined }
    ];

    let result;
    expect(() => {
      result = calculateROI(tickets);
    }).not.toThrow();

    expect(result.totalDollarsSaved).toBeGreaterThan(0);
    expect(isFinite(result.totalDollarsSaved)).toBe(true);
  });

  test('correctly applies complexity multipliers for all priority levels', () => {
    // We expect critical > high > medium > low savings contribution
    const criticalTicket = calculateROI([{ id: '1', status: 'resolved', priority: 'critical' }]);
    const highTicket = calculateROI([{ id: '2', status: 'resolved', priority: 'high' }]);
    const mediumTicket = calculateROI([{ id: '3', status: 'resolved', priority: 'medium' }]);
    const lowTicket = calculateROI([{ id: '4', status: 'resolved', priority: 'low' }]);

    expect(criticalTicket.totalDollarsSaved).toBeGreaterThan(highTicket.totalDollarsSaved);
    expect(highTicket.totalDollarsSaved).toBeGreaterThan(mediumTicket.totalDollarsSaved);
    expect(mediumTicket.totalDollarsSaved).toBeGreaterThan(lowTicket.totalDollarsSaved);
  });

  test('computes dynamic velocity and cost from token usage', () => {
    const tickets = [
      {
        id: 'TKT-VEL-001',
        status: 'resolved',
        priority: 'medium',
        tokenUsage: 500,
        createdAt: '2026-06-01T10:00:00Z',
        completedAt: '2026-06-01T10:02:00Z'  // 120 seconds
      }
    ];

    const result = calculateROI(tickets);

    // Velocity should be > 0 since 120s << 2820s human baseline
    expect(result.avgProcessingVelocityReductionPercent).toBeGreaterThan(90);
    // Cost should be derived from 500 tokens, not hardcoded $4.50
    expect(result.costPerTicket).toBeGreaterThan(0);
    expect(result.costPerTicket).toBeLessThan(1); // 500 tokens at $0.015/1K = ~$0.0125
    expect(result.totalTokensUsed).toBe(500);
    expect(result.avgDurationSeconds).toBe(120);
  });

  test('deterministic token fallback produces consistent results across runs', () => {
    const tickets = [
      { id: 'TKT-DET-001', status: 'resolved', priority: 'high' },
      { id: 'TKT-DET-002', status: 'resolved', priority: 'low' }
    ];

    const run1 = calculateROI(tickets);
    const run2 = calculateROI(tickets);

    // Identical inputs must produce identical outputs (no Math.random)
    expect(run1.totalDollarsSaved).toBe(run2.totalDollarsSaved);
    expect(run1.costPerTicket).toBe(run2.costPerTicket);
    expect(run1.avgProcessingVelocityReductionPercent).toBe(run2.avgProcessingVelocityReductionPercent);
    expect(run1.totalTokensUsed).toBe(run2.totalTokensUsed);
  });
});
