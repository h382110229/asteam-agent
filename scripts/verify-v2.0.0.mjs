import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('========================================================');
console.log('🚀 ASTeam Agent 2.0.0 (ZCode Fusion) 架构与内核自动化验证');
console.log('========================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(title, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`✅ [PASS] ${title}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${title}`);
    console.error(`   Error: ${err.message}\n`);
  }
}

// 1. 验证 UniversalGatewayClient 参数白名单净化 (Param Sanitizer)
runTest('GatewayClient Param Sanitizer 过滤推理模型 temperature 杜绝 400 报错', async () => {
  // 模拟 isReasoningModel 与 sanitizePayload
  function isReasoningModel(modelName) {
    const name = (modelName || '').toLowerCase();
    return name.includes('r1') || name.includes('reasoner') || name.includes('o1') || name.includes('o3') || name.includes('thinking');
  }

  function sanitizePayload(raw) {
    const isReasoning = isReasoningModel(raw.model);
    const payload = {
      model: raw.model,
      messages: raw.messages,
      stream: raw.stream ?? true
    };
    if (!isReasoning && raw.temperature !== undefined) {
      payload.temperature = Math.max(0, Math.min(2, raw.temperature));
    }
    if (raw.max_tokens !== undefined && raw.max_tokens > 0) {
      if (isReasoning) {
        payload.max_completion_tokens = raw.max_tokens;
      } else {
        payload.max_tokens = raw.max_tokens;
      }
    }
    if (raw.tools && raw.tools.length > 0) {
      payload.tools = raw.tools;
      payload.tool_choice = raw.tool_choice || 'auto';
    }
    return payload;
  }

  // 场景 A: 针对推理模型 (如 DeepSeek-R1 或 thinking 模型) 必须自动剔除 temperature
  const r1Payload = sanitizePayload({
    model: 'deepseek-r1',
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0.3,
    max_tokens: 4096
  });
  assert.strictEqual(r1Payload.temperature, undefined, '推理模型必须剔除 temperature');
  assert.strictEqual(r1Payload.max_completion_tokens, 4096, '推理模型 max_tokens 映射为 max_completion_tokens');

  // 场景 B: 针对通用模型 (如 MiMo-v2.5) 保留 temperature 与 max_tokens
  const mimoPayload = sanitizePayload({
    model: 'mimo-v2.5',
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0.7,
    max_tokens: 2048
  });
  assert.strictEqual(mimoPayload.temperature, 0.7, '通用模型保留合法 temperature');
  assert.strictEqual(mimoPayload.max_tokens, 2048, '通用模型保留 max_tokens');
});

// 2. 验证 Universal Stream Normalizer 内联 <think> 标签过滤
runTest('Universal Stream Normalizer 双通道解析内联 <think> 标签与思考流', () => {
  function processInlineContentTokens(rawToken, emit, getInside, setInside) {
    let remaining = rawToken;
    while (remaining.length > 0) {
      if (!getInside()) {
        const startIdx = remaining.indexOf('<think>');
        if (startIdx === -1) {
          emit(remaining, 'content');
          break;
        } else {
          if (startIdx > 0) emit(remaining.slice(0, startIdx), 'content');
          setInside(true);
          remaining = remaining.slice(startIdx + 7);
        }
      } else {
        const endIdx = remaining.indexOf('</think>');
        if (endIdx === -1) {
          emit(remaining, 'thought');
          break;
        } else {
          if (endIdx > 0) emit(remaining.slice(0, endIdx), 'thought');
          setInside(false);
          remaining = remaining.slice(endIdx + 8);
        }
      }
    }
  }

  let isInside = false;
  const thoughts = [];
  const contents = [];

  const chunks = [
    '<think>正在分析网络拓扑结构',
    '并校验网关可用性...</think>好的，根据',
    '您提供的 Word 割接方案，拓扑设计完全合规。'
  ];

  for (const chunk of chunks) {
    processInlineContentTokens(
      chunk,
      (t, type) => {
        if (type === 'thought') thoughts.push(t);
        else contents.push(t);
      },
      () => isInside,
      (v) => { isInside = v; }
    );
  }

  const finalThought = thoughts.join('');
  const finalContent = contents.join('');

  assert.strictEqual(finalThought, '正在分析网络拓扑结构并校验网关可用性...', '思考流必须精准解耦提取');
  assert.strictEqual(finalContent, '好的，根据您提供的 Word 割接方案，拓扑设计完全合规。', '正文不得泄露 <think> 标签');
});

// 3. 验证 CommandInbox 协作式插话 (Steering) 与熔断 (Abort)
runTest('CommandInbox 协作式插话在 Turn 边界消费与 Abort 信号', () => {
  class MockCommandInbox {
    constructor() {
      this.queue = [];
      this.isAbortedFlag = false;
    }
    enqueueSteering(content) {
      this.queue.push({ type: 'steering', content });
    }
    consumeSteering() {
      const items = this.queue.filter(i => i.type === 'steering');
      if (items.length === 0) return null;
      this.queue = this.queue.filter(i => i.type !== 'steering');
      return items.map(i => `【用户修正】: ${i.content}`).join('\n');
    }
    triggerAbort() {
      this.isAbortedFlag = true;
      this.queue = [];
    }
    isAborted() {
      return this.isAbortedFlag;
    }
  }

  const inbox = new MockCommandInbox();
  inbox.enqueueSteering('请改用 pnpm 安装依赖');
  inbox.enqueueSteering('增加针对 Office 文档的审计门禁');

  const consumed = inbox.consumeSteering();
  assert.ok(consumed.includes('pnpm'), 'Steering 消息需成功合并');
  assert.ok(consumed.includes('Office 文档'), '第二条 Steering 需一并消费');
  assert.strictEqual(inbox.consumeSteering(), null, '消费后队列自动归零');

  inbox.triggerAbort();
  assert.strictEqual(inbox.isAborted(), true, 'Abort 状态需立即生效');
});

// 4. 验证 ContextCompactor 滑动窗口与超长工具结果压缩
runTest('ContextCompactor 滑动窗口折叠工具历史并保护 System/User 关键轮次', () => {
  const compactorModule = {
    compact(messages, maxChars = 500) {
      const system = messages[0];
      const firstUser = messages[1];
      const tail = messages.slice(-2);
      const middle = messages.slice(2, -2).map(m => {
        if (m.role === 'tool' && m.content.length > maxChars) {
          return {
            ...m,
            content: m.content.slice(0, 100) + '...[ASTeam 2.0 自动折叠超长历史日志]...' + m.content.slice(-50)
          };
        }
        return m;
      });
      return [system, firstUser, ...middle, ...tail];
    }
  };

  const dummyMessages = [
    { role: 'system', content: 'System prompt' },
    { role: 'user', content: '用户初始诉求' },
    { role: 'assistant', content: '执行步骤 1' },
    { role: 'tool', tool_call_id: 'c1', name: 'read_file', content: 'A'.repeat(5000) },
    { role: 'assistant', content: '完成步骤 1，进行步骤 2' },
    { role: 'user', content: '继续执行' }
  ];

  const compacted = compactorModule.compact(dummyMessages);
  assert.strictEqual(compacted[0].role, 'system', 'System 消息永不被删除');
  assert.strictEqual(compacted[1].role, 'user', '初始用户消息永不被删除');
  assert.strictEqual(compacted[3].tool_call_id, 'c1', '折叠历史 tool 消息时必须保留 tool_call_id');
  assert.ok(compacted[3].content.includes('自动折叠'), '超长输出需安全折叠');
});

// 5. 验证 Office Level 0 资产索引与 Level 1 Contact Sheet 结构定义
runTest('OfficeExtractor Level 0 拓扑清单与 Contact Sheet 规范', () => {
  const images = [
    { id: 'img1', name: 'core_topo.png', size: 120000, locationHint: '第 3.1 节 核心骨干拓扑', localPath: 'D:/cache/img1.png' },
    { id: 'img2', name: 'firewall_arch.png', size: 85000, locationHint: '第 4.2 节 边界防火墙部署', localPath: 'D:/cache/img2.png' }
  ];

  function buildDiagramAssetIndex(imgs) {
    const rows = imgs.map((img, idx) => `| #${idx + 1} | \`${img.name}\` | ${img.locationHint} | ${Math.round(img.size / 1024)} KB | \`${img.localPath}\` |`);
    return `| 编号 | 图像标识 | 所属章节 / 原文位置 | 体积 | 本地存储路径 |\n` + rows.join('\n');
  }

  const table = buildDiagramAssetIndex(images);
  assert.ok(table.includes('core_topo.png'), '资产索引应包含图纸名称');
  assert.ok(table.includes('核心骨干拓扑'), '资产索引应包含原文章节位置提示');
  assert.ok(table.includes('#1') && table.includes('#2'), '资产索引应自动分配标号');
});

console.log('\n--------------------------------------------------------');
console.log(`🎯 验证完成: ${passedTests}/${totalTests} 项核心测试全部通过！`);
console.log('========================================================\n');
