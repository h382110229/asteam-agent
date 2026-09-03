import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, Session } from './components/Sidebar';
import { ChatArea, ChatMessageItem } from './components/ChatArea';
import { SettingsModal } from './components/SettingsModal';
import { AppSettings, DEFAULT_SETTINGS, PROVIDER_PRESETS } from './config/providers';
import { AgentStep } from './components/AgentTrajectory';

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
    return settings.theme || 'dark';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    const updated = { ...settings, theme: nextTheme };
    setSettings(updated);
    localStorage.setItem('asteam_settings', JSON.stringify(updated));
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('asteam_settings', JSON.stringify(newSettings));
  };

  // 2. Workspace Management
  const [workspacePath, setWorkspacePath] = useState<string | null>(() => {
    return localStorage.getItem('asteam_workspace') || null;
  });

  const handleSelectWorkspace = async () => {
    if (!window.electronAPI) return;
    const dir = await window.electronAPI.selectWorkspaceDirectory();
    if (dir) {
      setWorkspacePath(dir);
      localStorage.setItem('asteam_workspace', dir);
    }
  };

  const handleClearWorkspace = () => {
    setWorkspacePath(null);
    localStorage.removeItem('asteam_workspace');
  };

  // 3. Sessions & Messages
  const [sessions, setSessions] = useState<Session[]>(() => {
    try {
      const saved = localStorage.getItem('asteam_sessions');
      return saved ? JSON.parse(saved) : [{ id: 'session-1', title: '新对话', createdAt: Date.now() }];
    } catch {
      return [{ id: 'session-1', title: '新对话', createdAt: Date.now() }];
    }
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return sessions[0]?.id || 'session-1';
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
    localStorage.setItem('asteam_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('asteam_messages', JSON.stringify(messagesMap));
  }, [messagesMap]);

  // 4. Execution State & Agent IPC Listener
  const [isRunning, setIsRunning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
        } else if (type === 'error') {
          lastMsg.content += `\n\n⚠️ **执行遇到错误**: ${payload.error}`;
          setIsRunning(false);
        } else if (type === 'done') {
          setIsRunning(false);
        }

        list[lastIdx] = lastMsg;
        return { ...prevMap, [sessionId]: list };
      });
    });

    return () => cleanup();
  }, []);

  // 5. Session Actions
  const handleNewSession = () => {
    const newId = `session-${Date.now()}`;
    const newSession: Session = {
      id: newId,
      title: '新对话',
      createdAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
  };

  const handleDeleteSession = (id: string) => {
    const filtered = sessions.filter(s => s.id !== id);
    if (filtered.length === 0) {
      handleNewSession();
      return;
    }
    setSessions(filtered);
    if (activeSessionId === id) {
      setActiveSessionId(filtered[0].id);
    }
    setMessagesMap(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  // 6. Send message & start Agent
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isRunning) return;

    const userMessage: ChatMessageItem = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: text,
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

    // Auto-update session title from first user prompt
    if (currentList.length === 0) {
      setSessions(prev =>
        prev.map(s => (s.id === activeSessionId ? { ...s, title: text.slice(0, 18) } : s))
      );
    }

    setMessagesMap(prev => ({
      ...prev,
      [activeSessionId]: nextList
    }));

    setIsRunning(true);

    // Prepare history for LLM
    const history = nextList
      .slice(0, -1) // omit empty assistant message
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    const runnerConfig = {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      workspacePath: workspacePath
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
    } else {
      // Fallback for browser preview
      setTimeout(() => {
        setIsRunning(false);
        setMessagesMap(prev => {
          const list = [...(prev[activeSessionId] || [])];
          const last = list[list.length - 1];
          if (last) {
            last.content = '（提示：当前运行在普通浏览器环境，启动 Electron 客户端即可完整体验 deepseek-harness 工作区工具执行）';
          }
          return { ...prev, [activeSessionId]: list };
        });
      }, 500);
    }
  };

  const handleStopAgent = async () => {
    if (window.electronAPI) {
      await window.electronAPI.stopAgent(activeSessionId);
    }
    setIsRunning(false);
  };

  const activeMessages = messagesMap[activeSessionId] || [];
  const currentProvider = PROVIDER_PRESETS.find(p => p.id === settings.providerId);
  const providerDisplayName = currentProvider?.name || 'ASteam LLMAPI';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* 1. Custom Frameless TitleBar */}
      <TitleBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
        workspacePath={workspacePath}
      />

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          workspacePath={workspacePath}
          onSelectWorkspace={handleSelectWorkspace}
          onClearWorkspace={handleClearWorkspace}
        />

        {/* Center Chat & Agent Trajectory Area */}
        <ChatArea
          messages={activeMessages}
          isRunning={isRunning}
          onSendMessage={handleSendMessage}
          onStopAgent={handleStopAgent}
          workspacePath={workspacePath}
          currentModel={settings.model}
          providerName={providerDisplayName}
        />
      </div>

      {/* 3. Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
};
