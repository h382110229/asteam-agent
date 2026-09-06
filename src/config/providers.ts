export type ModelCapability = 'text' | 'vision' | 'reasoning' | 'tools' | 'image_gen';

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  capabilities?: ModelCapability[];
}

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: ModelOption[];
  isCustom?: boolean;
}

export function inferModelCapabilities(modelName: string): ModelCapability[] {
  if (!modelName) return ['text', 'tools'];
  const name = modelName.toLowerCase();

  // LLMAPI 网关动态路由 (Auto) 具备全模态自适应调度能力
  if (name === 'auto' || name.startsWith('auto')) {
    return ['text', 'vision', 'reasoning', 'tools', 'image_gen'];
  }

  const caps: ModelCapability[] = ['text'];

  if (name.includes('vision') || name.includes('vl') || name.includes('4o') || name.includes('gemini') || name.includes('claude-3') || name.includes('omni') || name.includes('mimo')) {
    caps.push('vision');
  }

  if (name.includes('r1') || name.includes('reasoner') || name.includes('o1') || name.includes('o3')) {
    caps.push('reasoning');
  }

  if (name.includes('dall-e') || name.includes('flux') || name.includes('sd') || name.includes('image')) {
    caps.push('image_gen');
  }

  // 大多数现代模型支持工具调用
  if (!name.includes('embedding') && !name.includes('rerank')) {
    caps.push('tools');
  }

  return Array.from(new Set(caps));
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'asteam-llmapi',
    name: 'ASteam LLMAPI',
    baseUrl: 'https://llmapi.ashawk.online/v1',
    defaultModel: 'Auto',
    models: [
      { id: 'Auto', name: 'Auto (网关智能动态路由 · 推荐)', description: '网关根据任务复杂度与可用性自动调度最优模型（全模态支持）', capabilities: ['text', 'vision', 'reasoning', 'tools', 'image_gen'] },
      { id: 'deepseek-chat', name: 'deepseek-chat (DeepSeek V3)', description: '旗舰级代码生成与方案设计，高稳定性', capabilities: ['text', 'tools'] },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner (DeepSeek R1)', description: '深度思考与慢逻辑推理链', capabilities: ['text', 'reasoning', 'tools'] },
      { id: 'qwen-2.5-72b', name: 'qwen-2.5-72b', description: '通义千问开源旗舰代码模型', capabilities: ['text', 'tools'] },
      { id: 'mimo-v2.5-pro', name: 'mimo-v2.5-pro', description: '高并发多模态与代码推理', capabilities: ['text', 'vision', 'tools'] },
      { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro', description: '超长上下文工程与多模态分析', capabilities: ['text', 'vision', 'tools'] }
    ]
  },
  {
    id: 'deepseek-official',
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', name: 'deepseek-chat (V3)', description: '通用对话与代码', capabilities: ['text', 'tools'] },
      { id: 'deepseek-coder', name: 'deepseek-coder', description: '高阶代码辅助', capabilities: ['text', 'tools'] },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner (R1)', description: '深度推理链', capabilities: ['text', 'reasoning', 'tools'] }
    ]
  },
  {
    id: 'openai-official',
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'gpt-4o', description: '多模态旗舰模型', capabilities: ['text', 'vision', 'tools'] },
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini', description: '高性价比轻量多模态模型', capabilities: ['text', 'vision', 'tools'] },
      { id: 'o1', name: 'o1', description: '高阶慢思考复杂推理', capabilities: ['text', 'reasoning', 'tools'] }
    ]
  },
  {
    id: 'custom',
    name: '自定义供应商 (Custom)',
    baseUrl: '',
    defaultModel: '',
    models: [],
    isCustom: true
  }
];

export interface FallbackProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  capabilities?: ModelCapability[];
}

export interface AppSettings {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  streamResponse?: boolean; // 流式响应传输模式 (默认 true)
  openAtLogin: boolean;
  minimizeToTray: boolean;
  theme: 'light' | 'dark';
  enabledMcpTools: string[];
  enabledSkills: string[];
  customMcpConfig: string;
  // v1.3.0 新增: 存储中枢自定义数据目录与多服务商容灾备用池
  dataRootDir?: string;
  fallbackProviders?: FallbackProviderConfig[];
}

export const DEFAULT_FALLBACK_PRESETS: FallbackProviderConfig[] = [
  {
    id: 'fb-siliconflow',
    name: '硅基流动 (DeepSeek-V3 备用线路)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    model: 'deepseek-ai/DeepSeek-V3',
    enabled: false,
    capabilities: ['text', 'tools']
  },
  {
    id: 'fb-deepseek',
    name: 'DeepSeek 官方直连 (备用线路)',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    enabled: false,
    capabilities: ['text', 'tools']
  },
  {
    id: 'fb-multimodal',
    name: 'OpenAI / Gemini 兼容 (视觉多模态备用)',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    enabled: false,
    capabilities: ['text', 'vision', 'tools']
  },
  {
    id: 'fb-ollama',
    name: '本地 Ollama (离线备用)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
    model: 'deepseek-r1:7b',
    enabled: false,
    capabilities: ['text', 'reasoning', 'tools']
  }
];

export const DEFAULT_SETTINGS: AppSettings = {
  providerId: 'asteam-llmapi',
  baseUrl: 'https://llmapi.ashawk.online/v1',
  apiKey: '',
  model: 'Auto',
  streamResponse: true,
  openAtLogin: false,
  minimizeToTray: true,
  theme: 'light',
  enabledMcpTools: ['web_fetch', 'git_operations', 'system_inspector'],
  enabledSkills: ['office_word_report', 'office_excel_master', 'office_ppt_keynote', 'office_meeting_action', 'code_review', 'unit_test', 'git_commit_helper'],
  customMcpConfig: '{\n  "mcpServers": {}\n}',
  fallbackProviders: DEFAULT_FALLBACK_PRESETS
};
