// Model configuration for OpenAI Realtime models only
export type AIProvider = 'openai';
export type OpenAIModel =
  | 'gpt-realtime'
  | 'gpt-realtime-mini'
  | 'gpt-4o-realtime-preview'
  | 'gpt-4o-mini-realtime-preview';

export interface ModelConfig {
  provider: AIProvider;
  model: string;
  name: string;
  description: string;
  audioFormat: {
    input: string;
    output: string;
    sampleRate: number;
  };
  maxSessionDuration?: number; // minutes
  supportsTools: boolean;
  supportsInterruption: boolean;
  supportsVAD: boolean;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    provider: 'openai',
    model: 'gpt-realtime',
    name: 'GPT Realtime',
    description: 'OpenAI GPT Realtime (4o-based) interactive voice agent with low-latency streaming',
    audioFormat: {
      input: 'g711_ulaw',
      output: 'g711_ulaw',
      sampleRate: 8000
    },
    supportsTools: true,
    supportsInterruption: true,
    supportsVAD: true
  },
  {
    provider: 'openai',
    model: 'gpt-realtime-mini',
    name: 'GPT Realtime Mini',
    description: 'Smaller, faster GPT Realtime sibling tuned for cost efficiency',
    audioFormat: {
      input: 'g711_ulaw',
      output: 'g711_ulaw',
      sampleRate: 8000
    },
    supportsTools: true,
    supportsInterruption: true,
    supportsVAD: true
  },
  {
    provider: 'openai',
    model: 'gpt-4o-realtime-preview',
    name: 'GPT-4o Realtime Preview',
    description: 'Latest GPT-4o realtime preview build direct from OpenAI',
    audioFormat: {
      input: 'g711_ulaw',
      output: 'g711_ulaw',
      sampleRate: 8000
    },
    supportsTools: true,
    supportsInterruption: true,
    supportsVAD: true
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini-realtime-preview',
    name: 'GPT-4o Mini Realtime Preview',
    description: 'Latest GPT-4o Mini realtime preview build',
    audioFormat: {
      input: 'g711_ulaw',
      output: 'g711_ulaw',
      sampleRate: 8000
    },
    supportsTools: true,
    supportsInterruption: true,
    supportsVAD: true
  }
];

export const DEFAULT_MODEL: ModelConfig = AVAILABLE_MODELS[0]; // GPT Realtime

export function getModelConfig(provider: AIProvider, model: string): ModelConfig | null {
  return AVAILABLE_MODELS.find(m => m.provider === provider && m.model === model) || null;
}

export function getModelsByProvider(provider: AIProvider): ModelConfig[] {
  return AVAILABLE_MODELS.filter(m => m.provider === provider);
}

export function getModelById(id: string): ModelConfig | null {
  const [provider, model] = id.split(':');
  return getModelConfig(provider as AIProvider, model);
}

export function getModelId(config: ModelConfig): string {
  return `${config.provider}:${config.model}`;
}

// Audio format conversion utilities
export function needsAudioConversion(fromFormat: string, toFormat: string): boolean {
  return fromFormat !== toFormat;
}
