export type ModelCapability =
  | 'text'
  | 'vision'
  | 'reasoning'
  | 'tools'
  | 'image_gen'
  | 'video_gen'
  | 'audio_asr'
  | 'audio_tts'
  | 'embedding';

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
    return [
      'text',
      'vision',
      'reasoning',
      'tools',
      'image_gen',
      'video_gen',
      'audio_asr',
      'audio_tts',
      'embedding'
    ];
  }

  const caps: ModelCapability[] = ['text'];

  if (name.includes('vision') || name.includes('vl') || name.includes('4o') || name.includes('gemini') || name.includes('claude-3') || name.includes('omni') || name.includes('mimo')) {
    caps.push('vision');
  }

  if (name.includes('r1') || name.includes('reasoner') || name.includes('o1') || name.includes('o3') || name.includes('ultra') || name.includes('super')) {
    caps.push('reasoning');
  }

  if (name.includes('dall-e') || name.includes('flux') || name.includes('sd') || name.includes('image')) {
    caps.push('image_gen');
  }

  if (name.includes('video') || name.includes('sora') || name.includes('kling') || name.includes('runway')) {
    caps.push('video_gen');
  }

  if (name.includes('asr') || name.includes('whisper') || name.includes('transcribe')) {
    caps.push('audio_asr');
  }

  if (name.includes('tts') || name.includes('speech') || name.includes('voice')) {
    caps.push('audio_tts');
  }

  if (name.includes('embedding') || name.includes('embed')) {
    caps.push('embedding');
  }

  // 大多数现代模型支持工具调用
  if (!name.includes('embedding') && !name.includes('rerank') && !name.includes('tts') && !name.includes('asr') && !name.includes('image') && !name.includes('video')) {
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
      { id: 'Auto', name: 'Auto (网关智能动态路由 · 推荐)', description: '网关根据任务复杂度与可用性自动调度最优模型（全模态支持：对话/代码/生图/视频/语音/向量）', capabilities: ['text', 'vision', 'reasoning', 'tools', 'image_gen', 'video_gen', 'audio_asr', 'audio_tts', 'embedding'] },
      { id: 'mimo-v2.5-pro', name: 'mimo-v2.5-pro (MiMo 旗舰)', description: '高并发多模态与深度代码推理，TokenPlan 首选', capabilities: ['text', 'vision', 'reasoning', 'tools'] },
      { id: 'mimo-v2.5', name: 'mimo-v2.5 (MiMo 平衡版)', description: '高性价比通用多模态对话模型', capabilities: ['text', 'vision', 'tools'] },
      { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash (联网搜索)', description: '原生支持 Google Search Grounding 实时联网搜索', capabilities: ['text', 'vision', 'tools'] },
      { id: 'gemini-2.5-flash-lite', name: 'gemini-2.5-flash-lite (轻量搜索)', description: '轻量低延迟，支持 Google 搜索接地', capabilities: ['text', 'vision', 'tools'] },
      { id: 'gemini-3.5-flash', name: 'gemini-3.5-flash (Gemini 极速)', description: '新一代极速全模态感知与代码', capabilities: ['text', 'vision', 'tools'] },
      { id: 'gemini-3.5-flash-lite', name: 'gemini-3.5-flash-lite', description: '高吞吐超低延迟模型', capabilities: ['text', 'vision', 'tools'] },
      { id: 'gemini-3.7-flash', name: 'gemini-3.7-flash (思考推理)', description: '支持 Thinking 思考推理与全模态', capabilities: ['text', 'vision', 'reasoning', 'tools'] },
      { id: 'gemini-3.8-flash', name: 'gemini-3.8-flash', description: '最新预览旗舰多模态', capabilities: ['text', 'vision', 'tools'] },
      { id: 'gemma-4-31b-it', name: 'gemma-4-31b-it (开源旗舰)', description: 'Google Gemma 4 开源顶尖指令微调模型', capabilities: ['text', 'reasoning', 'tools'] },
      { id: 'gemma-4-26b-a4b-it', name: 'gemma-4-26b-a4b-it', description: 'Gemma 4 轻量指令优化模型', capabilities: ['text', 'tools'] },
      { id: 'nemotron-3-ultra-550b', name: 'nemotron-3-ultra-550b', description: '英伟达 550B 超大规模深度推理模型', capabilities: ['text', 'reasoning', 'tools'] },
      { id: 'nemotron-3-super-120b', name: 'nemotron-3-super-120b', description: '英伟达 120B 级高阶逻辑推理', capabilities: ['text', 'reasoning', 'tools'] },
      { id: 'nemotron-3.5-lightning-30b', name: 'nemotron-3.5-lightning-30b', description: '闪电极速推理与函数调用', capabilities: ['text', 'tools'] },
      { id: 'nemotron-3-nano-omni-30b', name: 'nemotron-3-nano-omni-30b', description: '全模态实时端侧推理', capabilities: ['text', 'vision', 'tools'] },
      { id: 'groq-gpt-oss-120b', name: 'groq-gpt-oss-120b (超高速)', description: 'Groq 硬件加速开源大模型', capabilities: ['text', 'tools'] },
      { id: 'groq-qwen3.8-27b', name: 'groq-qwen3.8-27b', description: '通义千问 Groq 极速部署版', capabilities: ['text', 'tools'] },
      { id: 'agnes-image-2.1-flash', name: 'agnes-image-2.1-flash (图像生成)', description: '文生图、图生图与多图合成（720P/1K/2K）', capabilities: ['image_gen'] },
      { id: 'agnes-video-2.5-flash', name: 'agnes-video-2.5-flash (视频生成)', description: '文生视频、首尾帧控制（720P/1080P）', capabilities: ['video_gen'] },
      { id: 'agnes-video-2.5', name: 'agnes-video-2.5', description: '长镜头与画质增强视频生成', capabilities: ['video_gen'] },
      { id: 'gemini-embedding-2', name: 'gemini-embedding-2 (3072维向量)', description: '高维向量嵌入，适合知识库与 RAG 语义索引', capabilities: ['embedding'] },
      { id: 'gemini-embedding-1', name: 'gemini-embedding-1 (标准向量)', description: '标准文本语义嵌入向量', capabilities: ['embedding'] },
      { id: 'mimo-v2.5-asr', name: 'mimo-v2.5-asr (语音识别)', description: '高精度语音转文字，支持多语言与标点恢复', capabilities: ['audio_asr'] },
      { id: 'groq-whisper-large-v3', name: 'groq-whisper-large-v3', description: 'Whisper 极致低延迟语音转录', capabilities: ['audio_asr'] },
      { id: 'mimo-v2.5-tts', name: 'mimo-v2.5-tts (语音合成)', description: '自然多音色文本转语音合成', capabilities: ['audio_tts'] },
      { id: 'mimo-v2.5-tts-voicedesign', name: 'mimo-v2.5-tts-voicedesign', description: '自定义声音设计与情感渲染', capabilities: ['audio_tts'] },
      { id: 'mimo-v2.5-tts-voiceclone', name: 'mimo-v2.5-tts-voiceclone', description: '高仿真小样本声音克隆', capabilities: ['audio_tts'] },
      { id: 'deepseek-chat', name: 'deepseek-chat (DeepSeek V3)', description: '旗舰级代码生成与方案设计，高稳定性', capabilities: ['text', 'tools'] },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner (DeepSeek R1)', description: '深度思考与慢逻辑推理链', capabilities: ['text', 'reasoning', 'tools'] }
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
  enabledMcpTools: ['web_search', 'web_fetch', 'git_operations', 'system_inspector'],
  enabledSkills: ['office_word_report', 'office_excel_master', 'office_ppt_keynote', 'office_meeting_action', 'code_review', 'unit_test', 'git_commit_helper'],
  customMcpConfig: '{\n  "mcpServers": {}\n}',
  fallbackProviders: DEFAULT_FALLBACK_PRESETS
};
