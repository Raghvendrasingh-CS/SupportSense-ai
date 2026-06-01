// Centralized environment configuration with DEMO_MODE detection.
// All secrets read from process.env — never hardcoded.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const demoMode = process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';

export const config = {
  demoMode,
  port: parseInt(process.env.PORT || '3001', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  azure: {
    tenantId: process.env.AZURE_TENANT_ID || '',
    clientId: process.env.AZURE_CLIENT_ID || '',
    clientSecret: process.env.AZURE_CLIENT_SECRET || '',
  },
  fabric: {
    workspaceId: process.env.FABRIC_WORKSPACE_ID || '',
    lakehouseId: process.env.FABRIC_LAKEHOUSE_ID || '',
  },
  workIQ: {
    endpoint: process.env.WORK_IQ_ENDPOINT || '',
    apiKey: process.env.WORK_IQ_API_KEY || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  azureOpenai: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
    apiKey: process.env.AZURE_OPENAI_KEY || '',
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
  },
  teams: {
    webhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
  }
};

export function hasTeamsWebhook() {
  return Boolean(config.teams.webhookUrl);
}

export function hasMicrosoftCredentials() {
  return Boolean(
    config.azure.tenantId &&
    config.azure.clientId &&
    config.azure.clientSecret
  );
}

export function hasFabricCredentials() {
  return Boolean(config.fabric.workspaceId && config.fabric.lakehouseId);
}

export function hasWorkIQCredentials() {
  return Boolean(config.workIQ.endpoint && config.workIQ.apiKey);
}

export function getIntegrationStatus() {
  return {
    microsoftGraph: hasMicrosoftCredentials() ? 'live' : 'mock',
    fabricIQ: hasFabricCredentials() ? 'live' : 'mock',
    workIQ: hasWorkIQCredentials() ? 'live' : 'mock',
    openAI: hasOpenAICredentials() ? 'live' : 'mock',
  };
}

export function hasOpenAICredentials() {
  return Boolean(config.openai.apiKey || (config.azureOpenai.endpoint && config.azureOpenai.apiKey));
}

export function isHybridMode() {
  return config.demoMode === true && hasOpenAICredentials() === true;
}

export const AI_MODE = hasOpenAICredentials() ? 'llm' : 'rules';
