# 企业级 LLM API 网关时间注入规范与 Prompt 模板指南

> **适用场景**：解决大语言模型（LLM）因缺乏物理硬件时钟、仅依赖预训练历史语料导致的回复时间戳倒流、年份猜测与排期错乱问题。  
> **适用网关**：LiteLLM, OneAPI, Dify, New-API, Apache APISIX, Kong 及自研 AI Gateway 中间件。

---

## 一、核心原理与根因说明

1. **大模型的物理时钟缺失**：
   大语言模型（如 DeepSeek-V3/R1、Claude 3.5、GPT-4o、Qwen 2.5 等）在推理时是一个无状态纯计算函数，其知识库截止于训练集构建时刻（例如 2023 或 2024 年）。模型自身**无法感知现实世界的流逝**。
2. **API 网关前置注入的必要性**：
   当不同业务线、不同智能体客户端（包括桌面端、Web端、自动化工作流）并发调用同一网关时，若各客户端没有统一注入时间，模型回复中就会出现 2023/2024 年等时间倒流幻觉。由企业 LLM 网关在代理转发层统一为请求的 `system` 提示词头部注入当前精确物理时间戳，是企业级基础设施最优雅、最彻底的治理方案。

---

## 二、标准注入 Prompt 模板

企业网关在收到客户端发送的 `messages` 数组时，建议在第一条 `{ role: "system" }` 消息的最前部（若无 system 消息则在头部插入一条）追加以下标准时间锚点：

```markdown
【企业运行环境与物理时钟锚点 (Gateway Injected)】
- 当前精确物理系统时间：{{current_datetime_local}} (时区: {{timezone_str}})
- 当前时间纪律与原则：
  1. 当前物理世界真实年份与日期以本时间为唯一基准；
  2. 严禁使用 2023、2024 或任何过去的预训练截止年份来推断今天；
  3. 所有生成的方案文档、代码版本标签、Git 提交记录、测试用例日志与分析报告，涉及时间戳或日期时，均严格以此当前时间为基准进行排期与记录。
```

### 实际示例填充渲染后：
```markdown
【企业运行环境与物理时钟锚点 (Gateway Injected)】
- 当前精确物理系统时间：2026-09-10 16:50:00 (时区: Asia/Shanghai / UTC+8)
- 当前时间纪律与原则：
  1. 当前物理世界真实年份与日期以本时间为唯一基准；
  2. 严禁使用 2023、2024 或任何过去的预训练截止年份来推断今天；
  3. 所有生成的方案文档、代码版本标签、Git 提交记录、测试用例日志与分析报告，涉及时间戳或日期时，均严格以此当前时间为基准进行排期与记录。
```

---

## 三、主流网关落地配置指引

### 1. LiteLLM Gateway (Python / Custom Callback)
在 LiteLLM 的 `custom_callbacks.py` 或预处理拦截器中增加：

```python
from litellm.integrations.custom_logger import CustomLogger
from datetime import datetime
import pytz

class TimeInjectionMiddleware(CustomLogger):
    def __init__(self, tz_name="Asia/Shanghai"):
        self.tz = pytz.timezone(tz_name)

    async def async_pre_call_hook(self, user_api_key_dict, cache_policy, messages, **kwargs):
        now_str = datetime.now(self.tz).strftime("%Y-%m-%d %H:%M:%S")
        time_prompt = (
            f"【企业运行环境与物理时钟锚点】\n"
            f"- 当前物理时间：{now_str} (Asia/Shanghai)\n"
            f"- 纪律要求：所有代码、文档与时间戳均严格以此为准，严禁猜测使用历史年份。\n\n"
        )
        # 寻找已有 system 消息或在首位插入
        for msg in messages:
            if msg.get("role") == "system":
                msg["content"] = time_prompt + msg.get("content", "")
                return messages

        messages.insert(0, {"role": "system", "content": time_prompt.strip()})
        return messages

# 挂载到 litellm_config.yaml:
# litellm_settings:
#   callbacks: ["custom_callbacks.TimeInjectionMiddleware"]
```

### 2. OneAPI / New-API (Go 源码中间件)
在 `controller/relay.go` 或 `middleware/distribute.go` 的 `buildChatRequest` 阶段：

```go
nowStr := time.Now().In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05")
timeNotice := fmt.Sprintf("【物理系统真实时间】: %s (UTC+8)。所有代码日志与回复均以此为准。\n\n", nowStr)

if len(textRequest.Messages) > 0 && textRequest.Messages[0].Role == "system" {
    textRequest.Messages[0].Content = timeNotice + textRequest.Messages[0].Content.(string)
} else {
    textRequest.Messages = append([]dto.Message{{
        Role: "system",
        Content: timeNotice,
    }}, textRequest.Messages...)
}
```

### 3. APISIX / Kong (Lua 插件)
在 `access` 阶段解析 JSON 请求体：
```lua
local core = require("apisix.core")
local date_str = os.date("%Y-%m-%d %H:%M:%S")
-- 向 req_body.messages 中注入 system 提示词
```

---

## 四、双保险机制（客户端 + 网关协同）

ASTeam Agent 客户端在 **v1.7.1** 内核中已实现客户端侧的系统时间前置注入（兜底保底机制）。若企业 LLM 网关也开启了上述前置注入，双层时间戳将高度一致，确保大模型输出绝对不会出现年份倒流或时间错乱。
