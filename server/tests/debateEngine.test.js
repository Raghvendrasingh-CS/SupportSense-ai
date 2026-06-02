import { runDebate } from '../agents/DebateEngine.js';

describe('Consensus Debate Engine Integration Tests', () => {
  test('resolves within 3 iterations without infinite loop', async () => {
    const ticket = {
      id: 'TKT-DEB-001',
      subject: 'VPN access issue',
      description: 'Cannot connect to VPN from my office location.',
      riskProfile: { riskLevel: 'low' }
    };

    const triageResult = {
      classification: {
        sentiment: 'neutral',
        category: 'Network',
        categoryConfidence: 0.7,
        priorityConfidence: 0.7
      }
    };

    const initialResolution = {
      status: 'pending_review',
      resolution: {
        confidence: 0.6,
        canAutoResolve: false,
        steps: ['Flush DNS'],
        summary: 'Check connection'
      }
    };

    const initialEscalation = {
      escalated: true,
      escalationTier: 'L2',
      reasons: []
    };

    const result = await runDebate(ticket, triageResult, initialResolution, initialEscalation);
    
    expect(result.iterations).toBeLessThanOrEqual(3);
    expect(result.consensusReached || result.humanInTheLoop).toBe(true);
    expect(['resolved', 'escalated', 'pending_review']).toContain(result.finalStatus);
  });

  test('human-in-the-loop triggers correctly for high-risk angry complaint', async () => {
    const ticket = {
      id: 'TKT-DEB-002',
      subject: 'Threatening legal action — data export issue',
      description: 'Breach of agreement, consulting my legal team.',
      riskProfile: { riskLevel: 'high' }
    };

    const triageResult = {
      classification: {
        sentiment: 'angry',
        category: 'Complaint',
        categoryConfidence: 0.5,
        priorityConfidence: 0.5
      }
    };

    const initialResolution = {
      status: 'pending_review',
      resolution: {
        confidence: 0.5,
        canAutoResolve: false,
        steps: [],
        summary: 'Review case history'
      }
    };

    const initialEscalation = {
      escalated: true,
      escalationTier: 'L3',
      reasons: []
    };

    const result = await runDebate(ticket, triageResult, initialResolution, initialEscalation);
    
    expect(result.humanInTheLoop).toBe(true);
    expect(result.finalStatus).toBe('pending_review');
  });
});
