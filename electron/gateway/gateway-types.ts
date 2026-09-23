export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatToolFunction {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
}

export interface ChatToolDefinition {
  type: 'function';
  function: ChatToolFunction;
}

export interface ChatToolCallFunction {
  name: string;
  arguments: string; // JSON string
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: ChatToolCallFunction;
  index?: number;
}

export interface ContentPartText {
  type: 'text';
  text: string;
}

export interface ContentPartImageUrl {
  type: 'image_url';
  image_url: {
    url: string; // data:image/...;base64,... or http(s)://
    detail?: 'auto' | 'low' | 'high';
  };
}

export type ContentPart = ContentPartText | ContentPartImageUrl;

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
}

export interface GatewayRequestPayload {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  tools?: ChatToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  [key: string]: any;
}

export interface GatewayStreamCallbacks {
  onToken?: (token: string, type: 'content' | 'thought') => void;
  onToolCallChunk?: (toolCall: Partial<ChatToolCall>) => void;
  onSystemNotice?: (notice: string) => void;
}

export interface GatewayResponseResult {
  content: string;
  thought: string;
  toolCalls: ChatToolCall[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  rawResponse?: any;
}
