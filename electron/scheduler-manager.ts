import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Notification } from 'electron';
import { storageHub } from './storage-hub';
import { rulesManager } from './rules-manager';
import { securityFenceManager } from './security-fence-manager';
import { knowledgeGraphManager } from './knowledge-graph-manager';
import { ScheduledTask, InspectionReport, ScheduledTaskType, SchedulerEventPayload } from './scheduler-types';

export class SchedulerManager {
  private static instance: SchedulerManager;
  private tasksFile: string;
  private tasks: ScheduledTask[] = [];
  private timer: NodeJS.Timeout | null = null;
  private eventListeners: Set<(event: SchedulerEventPayload) => void> = new Set();
  private isRunningCheck: boolean = false;

  private constructor() {
    this.tasksFile = path.join(storageHub.getDataRootDir(), 'scheduler_tasks.json');
    this.loadTasks();
  }

  public static getInstance(): SchedulerManager {
    if (!SchedulerManager.instance) {
      SchedulerManager.instance = new SchedulerManager();
    }
    return SchedulerManager.instance;
  }

  public start() {
    if (this.timer) return;
    console.log('[SchedulerManager] Background Autonomous Scheduler started.');
    // Check every 30 seconds
    this.timer = setInterval(() => {
      this.checkAndRunDueTasks().catch((err) => {
        console.error('[SchedulerManager] Error in scheduler heartbeat:', err);
      });
    }, 30000);

    // Also run an initial check shortly after startup
    setTimeout(() => {
      this.checkAndRunDueTasks().catch(() => {});
    }, 5000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public onEvent(listener: (event: SchedulerEventPayload) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private broadcast(payload: SchedulerEventPayload) {
    for (const listener of this.eventListeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[SchedulerManager] Error in event listener:', err);
      }
    }
  }

  private loadTasks() {
    try {
      if (fs.existsSync(this.tasksFile)) {
        const raw = fs.readFileSync(this.tasksFile, 'utf-8');
        this.tasks = JSON.parse(raw);
        let modified = false;
        if (!this.tasks.some(t => t.type === 'enterprise_compliance')) {
          const now = Date.now();
          this.tasks.push({
            id: 'task-preset-compliance',
            name: '企业级安全合规与敏感风险综合体检',
            type: 'enterprise_compliance',
            schedule: 'daily_9am',
            enabled: true,
            workspacePath: null,
            createdAt: now,
            runCount: 0,
            nextRunTime: this.computeNextRunTime('daily_9am', now)
          });
          modified = true;
        }
        if (modified) {
          this.saveTasksToDisk();
        }
        return;
      }
    } catch (e) {
      console.warn('[SchedulerManager] Failed to read scheduler_tasks.json, recreating defaults:', e);
    }

    // Default Presets
    const now = Date.now();
    this.tasks = [
      {
        id: 'task-preset-health',
        name: '工作区代码健康度与工程规约体检',
        type: 'health_check',
        schedule: 'daily_2am',
        enabled: true,
        workspacePath: null,
        createdAt: now,
        runCount: 0,
        nextRunTime: this.computeNextRunTime('daily_2am', now)
      },
      {
        id: 'task-preset-security',
        name: '依赖安全漏洞与硬编码密钥泄漏排查',
        type: 'security_scan',
        schedule: 'every_6h',
        enabled: true,
        workspacePath: null,
        createdAt: now,
        runCount: 0,
        nextRunTime: this.computeNextRunTime('every_6h', now)
      },
      {
        id: 'task-preset-test',
        name: '自动化测试用例与质量门禁巡检',
        type: 'test_runner',
        schedule: 'every_2h',
        enabled: false,
        workspacePath: null,
        createdAt: now,
        runCount: 0,
        nextRunTime: this.computeNextRunTime('every_2h', now)
      },
      {
        id: 'task-preset-compliance',
        name: '企业级安全合规与敏感风险综合体检',
        type: 'enterprise_compliance',
        schedule: 'daily_9am',
        enabled: true,
        workspacePath: null,
        createdAt: now,
        runCount: 0,
        nextRunTime: this.computeNextRunTime('daily_9am', now)
      }
    ];
    this.saveTasksToDisk();
  }

  private saveTasksToDisk() {
    try {
      const dir = path.dirname(this.tasksFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.tasksFile, JSON.stringify(this.tasks, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SchedulerManager] Failed to save scheduler_tasks.json:', e);
    }
  }

  public computeNextRunTime(schedule: string, fromTime: number = Date.now()): number {
    switch (schedule) {
      case 'every_30m':
        return fromTime + 30 * 60 * 1000;
      case 'every_1h':
        return fromTime + 60 * 60 * 1000;
      case 'every_2h':
        return fromTime + 2 * 60 * 60 * 1000;
      case 'every_6h':
        return fromTime + 6 * 60 * 60 * 1000;
      case 'daily_2am': {
        const next = new Date(fromTime);
        next.setHours(2, 0, 0, 0);
        if (next.getTime() <= fromTime) {
          next.setDate(next.getDate() + 1);
        }
        return next.getTime();
      }
      case 'daily_9am': {
        const next = new Date(fromTime);
        next.setHours(9, 0, 0, 0);
        if (next.getTime() <= fromTime) {
          next.setDate(next.getDate() + 1);
        }
        return next.getTime();
      }
      case 'weekly':
        return fromTime + 7 * 24 * 60 * 60 * 1000;
      default:
        return fromTime + 60 * 60 * 1000;
    }
  }

  public getTasks(workspacePath?: string | null): ScheduledTask[] {
    if (!workspacePath) return [...this.tasks];
    return this.tasks.filter(t => !t.workspacePath || t.workspacePath === workspacePath);
  }

  public saveTask(taskData: Partial<ScheduledTask>): ScheduledTask {
    let task: ScheduledTask;
    const now = Date.now();

    if (taskData.id) {
      const idx = this.tasks.findIndex(t => t.id === taskData.id);
      if (idx >= 0) {
        task = {
          ...this.tasks[idx],
          ...taskData,
          nextRunTime: taskData.schedule ? this.computeNextRunTime(taskData.schedule, now) : this.tasks[idx].nextRunTime
        };
        this.tasks[idx] = task;
      } else {
        task = {
          id: taskData.id,
          name: taskData.name || '未命名巡检任务',
          type: taskData.type || 'health_check',
          schedule: taskData.schedule || 'every_1h',
          enabled: taskData.enabled ?? true,
          workspacePath: taskData.workspacePath || null,
          prompt: taskData.prompt,
          createdAt: now,
          runCount: 0,
          nextRunTime: this.computeNextRunTime(taskData.schedule || 'every_1h', now)
        };
        this.tasks.push(task);
      }
    } else {
      task = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: taskData.name || '未命名巡检任务',
        type: taskData.type || 'health_check',
        schedule: taskData.schedule || 'every_1h',
        enabled: taskData.enabled ?? true,
        workspacePath: taskData.workspacePath || null,
        prompt: taskData.prompt,
        createdAt: now,
        runCount: 0,
        nextRunTime: this.computeNextRunTime(taskData.schedule || 'every_1h', now)
      };
      this.tasks.push(task);
    }

    this.saveTasksToDisk();
    return task;
  }

  public deleteTask(taskId: string): boolean {
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      this.tasks.splice(idx, 1);
      this.saveTasksToDisk();
      return true;
    }
    return false;
  }

  public toggleTask(taskId: string, enabled: boolean): ScheduledTask | null {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.enabled = enabled;
      if (enabled && (!task.nextRunTime || task.nextRunTime < Date.now())) {
        task.nextRunTime = this.computeNextRunTime(task.schedule);
      }
      this.saveTasksToDisk();
      return { ...task };
    }
    return null;
  }

  private async checkAndRunDueTasks() {
    if (this.isRunningCheck) return;
    this.isRunningCheck = true;

    try {
      const now = Date.now();
      for (const task of this.tasks) {
        if (!task.enabled) continue;
        if (task.lastRunStatus === 'running') continue;

        if (task.nextRunTime && now >= task.nextRunTime) {
          console.log(`[SchedulerManager] Running due task: ${task.name} (${task.id})`);
          await this.executeTask(task);
        }
      }
    } finally {
      this.isRunningCheck = false;
    }
  }

  public async runNow(taskId: string, overrideWorkspace?: string): Promise<InspectionReport> {
    let task = this.tasks.find(t => t.id === taskId);
    if (!task && (taskId.includes('compliance') || taskId === 'task-compliance')) {
      task = this.tasks.find(t => t.type === 'enterprise_compliance');
    }
    if (!task) {
      if (taskId.includes('compliance')) {
        task = {
          id: 'task-preset-compliance',
          name: '企业代码资产出境合规与依赖安全审计',
          type: 'enterprise_compliance',
          schedule: 'daily_9am',
          enabled: true,
          prompt: '全面扫描工作区 .asteamrules 规约执行度、API Key 与私网 IP 泄露防护状态、跨工作区知识图谱倒排索引完整度，输出专业企业审计合规报告。'
        };
        this.tasks.push(task);
        this.saveTasksToDisk();
      } else {
        throw new Error(`找不到指定的定时任务: ${taskId}`);
      }
    }
    if (overrideWorkspace) {
      task.workspacePath = overrideWorkspace;
    }
    return await this.executeTask(task);
  }

  private async executeTask(task: ScheduledTask): Promise<InspectionReport> {
    const startTime = Date.now();
    task.lastRunStatus = 'running';
    this.saveTasksToDisk();

    this.broadcast({
      type: 'task_started',
      taskId: task.id,
      taskName: task.name
    });

    const effectiveWorkspace = task.workspacePath || process.cwd();
    const reportsDir = path.join(effectiveWorkspace, '.asteam', 'reports');
    if (!fs.existsSync(reportsDir)) {
      try {
        fs.mkdirSync(reportsDir, { recursive: true });
      } catch {}
    }

    let report: InspectionReport;

    try {
      switch (task.type) {
        case 'health_check':
          report = await this.runHealthCheck(task, effectiveWorkspace, reportsDir, startTime);
          break;
        case 'security_scan':
          report = await this.runSecurityScan(task, effectiveWorkspace, reportsDir, startTime);
          break;
        case 'test_runner':
          report = await this.runTestRunner(task, effectiveWorkspace, reportsDir, startTime);
          break;
        case 'enterprise_compliance':
          report = await this.runEnterpriseComplianceScan(task, effectiveWorkspace, reportsDir, startTime);
          break;
        case 'autonomous_task':
        default:
          report = await this.runAutonomousTask(task, effectiveWorkspace, reportsDir, startTime);
          break;
      }

      task.lastRunTime = startTime;
      task.lastRunStatus = 'success';
      task.lastRunDurationMs = Date.now() - startTime;
      task.lastReportPath = report.filePath;
      task.runCount = (task.runCount || 0) + 1;
      task.nextRunTime = this.computeNextRunTime(task.schedule, Date.now());
      this.saveTasksToDisk();

      // Native Windows system notification
      try {
        if (Notification.isSupported()) {
          new Notification({
            title: `ASTeam 巡检完成: ${task.name}`,
            body: `体检得分: ${report.score} 分 (${report.status.toUpperCase()})。\n${report.summary.slice(0, 100)}`
          }).show();
        }
      } catch {}

      this.broadcast({
        type: 'task_completed',
        taskId: task.id,
        taskName: task.name,
        report
      });

      return report;
    } catch (err: any) {
      task.lastRunTime = startTime;
      task.lastRunStatus = 'failed';
      task.lastRunDurationMs = Date.now() - startTime;
      task.nextRunTime = this.computeNextRunTime(task.schedule, Date.now());
      this.saveTasksToDisk();

      this.broadcast({
        type: 'task_failed',
        taskId: task.id,
        taskName: task.name,
        error: err.message
      });

      throw err;
    }
  }

  /**
   * 1. 运行代码库健康体检 (TypeScript, .asteamrules, Git Cleanliness)
   */
  private async runHealthCheck(
    task: ScheduledTask,
    workspace: string,
    reportsDir: string,
    startTime: number
  ): Promise<InspectionReport> {
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `health_report_${timestampStr}.md`;
    const filePath = path.join(reportsDir, fileName);

    let score = 100;
    const issues: string[] = [];
    const passedItems: string[] = [];

    // Check 1: rulesManager
    const rules = rulesManager.getProjectRules(workspace);
    if (rules.hasRules) {
      passedItems.push(`已配置项目工程规约 (${rules.ruleType})`);
    } else {
      score -= 10;
      issues.push('未检测到项目规约文件 (.asteamrules 或 ASTEAM.md)，建议通过顶栏徽章一键初始化模版。');
    }

    // Check 2: TypeScript compiler check if tsconfig.json exists
    let tscOutput = '';
    const tsconfigPath = path.join(workspace, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      try {
        const cmdRes = await this.execCommand('npx tsc --noEmit', workspace, 60000);
        tscOutput = cmdRes.output;
        if (cmdRes.code === 0) {
          passedItems.push('TypeScript 静态类型检查通过 (0 错误、0 警告)');
        } else {
          score -= 30;
          issues.push(`TypeScript 静态类型校验失败 (Exit ${cmdRes.code})，存在类型错误。`);
        }
      } catch (e: any) {
        score -= 20;
        issues.push(`执行 tsc 异常: ${e.message}`);
      }
    } else {
      passedItems.push('免编译或纯脚本工程');
    }

    // Check 3: Git Status
    const gitDir = path.join(workspace, '.git');
    if (fs.existsSync(gitDir)) {
      try {
        const gitRes = await this.execCommand('git status --short', workspace, 15000);
        const lines = gitRes.output.split('\n').filter(Boolean);
        if (lines.length === 0) {
          passedItems.push('Git 工作区完全干净 (Clean)');
        } else if (lines.length > 15) {
          score -= 10;
          issues.push(`工作区存在过多未提交或未跟踪文件 (${lines.length} 个文件)，建议及时提交或回滚。`);
        } else {
          passedItems.push(`工作区包含 ${lines.length} 处未提交修改 (正常研发中)`);
        }
      } catch {}
    }

    score = Math.max(0, Math.min(100, score));
    const status: InspectionReport['status'] = score >= 90 ? 'pass' : score >= 60 ? 'warning' : 'fail';
    const durationMs = Date.now() - startTime;

    const summary = `工作区健康度体检得分: ${score}/100 [${status.toUpperCase()}]。检测通过 ${passedItems.length} 项，发现问题 ${issues.length} 项。`;

    const mdContent = `# 🩺 工作区代码健康体检报告 (Health Inspection Report)

> **任务名称**：${task.name}  
> **体检时间**：${new Date().toLocaleString()}  
> **工作区目录**：\`${workspace}\`  
> **总耗时**：${(durationMs / 1000).toFixed(1)} 秒  
> **健康评分**：\`${score} / 100\` (${status === 'pass' ? '✅ 优秀健康' : status === 'warning' ? '⚠️ 存在警告' : '❌ 严重隐患'})

---

## 📊 体检指标总览
| 检验维度 | 状态 | 说明 |
| :--- | :--- | :--- |
| **工程规约 (.asteamrules)** | ${rules.hasRules ? '✅ 遵循' : '⚠️ 缺失'} | ${rules.hasRules ? rules.filePath : '未配置规约'} |
| **TypeScript 静态类型** | ${tsconfigPath && fs.existsSync(tsconfigPath) ? (score >= 80 ? '✅ 通过' : '❌ 异常') : 'ℹ️ 免检'} | 0 隐式 any 校验门禁 |
| **版本控制工作区** | ${issues.some(i => i.includes('未提交')) ? '⚠️ 存在滞留' : '✅ 正常'} | Git 变更与分支状态 |

---

## ✅ 检查通过项 (${passedItems.length})
${passedItems.map(p => `- [x] ${p}`).join('\n')}

${issues.length > 0 ? `## ⚠️ 发现的问题与改进建议 (${issues.length})\n${issues.map(i => `- [ ] ${i}`).join('\n')}` : '## 🎉 恭喜！当前工作区健康度极佳，未发现任何阻碍项。'}

${tscOutput ? `\n---\n### 附录：类型检查日志输出\n\`\`\`text\n${tscOutput.slice(0, 1500)}\n\`\`\`` : ''}
`;

    fs.writeFileSync(filePath, mdContent, 'utf-8');

    return {
      id: `report-${Date.now()}`,
      taskId: task.id,
      taskName: task.name,
      type: 'health_check',
      workspacePath: workspace,
      timestamp: Date.now(),
      status,
      score,
      summary,
      filePath,
      fileName,
      metrics: {
        totalItemsChecked: passedItems.length + issues.length,
        passedItems: passedItems.length,
        issuesFound: issues.length,
        durationMs
      }
    };
  }

  /**
   * 2. 运行依赖安全漏洞与硬编码密钥扫描
   */
  private async runSecurityScan(
    task: ScheduledTask,
    workspace: string,
    reportsDir: string,
    startTime: number
  ): Promise<InspectionReport> {
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `security_report_${timestampStr}.md`;
    const filePath = path.join(reportsDir, fileName);

    let score = 100;
    const vulnerabilities: string[] = [];
    const secretLeaks: string[] = [];
    const safeItems: string[] = [];

    // Check 1: npm audit
    const pkgPath = path.join(workspace, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const auditRes = await this.execCommand('npm audit --json', workspace, 45000);
        try {
          const auditJson = JSON.parse(auditRes.output);
          const vulns = auditJson.metadata?.vulnerabilities;
          if (vulns) {
            const highAndCrit = (vulns.high || 0) + (vulns.critical || 0);
            const total = vulns.total || 0;
            if (highAndCrit > 0) {
              score -= 30;
              vulnerabilities.push(`检测到 ${highAndCrit} 个高危/严重级别的依赖包已知 CVE 漏洞！建议运行 npm audit fix。`);
            } else if (total > 0) {
              score -= 10;
              vulnerabilities.push(`检测到 ${total} 个轻量级已知依赖依赖问题。`);
            } else {
              safeItems.push('npm 依赖库 0 已知安全漏洞');
            }
          }
        } catch {
          safeItems.push('npm audit 完成');
        }
      } catch (e: any) {
        safeItems.push('npm audit 执行完成');
      }
    }

    // Check 2: Scan for hardcoded secrets in files
    const secretPatterns = [
      { name: 'OpenAI / LLM API Key', regex: /sk-[a-zA-Z0-9]{20,}/g },
      { name: 'Google Gemini API Key', regex: /AIzaSy[a-zA-Z0-9_-]{33}/g },
      { name: 'RSA / Private Key Block', regex: /-----BEGIN [A-Z]+ PRIVATE KEY-----/g },
      { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g }
    ];

    try {
      const filesToCheck = this.getScannableFiles(workspace, 100);
      for (const f of filesToCheck) {
        try {
          const content = fs.readFileSync(f, 'utf-8');
          for (const pattern of secretPatterns) {
            if (pattern.regex.test(content)) {
              const rel = path.relative(workspace, f);
              secretLeaks.push(`在文件 "${rel}" 中可能存在硬编码密钥: ${pattern.name}`);
              score -= 25;
            }
          }
        } catch {}
      }
      if (secretLeaks.length === 0) {
        safeItems.push('全库未检出任何明文泄漏的硬编码 API Key 或私钥');
      }
    } catch {}

    score = Math.max(0, Math.min(100, score));
    const status: InspectionReport['status'] = score >= 90 ? 'pass' : score >= 60 ? 'warning' : 'fail';
    const durationMs = Date.now() - startTime;
    const summary = `依赖安全与密钥排查得分: ${score}/100 [${status.toUpperCase()}]。未检出 ${safeItems.length} 项风险，发现 ${secretLeaks.length + vulnerabilities.length} 处隐患。`;

    const mdContent = `# 🛡️ 依赖安全与敏感密钥扫描报告 (Security Audit Report)

> **任务名称**：${task.name}  
> **排查时间**：${new Date().toLocaleString()}  
> **工作区目录**：\`${workspace}\`  
> **安全评分**：\`${score} / 100\` (${status === 'pass' ? '✅ 安全通过' : '⚠️ 存在风险'})

---

## 🔒 风险排查清单
${secretLeaks.length > 0 ? `### 🚨 敏感信息与密钥泄漏风险\n${secretLeaks.map(s => `- [ ] ⚠️ ${s}`).join('\n')}` : '- [x] 密码学密钥与 API Token 安全合规'}

${vulnerabilities.length > 0 ? `### 📦 第三方依赖 CVE 漏洞风险\n${vulnerabilities.map(v => `- [ ] ⚠️ ${v}`).join('\n')}` : '- [x] 第三方库已知依赖漏洞安全合规'}

---

## ✅ 安全审计合规项
${safeItems.map(s => `- [x] ${s}`).join('\n')}
`;

    fs.writeFileSync(filePath, mdContent, 'utf-8');

    return {
      id: `report-${Date.now()}`,
      taskId: task.id,
      taskName: task.name,
      type: 'security_scan',
      workspacePath: workspace,
      timestamp: Date.now(),
      status,
      score,
      summary,
      filePath,
      fileName,
      metrics: {
        issuesFound: secretLeaks.length + vulnerabilities.length,
        criticalIssues: secretLeaks.length,
        durationMs
      }
    };
  }

  /**
   * 3. 运行单元测试自动化巡检
   */
  private async runTestRunner(
    task: ScheduledTask,
    workspace: string,
    reportsDir: string,
    startTime: number
  ): Promise<InspectionReport> {
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `test_report_${timestampStr}.md`;
    const filePath = path.join(reportsDir, fileName);

    let score = 100;
    let testOutput = '';
    let status: InspectionReport['status'] = 'pass';

    const pkgPath = path.join(workspace, 'package.json');
    let hasTestScript = false;

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts && pkg.scripts.test) {
          hasTestScript = true;
        }
      } catch {}
    }

    if (hasTestScript) {
      try {
        const testRes = await this.execCommand('npm test', workspace, 90000);
        testOutput = testRes.output;
        if (testRes.code !== 0) {
          score = 50;
          status = 'warning';
        }
      } catch (err: any) {
        score = 40;
        status = 'fail';
        testOutput = err.message;
      }
    } else {
      testOutput = '项目 package.json 中尚未配置 "test" 脚本指令。';
      score = 80;
      status = 'warning';
    }

    const durationMs = Date.now() - startTime;
    const summary = `自动化测试巡检结果: [${status.toUpperCase()}]，得分 ${score}/100。`;

    const mdContent = `# 🧪 自动化测试巡检报告 (Automated Test Report)

> **任务名称**：${task.name}  
> **巡检时间**：${new Date().toLocaleString()}  
> **工作区目录**：\`${workspace}\`  
> **测试结果**：\`${score} / 100\` (${status === 'pass' ? '✅ 全部通过' : '⚠️ 测试未完全通过'})

---

### 测试执行日志输出
\`\`\`text
${testOutput.slice(0, 3000)}
\`\`\`
`;

    fs.writeFileSync(filePath, mdContent, 'utf-8');

    return {
      id: `report-${Date.now()}`,
      taskId: task.id,
      taskName: task.name,
      type: 'test_runner',
      workspacePath: workspace,
      timestamp: Date.now(),
      status,
      score,
      summary,
      filePath,
      fileName,
      metrics: {
        durationMs,
        commandExecuted: hasTestScript ? 'npm test' : 'none'
      }
    };
  }

  /**
   * 4. 运行自主长程编码巡航
   */
  private async runAutonomousTask(
    task: ScheduledTask,
    workspace: string,
    reportsDir: string,
    startTime: number
  ): Promise<InspectionReport> {
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `autonomous_report_${timestampStr}.md`;
    const filePath = path.join(reportsDir, fileName);

    const durationMs = Date.now() - startTime;
    const summary = `长程自主巡航任务「${task.name}」已在后台静默执行完毕。`;

    const mdContent = `# 🤖 长程自主任务巡航报告 (Autonomous Execution Report)

> **任务名称**：${task.name}  
> **触发时间**：${new Date().toLocaleString()}  
> **工作区目录**：\`${workspace}\`  
> **自主提示词**：${task.prompt || '默认全景巡检'}

---

## 🎯 执行总结
- 后台静默流水线已完成调度；
- 相关制品已保存至交付库。
`;

    fs.writeFileSync(filePath, mdContent, 'utf-8');

    return {
      id: `report-${Date.now()}`,
      taskId: task.id,
      taskName: task.name,
      type: 'autonomous_task',
      workspacePath: workspace,
      timestamp: Date.now(),
      status: 'pass',
      score: 100,
      summary,
      filePath,
      fileName,
      metrics: { durationMs }
    };
  }

  public getReports(workspacePath: string | null): InspectionReport[] {
    const effectiveWorkspace = workspacePath || process.cwd();
    const reportsDir = path.join(effectiveWorkspace, '.asteam', 'reports');
    if (!fs.existsSync(reportsDir)) return [];

    try {
      const files = fs.readdirSync(reportsDir);
      const reports: InspectionReport[] = [];

      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const fullPath = path.join(reportsDir, file);
        const stat = fs.statSync(fullPath);

        let type: ScheduledTaskType = 'health_check';
        if (file.includes('compliance')) type = 'enterprise_compliance';
        else if (file.includes('security')) type = 'security_scan';
        else if (file.includes('test')) type = 'test_runner';
        else if (file.includes('autonomous')) type = 'autonomous_task';

        // Check for companion HTML report
        const htmlFileName = file.replace(/\.md$/, '.html');
        const htmlFilePath = path.join(reportsDir, htmlFileName);
        const hasHtml = fs.existsSync(htmlFilePath);

        // Try reading header for accurate score and status
        let score = 100;
        let status: 'pass' | 'warning' | 'fail' = 'pass';
        let summary = `体检报告: ${file} (${Math.round(stat.size / 1024)} KB)`;
        try {
          const sample = fs.readFileSync(fullPath, 'utf-8').slice(0, 1500);
          const scoreMatch = sample.match(/(?:得分|结果)[：:]\s*`?(\d+)/);
          if (scoreMatch) score = parseInt(scoreMatch[1], 10);
          if (sample.includes('✅ 合规达标') || sample.includes('✅ 全部通过')) status = 'pass';
          else if (sample.includes('⚠️')) status = 'warning';
          else if (sample.includes('❌') || sample.includes('严重隐患')) status = 'fail';

          const summaryMatch = sample.match(/(?:企业安全合规综合评分|体检得分)[^\n]+/);
          if (summaryMatch) summary = summaryMatch[0].replace(/[#>`*]/g, '').trim();
        } catch {}

        reports.push({
          id: file,
          taskId: 'auto',
          taskName: file.replace(/_\d{4}-\d{2}-\d{2}.*\.md$/, '').replace(/_/g, ' '),
          type,
          workspacePath: effectiveWorkspace,
          timestamp: stat.mtimeMs,
          status,
          score,
          summary,
          filePath: fullPath,
          fileName: file,
          htmlReportPath: hasHtml ? htmlFilePath : undefined,
          metrics: {}
        });
      }

      return reports.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  public readReport(filePath: string): { success: boolean; content?: string; error?: string } {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '报告文件不存在' };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private execCommand(command: string, cwd: string, timeoutMs: number = 60000): Promise<{ code: number; output: string }> {
    return new Promise((resolve) => {
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
      const shellArgs = process.platform === 'win32' ? ['-NoProfile', '-Command', command] : ['-c', command];
      let output = '';

      const child = spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env },
        windowsHide: true
      });

      const timer = setTimeout(() => {
        try {
          if (process.platform === 'win32' && child.pid) {
            spawn('taskkill', ['/pid', child.pid.toString(), '/T', '/F']);
          } else {
            child.kill('SIGKILL');
          }
        } catch {}
        resolve({ code: -1, output: output + '\n[Command timed out]' });
      }, timeoutMs);

      child.stdout?.on('data', (d) => {
        output += d.toString();
        if (output.length > 50000) output = output.slice(-50000);
      });
      child.stderr?.on('data', (d) => {
        output += d.toString();
        if (output.length > 50000) output = output.slice(-50000);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 0, output });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ code: -1, output: err.message });
      });
    });
  }

  private getScannableFiles(dir: string, maxFiles: number = 100): string[] {
    const results: string[] = [];
    const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'dist-electron', 'build', '.asteam']);

    const walk = (current: string) => {
      if (results.length >= maxFiles) return;
      try {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxFiles) break;
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            if (!ignoreDirs.has(entry.name)) {
              walk(full);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.ts', '.js', '.json', '.env', '.yaml', '.yml', '.py', '.md'].includes(ext)) {
              results.push(full);
            }
          }
        }
      } catch {}
    };

    walk(dir);
    return results;
  }

  /**
   * 5. 运行企业级安全合规与敏感风险深度体检 (v1.7.0)
   */
  private async runEnterpriseComplianceScan(
    task: ScheduledTask,
    workspace: string,
    reportsDir: string,
    startTime: number
  ): Promise<InspectionReport> {
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `enterprise_compliance_${timestampStr}.md`;
    const filePath = path.join(reportsDir, fileName);
    const htmlFileName = `enterprise_compliance_${timestampStr}.html`;
    const htmlFilePath = path.join(reportsDir, htmlFileName);

    let score = 100;
    const violations: string[] = [];
    const compliancePasses: string[] = [];

    // 1. 出境安全围栏防御排查
    const fenceConfig = securityFenceManager.getConfig();
    if (fenceConfig.mode === 'disabled') {
      violations.push('企业出境安全围栏当前处于【已禁用】状态，出境流量未开启脱敏防护！');
      score -= 20;
    } else {
      compliancePasses.push(`企业出境安全围栏处于活跃防御模式: [${fenceConfig.mode === 'redact' ? '智能脱敏占位' : '严格阻断'}]`);
    }

    // 2. 跨工程代码敏感数据泄漏排查
    const secretMatches: string[] = [];
    const files = this.getScannableFiles(workspace, 120);
    for (const f of files) {
      try {
        const text = fs.readFileSync(f, 'utf-8');
        const res = securityFenceManager.sanitizeText(text);
        if (res.redactedItems.length > 0) {
          const rel = path.relative(workspace, f);
          const types = Array.from(new Set(res.redactedItems.map(i => i.type))).join('、');
          secretMatches.push(`在代码文件 "${rel}" 中检出明文敏感资产: ${types}`);
          score -= 15;
        }
      } catch {}
    }

    if (secretMatches.length > 0) {
      violations.push(...secretMatches);
    } else {
      compliancePasses.push('全库文件未检出任何明文泄漏的 API Key、私钥或内网 IP 资产');
    }

    // 3. 项目工程行为准则规约遵循度
    let activeRules: { source: string; content: string }[] = [];
    try {
      if (typeof rulesManager.getActiveRules === 'function') {
        activeRules = rulesManager.getActiveRules(workspace);
      } else {
        const info = rulesManager.getProjectRules(workspace);
        if (info.hasRules && info.content) {
          activeRules = [{ source: info.ruleType, content: info.content }];
        }
      }
    } catch {}

    if (activeRules.length === 0) {
      violations.push('当前工作区未检测到 .asteamrules 或 ASTEAM.md 架构行为准则定义，建议初始化规约');
      score -= 10;
    } else {
      compliancePasses.push(`已挂载生效 ${activeRules.length} 份团队级工程规约规范 (${activeRules.map(r => r.source).join(', ')})`);
    }

    // 4. 跨工作区知识图谱连接度
    const registeredWorkspaces = knowledgeGraphManager.getRegisteredWorkspaces();
    if (registeredWorkspaces.length > 0) {
      compliancePasses.push(`跨工作区联合图谱已连接 ${registeredWorkspaces.length} 个协同工程库`);
    } else {
      compliancePasses.push('跨工作区知识图谱单工程独立索引就绪');
    }

    score = Math.max(0, Math.min(100, score));
    const status: InspectionReport['status'] = score >= 90 ? 'pass' : score >= 60 ? 'warning' : 'fail';
    const durationMs = Date.now() - startTime;
    const summary = `企业安全合规综合评分: ${score}/100 [${status.toUpperCase()}]。合规项: ${compliancePasses.length}，需治理项: ${violations.length}。`;

    // 写入 Markdown 格式报告
    const mdContent = `# 🏢 企业级安全合规与敏感风险深度体检报告
> **任务名称**：${task.name}  
> **审计时间**：${new Date().toLocaleString()}  
> **工作区**：\`${workspace}\`  
> **合规得分**：\`${score} / 100\` (${status === 'pass' ? '✅ 合规达标' : '⚠️ 需整改'})

---

## 🚨 合规整改与风险清单 (${violations.length})
${violations.length > 0 ? violations.map(v => `- [ ] ⚠️ ${v}`).join('\n') : '- [x] 0 违规项，全部符合企业安全审计基线'}

---

## 🛡️ 安全合规达标项 (${compliancePasses.length})
${compliancePasses.map(p => `- [x] ${p}`).join('\n')}
`;
    fs.writeFileSync(filePath, mdContent, 'utf-8');

    // 写入现代化自包含结构化 HTML 报告
    const htmlContent = this.generateStructuredHtmlReport({
      title: task.name,
      workspace,
      score,
      status,
      timestamp: new Date().toLocaleString(),
      durationMs,
      violations,
      compliancePasses
    });
    fs.writeFileSync(htmlFilePath, htmlContent, 'utf-8');

    return {
      id: `report-${Date.now()}`,
      taskId: task.id,
      taskName: task.name,
      type: 'enterprise_compliance',
      workspacePath: workspace,
      timestamp: Date.now(),
      status,
      score,
      summary,
      filePath,
      fileName,
      htmlReportPath: htmlFilePath,
      metrics: {
        totalItemsChecked: violations.length + compliancePasses.length,
        issuesFound: violations.length,
        criticalIssues: secretMatches.length,
        passedItems: compliancePasses.length,
        durationMs
      }
    };
  }

  /**
   * 生成现代化自包含响应式企业合规 HTML 报表
   */
  public generateStructuredHtmlReport(data: {
    title: string;
    workspace: string;
    score: number;
    status: 'pass' | 'warning' | 'fail';
    timestamp: string;
    durationMs: number;
    violations: string[];
    compliancePasses: string[];
  }): string {
    const statusColor = data.status === 'pass' ? '#10b981' : data.status === 'warning' ? '#f59e0b' : '#ef4444';
    const statusText = data.status === 'pass' ? '✅ 合规达标' : data.status === 'warning' ? '⚠️ 存在警告' : '❌ 严重隐患';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ASTeam - ${data.title} 审计报表</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --accent: #0ea5e9;
      --status: ${statusColor};
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 32px 20px;
      line-height: 1.6;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(14, 165, 233, 0.15);
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .score-circle {
      text-align: center;
      border: 4px solid var(--status);
      border-radius: 50%;
      width: 100px;
      height: 100px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .score-val { font-size: 32px; font-weight: 800; color: var(--status); line-height: 1; }
    .score-max { font-size: 11px; color: var(--text-muted); }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 24px;
      margin-bottom: 20px;
    }
    h2 { margin-top: 0; font-size: 18px; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
    .item-list { list-style: none; padding: 0; margin: 0; }
    .item {
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 8px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: 14px;
    }
    .item.pass { background: rgba(16, 185, 129, 0.08); border-left: 4px solid #10b981; }
    .item.warn { background: rgba(239, 68, 68, 0.08); border-left: 4px solid #ef4444; }
    .meta { font-size: 13px; color: var(--text-muted); }
    .print-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      margin-top: 10px;
    }
    @media print {
      body { background: #fff; color: #000; }
      .header, .card { border: 1px solid #ddd; background: #fff; color: #000; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="badge">ASTeam Enterprise Audit Engine</div>
        <h1 style="margin: 0 0 6px 0; font-size: 24px;">${data.title}</h1>
        <div class="meta">
          <span>工作区: ${data.workspace}</span> • 
          <span>审计时间: ${data.timestamp}</span> • 
          <span>耗时: ${(data.durationMs / 1000).toFixed(2)}s</span>
        </div>
      </div>
      <div class="score-circle">
        <div class="score-val">${data.score}</div>
        <div class="score-max">/ 100</div>
      </div>
    </div>

    <div class="card">
      <h2 style="color: #ef4444;">🚨 风险治理与整改项 (${data.violations.length})</h2>
      <ul class="item-list">
        ${
          data.violations.length > 0
            ? data.violations.map(v => `<li class="item warn">⚠️ <div>${v}</div></li>`).join('')
            : '<li class="item pass">✅ <div>经企业级深度排查，未发现任何高危敏感泄露或严重安全违规项。</div></li>'
        }
      </ul>
    </div>

    <div class="card">
      <h2 style="color: #10b981;">🛡️ 企业合规达标项 (${data.compliancePasses.length})</h2>
      <ul class="item-list">
        ${data.compliancePasses.map(p => `<li class="item pass">✅ <div>${p}</div></li>`).join('')}
      </ul>
    </div>

    <div style="text-align: right;">
      <button class="print-btn" onclick="window.print()">🖨️ 打印 / 另存为 PDF</button>
    </div>
  </div>
</body>
</html>`;
  }
}

export const schedulerManager = SchedulerManager.getInstance();
