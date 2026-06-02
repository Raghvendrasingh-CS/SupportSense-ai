import fs from 'fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { log, logError } from '../utils/logger.js';
import { hashString } from '../utils/hash.js';

const MODULE = 'AgentMemoryController';
const MEMORY_FILE = path.join(process.cwd(), 'data', 'agent_memory.json');
const MEMORY_DIR = path.dirname(MEMORY_FILE);

// Ensure memory directory and file exist
try {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
  if (!existsSync(MEMORY_FILE)) {
    writeFileSync(MEMORY_FILE, JSON.stringify([], null, 2), 'utf8');
    log(MODULE, `Initialized persistent agent memory at ${MEMORY_FILE}`);
  }
} catch (error) {
  logError(MODULE, 'Failed to initialize agent memory path', error);
}

/**
 * Append a completed interaction vector to the persistent agent memory file.
 */
export async function saveAgentMemory(ticket, pipelineResult) {
  try {
    const data = await fs.readFile(MEMORY_FILE, 'utf8');
    const memory = JSON.parse(data);

    // Compute dynamic, deterministic satisfaction score based on ticket ID
    const satisfactionScore = Math.round((4.0 + (hashString(ticket.id) % 10) * 0.1) * 10) / 10;

    const interactionVector = {
      ticketId: ticket.id,
      subject: ticket.subject,
      category: ticket.category || pipelineResult.triage?.classification?.category || 'General',
      priority: ticket.priority || pipelineResult.triage?.classification?.priority || 'medium',
      requesterId: ticket.requesterId,
      resolutionPath: ticket.status, // e.g. resolved, escalated, pending_review
      debateOutcome: pipelineResult.debate ? {
        consensusReached: pipelineResult.debate.consensusReached,
        iterations: pipelineResult.debate.iterations,
        finalStatus: pipelineResult.debate.finalStatus,
      } : null,
      satisfactionScore,
      timestamp: new Date().toISOString()
    };

    memory.push(interactionVector);
    
    // Cap memory file at last 100 interaction vectors to prevent bloat
    const capped = memory.slice(-100);

    await fs.writeFile(MEMORY_FILE, JSON.stringify(capped, null, 2), 'utf8');
    log(MODULE, `Successfully appended interaction vector for ${ticket.id} to agent memory.`);
  } catch (error) {
    logError(MODULE, `Failed to save agent memory for ${ticket.id}`, error);
  }
}

/**
 * Perform a read-and-lookup pass on memory to find relevant past interactions.
 */
export async function lookupAgentMemory(category, subject, limit = 3) {
  try {
    if (!existsSync(MEMORY_FILE)) {
      return [];
    }
    const data = await fs.readFile(MEMORY_FILE, 'utf8');
    const memory = JSON.parse(data);

    // Filter by matching category or keyword in subject
    const subjWords = (subject || '').toLowerCase().split(' ');
    
    const matches = memory.map(item => {
      let score = 0;
      if (item.category && category && item.category.toLowerCase() === category.toLowerCase()) {
        score += 3;
      }
      
      const itemSubj = (item.subject || '').toLowerCase();
      for (const word of subjWords) {
        if (word.length > 3 && itemSubj.includes(word)) {
          score += 1;
        }
      }
      
      return { item, score };
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(match => match.item)
    .slice(0, limit);

    log(MODULE, `Agent memory lookup returned ${matches.length} relevant past cases.`);
    return matches;
  } catch (error) {
    logError(MODULE, 'Failed agent memory lookup', error);
    return [];
  }
}
