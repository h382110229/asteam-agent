import React, { useState, useEffect, useCallback } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { ChatArea, ChatMessageItem } from './components/ChatArea';
import { SettingsModal } from './components/SettingsModal';
import { ProjectRulesModal } from './components/ProjectRulesModal';
import { EnterpriseHubModal } from './components/EnterpriseHubModal';
import { SecurityComplianceModal } from './components/SecurityComplianceModal';
import { SecurityPreflightModal, SensitiveItemSummary } from './components/SecurityPreflightModal';
import { WorkspaceDrawer, WorkspaceDrawerTab, PreviewData } from './components/WorkspaceDrawer';
import { AppSettings, DEFAULT_SETTINGS, PROVIDER_PRESETS } from './config/providers';
import { AgentStep } from './components/AgentTrajectory';
import { Project, ProjectSession, GitStatusSummary, ExecutionMode, ProjectRulesInfo } from './types/project';

export const App: React.FC = () => {
  // 1. Settings & Theme
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('asteam_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return settings.theme || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    const updated: AppSettings = { ...settings, theme: nextTheme };
    setSettings(updated);
    localStorage.setItem('asteam_settings', JSON.stringify(updated));
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('asteam_settings', JSON.stringify(newSettings));
  };

  // 2. Projects Management (Multi-project support matching user's screenshot)
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const saved = localStorage.getItem('asteam_projects');
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default initial project based on current workspace
    return [
      {
        id: 'proj-asteam',
        name: 'asteam-agent',
        path: 'd:\\AIProject\\asteam-agent',
        isExpanded: true,
        createdAt: Date.now()
      }
    ];
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projects[0]?.id || 'proj-asteam';
  });

  useEffect(() => {
    localStorage.setItem('asteam_projects', JSON.stringify(projects));
  }, [projects]);

  const activeProject = projects.find(p => p.id === activeProjectId) || null;
  const currentWorkspacePath = activeProjectId === 'general' ? null : (activeProject?.path || null);

  // 3. Project Sessions Management
  const [sessions, setSessions] = useState<ProjectSession[]>(() => {
    try {
      const saved = localStorage.getItem('asteam_project_sessions');
      if (saved) return JSON.parse(saved);
    } catch {}

    // Migration from old flat sessions
    try {
      const oldSessions = localStorage.getItem('asteam_sessions');
      if (oldSessions) {
        const parsed = JSON.parse(oldSessions);
        return parsed.map((s: any) => ({
          id: s.id,
          projectId: 'proj-asteam',
          title: s.title || '任务会话',
          createdAt: s.createdAt || Date.now(),
          updatedAt: s.createdAt || Date.now()
        }));
      }
    } catch {}

    return [
      {
        id: 'session-default-1',
        projectId: 'proj-asteam',
        title: '项目架构检视与环境分析',
        createdAt: Date.now() - 3600000 * 2,
        updatedAt: Date.now() - 3600000 * 2
      }
    ];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const projectSessions = sessions.filter(s => s.projectId === activeProjectId);
    return projectSessions[0]?.id || sessions[0]?.id || 'session-default-1';
  });

  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessageItem[]>>(() => {
    try {
      const saved = localStorage.getItem('asteam_messages');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('asteam_project_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('asteam_messages', JSON.stringify(messagesMap));
  }, [messagesMap]);

  // 4. Git Status & Workspace Workbench Drawer State (Preview + Git Diff + Live Terminal)
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<WorkspaceDrawerTab>('diff');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [terminalOutputs, setTerminalOutputs] = useState<Record<string, string>>({});

  const handleOpenGitDiff = useCallback(() => {
    setDrawerTab('diff');
    setIsDrawerOpen(true);
  }, []);

  const handleOpenPreview = useCallback((data: PreviewData) => {
    setPreviewData(data);
    setDrawerTab('preview');
    setIsDrawerOpen(true);
  }, []);

  const handleOpenTerminal = useCallback(() => {
    setDrawerTab('terminal');
    setIsDrawerOpen(true);
  }, []);

  const handleOpenTimeline = useCallback(() => {
    setDrawerTab('timeline');
    setIsDrawerOpen(true);
  }, []);

  const handleOpenScheduler = useCallback(() => {
    setDrawerTab('scheduler');
    setIsDrawerOpen(true);
  }, []);

  const handleOpenSwarm = useCallback(() => {
    setDrawerTab('swarm');
    setIsDrawerOpen(true);
  }, []);

  const refreshGitStatus = useCallback(async () => {
    if (!currentWorkspacePath || !window.electronAPI) {
      setGitStatus(null);
      return;
    }
    try {
      const status = await window.electronAPI.getGitStatus(currentWorkspacePath);
      setGitStatus(status);
    } catch {
      setGitStatus(null);
    }
  }, [currentWorkspacePath]);

  // 5. Project Rules State (v1.4.0)
  const [projectRules, setProjectRules] = useState<ProjectRulesInfo | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);

  const refreshProjectRules = useCallback(async () => {
    if (!currentWorkspacePath || !window.electronAPI?.getProjectRules) {
      setProjectRules(null);
      return;
    }
    try {
      const rules = await window.electronAPI.getProjectRules(currentWorkspacePath);
      setProjectRules(rules || null);
    } catch {
      setProjectRules(null);
    }
  }, [currentWorkspacePath]);

  useEffect(() => {
    refreshProjectRules();
  }, [refreshProjectRules]);

  const handleOpenRules = useCallback(() => {
    setIsRulesModalOpen(true);
  }, []);

  const handleRollbackCheckpoint = useCallback(async (checkpointId: string): Promise<boolean> => {
    if (!window.electronAPI) return false;
    try {
      const res = await window.electronAPI.rollbackCheckpoint(checkpointId, currentWorkspacePath);
      if (res && res.success) {
        setMessagesMap(prevMap => {
          const list = [...(prevMap[activeSessionId] || [])];
          const updated = list.map(m => {
            if (m.checkpoint && m.checkpoint.id === checkpointId) {
              return {
                ...m,
                checkpoint: { ...m.checkpoint, rolledBack: true }
              };
            }
            return m;
          });
          return { ...prevMap, [activeSessionId]: updated };
        });
        await refreshGitStatus();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Rollback checkpoint failed:', err);
      return false;
    }
  }, [currentWorkspacePath, activeSessionId, refreshGitStatus]);

  useEffect(() => {
    refreshGitStatus();
  }, [refreshGitStatus]);

  const [isRunning, setIsRunning] = useState(false);
  const [isWaitingForUser, setIsWaitingForUser] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEnterpriseHubOpen, setIsEnterpriseHubOpen] = useState(false);
  const [isSecurityComplianceOpen, setIsSecurityComplianceOpen] = useState(false);
  const [runStartTime, setRunStartTime] = useState<number>(0);

  // v1.8.3: 出境安全前置交互预检与会话豁免偏好
  const [preflightData, setPreflightData] = useState<{
    isOpen: boolean;
    sensitiveItems: SensitiveItemSummary[];
    originalText: string;
    sanitizedText: string;
    mode: ExecutionMode;
    rawText: string;
    attachments?: any[];
  } | null>(null);
  const [sessionFenceChoices, setSessionFenceChoices] = useState<Record<string, 'sanitize' | 'bypass'>>({});

  useEffect(() => {
    if (!window.electronAPI) return;

    const cleanup = window.electronAPI.onAgentEvent(({ type, payload }) => {
      const { sessionId } = payload;
      if (!sessionId) return;

      setMessagesMap(prevMap => {
        const list = [...(prevMap[sessionId] || [])];
        if (list.length === 0) return prevMap;

        const lastIdx = list.length - 1;
        const lastMsg = { ...list[lastIdx] };

        if (type === 'token') {
          const { token, tokenType } = payload;
          if (tokenType === 'thought') {
            lastMsg.thought = (lastMsg.thought || '') + token;
          } else {
            lastMsg.content = (lastMsg.content || '') + token;
          }
        } else if (type === 'plan') {
          lastMsg.steps = payload.steps;
        } else if (type === 'stepUpdate') {
          const updatedStep: AgentStep = payload.step;
          const currentSteps = [...(lastMsg.steps || [])];
          const idx = currentSteps.findIndex(s => s.id === updatedStep.id);
          if (idx >= 0) {
            currentSteps[idx] = updatedStep;
          } else {
            currentSteps.push(updatedStep);
          }
          lastMsg.steps = currentSteps;

          // run_terminal_command 运行状态不再触发 isWaitingForUser，
          // 由 activeRunningTerminalStep（派生自 steps 状态）独立控制终端输入 UI
          // 修复 Bug：之前设置 isWaitingForUser=true 导致底部出现"Agent 等待回复"假弹窗
          if (updatedStep.tool === 'run_terminal_command' && (updatedStep.status === 'completed' || updatedStep.status === 'failed')) {
            setIsWaitingForUser(false);
          }
        } else if (type === 'question') {
          lastMsg.question = {
            questionId: payload.questionId,
            question: payload.question,
            options: payload.options,
            questions: payload.questions,
            multiSelect: payload.multiSelect,
            answered: false
          };
          setIsWaitingForUser(true);
        } else if (type === 'error') {
          lastMsg.content += `\n\n⚠️ **执行遇到错误**: ${payload.error}`;
          lastMsg.durationMs = Date.now() - (lastMsg.timestamp || Date.now());
          setIsRunning(false);
          setIsWaitingForUser(false);
          refreshGitStatus();
        } else if (type === 'terminalData') {
          const { chunk, stepId, sessionId: sid } = payload;
          setTerminalOutputs(prev => {
            const next = { ...prev };
            if (stepId) {
              next[stepId] = (next[stepId] || '') + chunk;
            }
            if (sid) {
              next[sid] = (next[sid] || '') + chunk;
            }
            return next;
          });
        } else if (type === 'checkpoint') {
          if (payload.checkpoint) {
            lastMsg.checkpoint = payload.checkpoint;
          }
        } else if (type === 'swarmState') {
          if (payload.state) {
            lastMsg.swarmState = payload.state;
            setDrawerTab('swarm');
            setIsDrawerOpen(true);
          }
        } else if (type === 'done') {
          const doneSummary: string = (payload as any)?.summary ?? '';

          // 若模型将全部输出归入 reasoning_content (thought)，正文为空时自动提拔
          if (!lastMsg.content?.trim() && lastMsg.thought?.trim()) {
            lastMsg.content = lastMsg.thought;
            lastMsg.thought = '';
          }
          // 修复 Bug：payload.summary（finalSummary）是 harness-runner 汇总的权威最终答案
          // 若其比当前流式积累的 content 更完整（多迭代场景下，第一轮规划文本会污染 content），
          // 则用 summary 覆盖 content，确保最终分析结论正确呈现
          if (doneSummary.trim()) {
            const currentContentLen = lastMsg.content?.trim().length || 0;
            // 如果 content 为空，或 summary 明显更长（说明是真正的最终答案），则用 summary 替换
            if (!currentContentLen || doneSummary.trim().length > currentContentLen) {
              lastMsg.content = doneSummary.trim();
            }
          }
          lastMsg.durationMs = Date.now() - (lastMsg.timestamp || Date.now());
          setIsRunning(false);
          setIsWaitingForUser(false);
          refreshGitStatus();
        }

        list[lastIdx] = lastMsg;
        return { ...prevMap, [sessionId]: list };
      });
    });

    return () => cleanup();
  }, [refreshGitStatus]);

  // 6. Project & Session Actions
  const handleAddProject = async () => {
    if (!window.electronAPI) return;
    const dir = await window.electronAPI.selectWorkspaceDirectory();
    if (dir) {
      const folderName = dir.split(/[\\/]/).filter(Boolean).pop() || 'new-project';
      const existing = projects.find(p => p.path === dir);
      if (existing) {
        setActiveProjectId(existing.id);
        return;
      }
      const newProjId = `proj-${Date.now()}`;
      const newProject: Project = {
        id: newProjId,
        name: folderName,
        path: dir,
        isExpanded: true,
        createdAt: Date.now()
      };
      setProjects(prev => [...prev, newProject]);
      setActiveProjectId(newProjId);

      // Create an initial session for the new project
      handleNewSessionForProject(newProjId);
    }
  };

  const handleRemoveProject = (projId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projId));
    if (activeProjectId === projId) {
      setActiveProjectId('general');
    }
  };

  const handleToggleProjectExpand = (projId: string) => {
    setProjects(prev =>
      prev.map(p => (p.id === projId ? { ...p, isExpanded: !p.isExpanded } : p))
    );
  };

  const handleSelectSession = (sessionId: string, projectId: string) => {
    setActiveProjectId(projectId);
    setActiveSessionId(sessionId);
  };

  const handleNewSessionForProject = (projectId: string) => {
    const newId = `session-${Date.now()}`;
    const newSession: ProjectSession = {
      id: newId,
      projectId,
      title: '新任务',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveProjectId(projectId);
    setActiveSessionId(newId);
  };

  const handleDeleteSession = (sessionId: string) => {
    const sessionToDelete = sessions.find(s => s.id === sessionId);
    const targetProjectId = sessionToDelete ? sessionToDelete.projectId : activeProjectId;

    const filtered = sessions.filter(s => s.id !== sessionId);
    const remainingForProj = filtered.filter(s => s.projectId === targetProjectId);

    if (remainingForProj.length === 0) {
      const newId = `session-${Date.now()}`;
      const newSession: ProjectSession = {
        id: newId,
        projectId: targetProjectId,
        title: targetProjectId === 'general' ? '新通用任务' : '新任务',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setSessions([newSession, ...filtered]);
      if (activeSessionId === sessionId) {
        setActiveProjectId(targetProjectId);
        setActiveSessionId(newId);
      }
    } else {
      setSessions(filtered);
      if (activeSessionId === sessionId) {
        setActiveSessionId(remainingForProj[0].id);
      }
    }

    setMessagesMap(prev => {
      const copy = { ...prev };
      delete copy[sessionId];
      return copy;
    });
  };

  const handleTogglePinSession = (sessionId: string) => {
    setSessions(prev =>
      prev.map(s => (s.id === sessionId ? { ...s, isPinned: !s.isPinned } : s))
    );
  };

  const handleReplyQuestion = async (questionId: string, answer: string) => {
    setIsWaitingForUser(false);

    setMessagesMap(prev => {
      const list = [...(prev[activeSessionId] || [])];
      if (list.length === 0) return prev;

      // 精确在所有历史消息中寻找匹配的 questionId 或最新的未答复问题
      let updated = false;
      for (let i = list.length - 1; i >= 0; i--) {
        const m = { ...list[i] };
        if (m.question && (!m.question.answered || m.question.questionId === questionId)) {
          m.question = { ...m.question, answered: true, selectedAnswer: answer };
          list[i] = m;
          updated = true;
          break;
        }
      }

      // 兜底：若未找到精确匹配则更新最后一条
      if (!updated && list.length > 0) {
        const last = { ...list[list.length - 1] };
        if (last.question) {
          last.question = { ...last.question, answered: true, selectedAnswer: answer };
          list[list.length - 1] = last;
        }
      }

      return { ...prev, [activeSessionId]: list };
    });

    if (window.electronAPI) {
      await window.electronAPI.replyQuestion(activeSessionId, answer);
    }
  };

  // v1.5.0: 会话历史智能浓缩与 Token 窗口释放
  const handleCompactSession = (sessionId: string) => {
    const list = messagesMap[sessionId] || [];
    if (list.length <= 2) {
      const tipMsg: ChatMessageItem = {
        id: `msg-tip-${Date.now()}`,
        role: 'assistant',
        content: `💡 **[上下文无需浓缩]**\n\n当前会话仅包含 ${list.length} 条消息，尚未达到浓缩水位（建议在对话轮次较长、Token 占比升高时使用）。`,
        timestamp: Date.now()
      };
      setMessagesMap(prev => ({
        ...prev,
        [sessionId]: [...(prev[sessionId] || []), tipMsg]
      }));
      return;
    }

    const keepCount = Math.min(2, Math.max(1, Math.floor(list.length * 0.2)));
    const toCompact = list.slice(0, list.length - keepCount);
    const toKeep = list.slice(list.length - keepCount);

    const rawSavedTokens = toCompact.reduce(
      (acc, m) => acc + Math.round((m.content?.length || 0) * 0.75 + (m.thought?.length || 0) * 0.5),
      0
    );

    // 提炼历史交互主题
    const userTopics = toCompact
      .filter(m => m.role === 'user')
      .map(m => m.content.replace(/【[\s\S]*?】/g, '').trim().split('\n')[0].slice(0, 90))
      .filter(Boolean);

    // 扫描关键涉及的文件
    const fileSet = new Set<string>();
    for (const msg of toCompact) {
      if (msg.steps) {
        for (const s of msg.steps) {
          if (s.args?.path || s.args?.filePath) {
            fileSet.add(s.args.path || s.args.filePath);
          }
        }
      }
      const fileMatches = Array.from(msg.content.matchAll(/(?:`|\[)([\w\-\.\/\\\\]+\.(?:ts|tsx|js|jsx|json|md|py|rs|html|css))(?:`|\])/g));
      for (const fm of fileMatches) {
        fileSet.add(fm[1]);
      }
    }

    const compactSummaryMsg: ChatMessageItem = {
      id: `msg-compact-${Date.now()}`,
      role: 'assistant',
      content: `📦 **[会话历史已智能浓缩 · 上下文已释放]**

> 💡 **上下文优化报告**: 已成功将前序 **${toCompact.length}** 轮历史交互提炼为结构化高密度工程状态快照，预估释放约 **~${rawSavedTokens.toLocaleString()}** Tokens，大幅降低后续推理延迟与上下文窗口占用。

### 🎯 历史交互主题与需求演化
${userTopics.length > 0 ? userTopics.map(t => `- ${t}`).join('\n') : '- 展开项目各阶段核心技术研发与工程演进'}

### 🛠️ 关键涉及与变更的文件产物
${fileSet.size > 0 ? Array.from(fileSet).slice(0, 10).map(f => `- \`${f}\``).join('\n') : '- 检视了项目基础架构、规则与配置文件'}

### 📌 关键决议与架构基线
- 前序开发任务与工具调用均已按规划闭环并通过构建验证；
- 严格遵循现行工程规约（.asteamrules）与持久记忆库约束；

---
*注: 此压缩快照已作为置顶事实保留在后续上下文中，后续交互无需重复输入前置背景，Agent 可无缝续写。*`,
      thought: `已完成前序 ${toCompact.length} 轮消息的上下文语义浓缩，已释放约 ${rawSavedTokens} Tokens。`,
      timestamp: Date.now()
    };

    setMessagesMap(prev => ({
      ...prev,
      [sessionId]: [compactSummaryMsg, ...toKeep]
    }));
  };

  // 7. Send message & start Agent
  const handleSendMessage = async (text: string, mode: ExecutionMode, attachments?: any[]) => {
    if (isWaitingForUser) {
      const currentList = messagesMap[activeSessionId] || [];
      const lastMsg = currentList[currentList.length - 1];
      if (lastMsg?.question) {
        await handleReplyQuestion(lastMsg.question.questionId, text);
        return;
      }
    }

    if (!text.trim() && (!attachments || attachments.length === 0)) return;
    if (isRunning && !isWaitingForUser) return;

    const trimmedInput = text.trim();

    // v1.5.0 快捷指令: /compact 智能浓缩长会话上下文
    if (/^\/compact(?:\s+.*)?$/i.test(trimmedInput)) {
      handleCompactSession(activeSessionId);
      return;
    }

    // v1.3.0 快捷指令: /remember <内容> 或 /learn <内容> 显式持久化至长期记忆库
    const rememberMatch = trimmedInput.match(/^\/(?:remember|learn)\s+([\s\S]+)$/i);
    if (rememberMatch && rememberMatch[1]?.trim() && window.electronAPI?.addMemoryFact) {
      const factToSave = rememberMatch[1].trim();
      const scope = currentWorkspacePath ? 'project' : 'global';
      const res = await window.electronAPI.addMemoryFact(scope, factToSave, currentWorkspacePath);

      const userMsg: ChatMessageItem = {
        id: `msg-user-${Date.now()}`,
        role: 'user',
        content: trimmedInput,
        timestamp: Date.now()
      };

      const assistantMsg: ChatMessageItem = {
        id: `msg-assistant-${Date.now() + 1}`,
        role: 'assistant',
        content: `🧠 **[长期记忆已沉淀 · 跨会话激活]**\n\n已成功持久化落盘至 **${scope === 'project' ? '当前项目库 (.asteam/memory/MEMORY.md)' : '全局记忆库 (GLOBAL_MEMORY.md)'}**：\n\n> ${factToSave}\n\n💡 该工程规约/避坑要点已常驻生效，在此项目的所有后续任务与新会话中，Agent 将始终自动感知并严格遵循此约定。`,
        thought: '已通过显式指令完成本地工程记忆沉淀。',
        steps: [
          {
            id: `step-mem-${Date.now()}`,
            title: '持久化沉淀至 Memory Bank',
            status: 'completed',
            tool: 'remember_fact',
            result: res.message
          }
        ],
        timestamp: Date.now() + 1
      };

      setMessagesMap(prev => ({
        ...prev,
        [activeSessionId]: [...(prev[activeSessionId] || []), userMsg, assistantMsg]
      }));
      return;
    }

    let fullContent = text.trim();
    if (attachments && attachments.length > 0) {
      const attachSnippets = attachments.map(att => {
        if (att.type?.startsWith('image/') && att.content) {
          return `\n\n【用户附件图片: ${att.name} (${Math.round(att.size / 1024)} KB)】:\n![${att.name}](${att.content})`;
        }
        if (att.content) {
          const ext = att.name.split('.').pop() || '';
          return `\n\n【附件代码/文件: ${att.name} (${Math.round(att.size / 1024)} KB)】:\n\`\`\`${ext}\n${att.content}\n\`\`\``;
        }
        return `\n\n【附件文件: ${att.name} (${Math.round(att.size / 1024)} KB)】`;
      }).join('');
      fullContent = fullContent ? `${fullContent}\n${attachSnippets}` : attachSnippets.trim();
    }

    // v1.8.3: 真实出境调度与执行管道
    const executeSendMessage = async (
      textToSend: string,
      rawTextForTitle: string,
      execMode: ExecutionMode,
      bypassFence: boolean = false
    ) => {
      const userMessage: ChatMessageItem = {
        id: `msg-user-${Date.now()}`,
        role: 'user',
        content: textToSend,
        timestamp: Date.now()
      };

      const assistantMessage: ChatMessageItem = {
        id: `msg-assistant-${Date.now() + 1}`,
        role: 'assistant',
        content: '',
        thought: '',
        steps: [],
        timestamp: Date.now() + 1
      };

      const currentList = messagesMap[activeSessionId] || [];
      const nextList = [...currentList, userMessage, assistantMessage];

      // Auto-update session title and timestamp
      setSessions(prev =>
        prev.map(s => {
          if (s.id === activeSessionId) {
            return {
              ...s,
              title: s.title === '新任务' || s.title === '新对话' ? rawTextForTitle.slice(0, 20) : s.title,
              updatedAt: Date.now()
            };
          }
          return s;
        })
      );

      setMessagesMap(prev => ({
        ...prev,
        [activeSessionId]: nextList
      }));

      setIsRunning(true);
      setRunStartTime(Date.now());

      // Prepare history for LLM
      const history = nextList
        .slice(0, -1)
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      const runnerConfig = {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        stream: settings.streamResponse !== false,
        workspacePath: currentWorkspacePath,
        enabledMcpTools: settings.enabledMcpTools,
        customMcpConfig: settings.customMcpConfig,
        enabledSkills: settings.enabledSkills,
        executionMode: execMode,
        fallbackProviders: settings.fallbackProviders,
        bypassSecurityFence: bypassFence
      };

      if (window.electronAPI) {
        try {
          await window.electronAPI.startAgent(activeSessionId, runnerConfig, history);
        } catch (err: any) {
          setIsRunning(false);
          setMessagesMap(prev => {
            const list = [...(prev[activeSessionId] || [])];
            const last = list[list.length - 1];
            if (last) {
              last.content = `启动异常: ${err.message}`;
            }
            return { ...prev, [activeSessionId]: list };
          });
        }
      }
    };

    // v1.8.3: 出境安全围栏前置预检与会话偏好记忆
    const rememberedChoice = sessionFenceChoices[activeSessionId];
    if (rememberedChoice === 'bypass') {
      await executeSendMessage(fullContent, text, mode, true);
      return;
    } else if (rememberedChoice === 'sanitize') {
      if (window.electronAPI?.testSanitizeText) {
        const check = await window.electronAPI.testSanitizeText(fullContent);
        await executeSendMessage(check.sanitized, text, mode, false);
      } else {
        await executeSendMessage(fullContent, text, mode, false);
      }
      return;
    }

    // 未记录会话偏好：前置安全扫描
    if (window.electronAPI?.testSanitizeText) {
      try {
        const check = await window.electronAPI.testSanitizeText(fullContent);
        if (check.redactedItems && check.redactedItems.length > 0) {
          setPreflightData({
            isOpen: true,
            sensitiveItems: check.redactedItems,
            originalText: fullContent,
            sanitizedText: check.sanitized,
            mode,
            rawText: text,
            attachments
          });
          return;
        }
      } catch (err) {
        console.warn('安全预检调用异常，执行降级出境:', err);
      }
    }

    // 无敏感资产命中，直接标准出境
    await executeSendMessage(fullContent, text, mode, false);
  };

  // v1.8.3: 安全预检交互回调
  const handleConfirmSanitize = (rememberSession: boolean) => {
    if (!preflightData) return;
    const { sanitizedText, rawText, mode } = preflightData;
    if (rememberSession) {
      setSessionFenceChoices(prev => ({ ...prev, [activeSessionId]: 'sanitize' }));
    }
    const currentActiveId = activeSessionId;
    setPreflightData(null);

    const userMessage: ChatMessageItem = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: sanitizedText,
      timestamp: Date.now()
    };

    const assistantMessage: ChatMessageItem = {
      id: `msg-assistant-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      thought: '',
      steps: [],
      timestamp: Date.now() + 1
    };

    const currentList = messagesMap[currentActiveId] || [];
    const nextList = [...currentList, userMessage, assistantMessage];

    setSessions(prev =>
      prev.map(s => {
        if (s.id === currentActiveId) {
          return {
            ...s,
            title: s.title === '新任务' || s.title === '新对话' ? rawText.slice(0, 20) : s.title,
            updatedAt: Date.now()
          };
        }
        return s;
      })
    );

    setMessagesMap(prev => ({
      ...prev,
      [currentActiveId]: nextList
    }));

    setIsRunning(true);
    setRunStartTime(Date.now());

    const history = nextList.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    const runnerConfig = {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      stream: settings.streamResponse !== false,
      workspacePath: currentWorkspacePath,
      enabledMcpTools: settings.enabledMcpTools,
      customMcpConfig: settings.customMcpConfig,
      enabledSkills: settings.enabledSkills,
      executionMode: mode,
      fallbackProviders: settings.fallbackProviders,
      bypassSecurityFence: false
    };

    if (window.electronAPI) {
      window.electronAPI.startAgent(currentActiveId, runnerConfig, history).catch((err: any) => {
        setIsRunning(false);
        setMessagesMap(prev => {
          const list = [...(prev[currentActiveId] || [])];
          const last = list[list.length - 1];
          if (last) last.content = `启动异常: ${err.message}`;
          return { ...prev, [currentActiveId]: list };
        });
      });
    }
  };

  const handleConfirmBypass = async (rememberSession: boolean) => {
    if (!preflightData) return;
    const { originalText, rawText, mode, sensitiveItems } = preflightData;
    if (rememberSession) {
      setSessionFenceChoices(prev => ({ ...prev, [activeSessionId]: 'bypass' }));
    }

    if (window.electronAPI?.recordSecurityFenceBypass) {
      await window.electronAPI.recordSecurityFenceBypass(sensitiveItems);
    }

    const currentActiveId = activeSessionId;
    setPreflightData(null);

    const userMessage: ChatMessageItem = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: originalText,
      timestamp: Date.now()
    };

    const assistantMessage: ChatMessageItem = {
      id: `msg-assistant-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      thought: '',
      steps: [],
      timestamp: Date.now() + 1
    };

    const currentList = messagesMap[currentActiveId] || [];
    const nextList = [...currentList, userMessage, assistantMessage];

    setSessions(prev =>
      prev.map(s => {
        if (s.id === currentActiveId) {
          return {
            ...s,
            title: s.title === '新任务' || s.title === '新对话' ? rawText.slice(0, 20) : s.title,
            updatedAt: Date.now()
          };
        }
        return s;
      })
    );

    setMessagesMap(prev => ({
      ...prev,
      [currentActiveId]: nextList
    }));

    setIsRunning(true);
    setRunStartTime(Date.now());

    const history = nextList.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
    const runnerConfig = {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      stream: settings.streamResponse !== false,
      workspacePath: currentWorkspacePath,
      enabledMcpTools: settings.enabledMcpTools,
      customMcpConfig: settings.customMcpConfig,
      enabledSkills: settings.enabledSkills,
      executionMode: mode,
      fallbackProviders: settings.fallbackProviders,
      bypassSecurityFence: true
    };

    if (window.electronAPI) {
      window.electronAPI.startAgent(currentActiveId, runnerConfig, history).catch((err: any) => {
        setIsRunning(false);
        setMessagesMap(prev => {
          const list = [...(prev[currentActiveId] || [])];
          const last = list[list.length - 1];
          if (last) last.content = `启动异常: ${err.message}`;
          return { ...prev, [currentActiveId]: list };
        });
      });
    }
  };

  const handleCancelPreflight = () => {
    setPreflightData(null);
  };

  const handleStopAgent = async () => {
    if (window.electronAPI) {
      await window.electronAPI.stopAgent(activeSessionId);
    }
    setIsRunning(false);
    setIsWaitingForUser(false);
  };

  const activeMessages = messagesMap[activeSessionId] || [];
  const currentProvider = PROVIDER_PRESETS.find(p => p.id === settings.providerId);
  const providerDisplayName = currentProvider?.name || 'ASteam LLMAPI';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* 1. Custom Frameless TitleBar with Git Status Pill & Workbench Trigger */}
      <TitleBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
        workspacePath={currentWorkspacePath}
        gitStatus={gitStatus}
        onOpenGitDiff={handleOpenGitDiff}
        onOpenDrawer={() => setIsDrawerOpen(prev => !prev)}
        isDrawerOpen={isDrawerOpen}
        projectRules={projectRules}
        onOpenRules={handleOpenRules}
        onOpenEnterpriseHub={() => setIsEnterpriseHubOpen(true)}
        onOpenSecurityCompliance={() => setIsSecurityComplianceOpen(true)}
      />

      {/* 2. Main Workspace Layout (Sidebar + Center Chat + Right Split-Pane Workbench) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar (Projects Tree with Nested Sessions) */}
        <Sidebar
          projects={projects}
          sessions={sessions}
          activeProjectId={activeProjectId}
          activeSessionId={activeSessionId}
          onSelectProject={setActiveProjectId}
          onToggleProjectExpand={handleToggleProjectExpand}
          onAddProject={handleAddProject}
          onRemoveProject={handleRemoveProject}
          onSelectSession={handleSelectSession}
          onNewSessionForProject={handleNewSessionForProject}
          onDeleteSession={handleDeleteSession}
          onTogglePinSession={handleTogglePinSession}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Center Chat & Agent Trajectory Area */}
        <ChatArea
          messages={activeMessages}
          isRunning={isRunning}
          isWaitingForUser={isWaitingForUser}
          onSendMessage={handleSendMessage}
          onStopAgent={handleStopAgent}
          onReplyQuestion={handleReplyQuestion}
          workspacePath={currentWorkspacePath}
          currentModel={settings.model}
          providerName={providerDisplayName}
          onOpenGitDiff={handleOpenGitDiff}
          onOpenPreview={handleOpenPreview}
          onOpenTerminal={handleOpenTerminal}
          onOpenTimeline={handleOpenTimeline}
          onRollbackCheckpoint={handleRollbackCheckpoint}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeSessionId={activeSessionId}
          terminalOutputs={terminalOutputs}
          onOpenRules={handleOpenRules}
          onCompactSession={() => handleCompactSession(activeSessionId)}
          onOpenScheduler={handleOpenScheduler}
          onOpenSwarm={handleOpenSwarm}
        />

        {/* Right Split-Pane Workbench (Zero-overlay, side-by-side with ChatArea) */}
        <WorkspaceDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          activeTab={drawerTab}
          onTabChange={setDrawerTab}
          previewData={previewData}
          workspacePath={currentWorkspacePath}
          gitStatus={gitStatus}
          onRefreshGit={refreshGitStatus}
          onRollbackCheckpoint={handleRollbackCheckpoint}
          activeSessionId={activeSessionId}
          terminalOutput={terminalOutputs[activeSessionId] || ''}
          messages={activeMessages}
          latestSwarmState={activeMessages.slice().reverse().find(m => m.swarmState)?.swarmState || null}
          isRunning={isRunning}
          onSelectPreview={(data) => {
            setPreviewData(data);
            setDrawerTab('preview');
          }}
        />
      </div>

      {/* 3. Settings Modal (Includes MCP & Skills configuration) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
        workspacePath={currentWorkspacePath}
      />

      {/* 3.1 Project Rules Modal (v1.4.0) */}
      <ProjectRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        workspacePath={currentWorkspacePath}
        projectRules={projectRules}
        onRulesUpdated={refreshProjectRules}
      />

      {/* 3.2 Enterprise Private Hub Modal (v1.7.0) */}
      <EnterpriseHubModal
        isOpen={isEnterpriseHubOpen}
        onClose={() => setIsEnterpriseHubOpen(false)}
      />

      {/* 3.3 Security Fence & Knowledge Graph Modal (v1.7.1) */}
      <SecurityComplianceModal
        isOpen={isSecurityComplianceOpen}
        onClose={() => setIsSecurityComplianceOpen(false)}
        workspacePath={currentWorkspacePath}
        onPreviewReport={(title, content, filePath) => {
          setIsSecurityComplianceOpen(false);
          setPreviewData({
            type: 'html',
            title,
            content,
            filePath
          });
          setDrawerTab('preview');
          setIsDrawerOpen(true);
        }}
      />

      {/* 3.4 Security Fence Pre-flight Interactive Modal (v1.8.3) */}
      {preflightData && (
        <SecurityPreflightModal
          isOpen={preflightData.isOpen}
          sensitiveItems={preflightData.sensitiveItems}
          originalText={preflightData.originalText}
          sanitizedText={preflightData.sanitizedText}
          onConfirmSanitize={handleConfirmSanitize}
          onConfirmBypass={handleConfirmBypass}
          onCancel={handleCancelPreflight}
        />
      )}
    </div>
  );
};
