import React, { useState, useEffect, useCallback } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { ChatArea, ChatMessageItem } from './components/ChatArea';
import { SettingsModal } from './components/SettingsModal';
import { GitDiffDrawer } from './components/GitDiffDrawer';
import { AppSettings, DEFAULT_SETTINGS, PROVIDER_PRESETS } from './config/providers';
import { AgentStep } from './components/AgentTrajectory';
import { Project, ProjectSession, GitStatusSummary, ExecutionMode } from './types/project';

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

  // 4. Git Status & Diff Drawer State
  const [gitStatus, setGitStatus] = useState<GitStatusSummary | null>(null);
  const [isGitDiffOpen, setIsGitDiffOpen] = useState(false);

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

  useEffect(() => {
    refreshGitStatus();
  }, [refreshGitStatus]);

  // 5. Execution State & Agent IPC Listener
  const [isRunning, setIsRunning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [runStartTime, setRunStartTime] = useState<number>(0);

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
          lastMsg.durationMs = Date.now() - (lastMsg.timestamp || Date.now());
          setIsRunning(false);
          refreshGitStatus();
        } else if (type === 'done') {
          lastMsg.durationMs = Date.now() - (lastMsg.timestamp || Date.now());
          setIsRunning(false);
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
    const filtered = sessions.filter(s => s.id !== sessionId);
    if (filtered.length === 0) {
      handleNewSessionForProject(activeProjectId);
      return;
    }
    setSessions(filtered);
    if (activeSessionId === sessionId) {
      const remainingForProj = filtered.filter(s => s.projectId === activeProjectId);
      setActiveSessionId(remainingForProj[0]?.id || filtered[0].id);
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

  // 7. Send message & start Agent
  const handleSendMessage = async (text: string, mode: ExecutionMode) => {
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

    // Auto-update session title and timestamp
    setSessions(prev =>
      prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            title: s.title === '新任务' || s.title === '新对话' ? text.slice(0, 20) : s.title,
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
      workspacePath: currentWorkspacePath,
      enabledMcpTools: settings.enabledMcpTools,
      enabledSkills: settings.enabledSkills,
      executionMode: mode
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
      {/* 1. Custom Frameless TitleBar with Git Status Pill */}
      <TitleBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
        workspacePath={currentWorkspacePath}
        gitStatus={gitStatus}
        onOpenGitDiff={() => setIsGitDiffOpen(true)}
      />

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
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
          onSendMessage={handleSendMessage}
          onStopAgent={handleStopAgent}
          workspacePath={currentWorkspacePath}
          currentModel={settings.model}
          providerName={providerDisplayName}
          onOpenGitDiff={() => setIsGitDiffOpen(true)}
        />
      </div>

      {/* 3. Settings Modal (Includes MCP & Skills configuration) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      {/* 4. Git Diff Drawer */}
      <GitDiffDrawer
        isOpen={isGitDiffOpen}
        onClose={() => setIsGitDiffOpen(false)}
        workspacePath={currentWorkspacePath}
        gitStatus={gitStatus}
        onRefreshGit={refreshGitStatus}
      />
    </div>
  );
};
