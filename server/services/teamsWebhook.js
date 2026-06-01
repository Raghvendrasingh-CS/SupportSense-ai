import { config } from '../config/env.js';
import { log, logError, measureStart, measureEnd } from '../utils/logger.js';

const MODULE = 'TeamsWebhook';

export async function sendAdaptiveCardToTeams(adaptiveCard, fallbackText = 'SupportSense AI Notification') {
  const startMs = measureStart();
  try {
    if (!config.teams.webhookUrl) {
      log(MODULE, 'No Teams webhook URL configured — skipping Teams notification');
      return { success: false, reason: 'no_webhook_url', source: 'mock', processingTimeMs: measureEnd(startMs) };
    }

    const payload = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: adaptiveCard,
        },
      ],
    };

    const response = await fetch(config.teams.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Teams webhook failed: ${response.status} ${response.statusText}`);
    }

    log(MODULE, 'Adaptive Card sent to Teams successfully');
    return { success: true, source: 'teams-webhook', processingTimeMs: measureEnd(startMs) };
  } catch (error) {
    logError(MODULE, 'sendAdaptiveCardToTeams failed', error);
    return { success: false, error: error.message, source: 'teams-webhook-error', processingTimeMs: measureEnd(startMs) };
  }
}
