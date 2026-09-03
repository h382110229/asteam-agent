export interface ModelOption {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: ModelOption[];
  isCustom?: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'asteam-llmapi',
    name: 'ASteam LLMAPI',
    baseUrl: 'https://llmapi.ashawk.online/v1',
    defaultModel: 'Auto',
    models: [
      { id: 'Auto', name: 'Auto (推荐智能路由)', description: '自动根据任务复杂度路由至最佳引擎' },
      { id: 'mimo-v2.5-pro', name: 'mimo-v2.5-pro', description: '高并发多模态与代码推理' },
      { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro', description: '超长上下文工程分析' },
      { id: 'qwen-2.5-72b', name: 'qwen-2.5-72b', description: '通义千问开源旗舰代码模型' }
    ]
  },
  {
    id: 'deepseek-official',
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', name: 'deepseek-chat (V3)', description: '通用对话与代码' },
      { id: 'deepseek-coder', name: 'deepseek-coder', description: '高阶代码辅助' },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner (R1)', description: '深度推理链' }
    ]
  },
  {
    id: 'openai-official',
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'gpt-4o', description: '多模态旗舰模型' },
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini', description: '高性价比轻量模型' },
      { id: 'o1', name: 'o1', description: '高阶慢思考复杂推理' }
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

export interface AppSettings {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  openAtLogin: boolean;
  minimizeToTray: boolean;
  theme: 'light' | 'dark';
  enabledMcpTools: string[];
  enabledSkills: string[];
  customMcpConfig: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  providerId: 'asteam-llmapi',
  baseUrl: 'https://llmapi.ashawk.online/v1',
  apiKey: '',
  model: 'Auto',
  openAtLogin: false,
  minimizeToTray: true,
  theme: 'dark',
  enabledMcpTools: ['web_fetch', 'git_operations', 'system_inspector'],
  enabledSkills: ['office_word_report', 'office_excel_master', 'office_ppt_keynote', 'office_meeting_action', 'code_review', 'unit_test', 'git_commit_helper'],
  customMcpConfig: '{\n  "mcpServers": {}\n}'
};
