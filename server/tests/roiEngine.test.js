import { calculateROI } from '../routes/analytics.js';

describe('ROI Calculation Engine Unit Tests', () => {
  test('returns zero savings and no null values when ticket store is empty', () => {
    const result = calculateROI([]);

    expect(result.totalDollarsSaved).toBe(0);
    expect(result.resolvedCount).toBe(0);
    expect(result.totalTickets).toBe(0);

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
});
