import React, { useState } from 'react';
import {
  HelpCircle,
  CheckCircle2,
  Send,
  Sparkles,
  Flame,
  Check
} from 'lucide-react';

export interface QuestionCardData {
  questionId: string;
  question: string;
  options?: string[];
  multiSelect?: boolean;
  answered?: boolean;
  selectedAnswer?: string;
}

interface InteractiveQuestionCardProps {
  data: QuestionCardData;
  onSubmitAnswer: (questionId: string, answer: string) => void;
}

export const InteractiveQuestionCard: React.FC<InteractiveQuestionCardProps> = ({
  data,
  onSubmitAnswer
}) => {
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [customText, setCustomText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAnswered = !!data.answered;

  const handleSubmit = () => {
    let finalAnswer = '';
    if (selectedOption && customText.trim()) {
      finalAnswer = `${selectedOption} (补充说明: ${customText.trim()})`;
    } else if (selectedOption) {
      finalAnswer = selectedOption;
    } else if (customText.trim()) {
      finalAnswer = customText.trim();
    } else {
      return;
    }

    setIsSubmitting(true);
    onSubmitAnswer(data.questionId, finalAnswer);
  };

  return (
    <div className="my-3 rounded-xl border border-[var(--primary)]/40 bg-[var(--card)] p-4 shadow-md select-text">
      {/* Header */}
      <div className="flex items-center space-x-2 border-b border-[var(--border)] pb-2.5 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--primary)] text-white shadow-2xs">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1">
          <span className="font-semibold text-xs text-[var(--foreground)]">
            Agent 交互确认 / 决策问答
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)] block">
            Agent 正在等待您的回复以继续下一步规划
          </span>
        </div>
        {isAnswered && (
          <span className="inline-flex items-center space-x-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" />
            <span>已答复</span>
          </span>
        )}
      </div>

      {/* Question Text */}
      <div className="text-xs font-medium text-[var(--foreground)] leading-relaxed mb-3">
        {data.question}
      </div>

      {/* Options List */}
      {!isAnswered ? (
        <div className="space-y-3">
          {data.options && data.options.length > 0 && (
            <div className="space-y-1.5">
              {data.options.map((opt, idx) => {
                const isSelected = selectedOption === opt;
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedOption(opt)}
                    className={`flex items-center justify-between rounded-lg border p-2.5 cursor-pointer text-xs transition-all ${
                      isSelected
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] font-semibold shadow-2xs'
                        : 'border-[var(--border)] bg-[var(--background)]/60 text-[var(--foreground)] hover:border-[var(--primary)]/50'
                    }`}
                  >
                    <span>{opt}</span>
                    <div
                      className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                        isSelected
                          ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                          : 'border-[var(--input)]'
                      }`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Custom Write-in Field */}
          <div>
            <input
              type="text"
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="输入自定义说明或选择上述选项..."
              className="w-full rounded-lg border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          {/* Action Submit */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={(!selectedOption && !customText.trim()) || isSubmitting}
              className="inline-flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-3 w-3" />
              <span>{isSubmitting ? '正在提交...' : '确认并发送给 Agent'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-[var(--muted)]/60 p-2.5 text-xs border border-[var(--border)]/60">
          <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block mb-1">
            您的确认答复：
          </span>
          <div className="font-semibold text-[var(--primary)]">
            {data.selectedAnswer || '已确认'}
          </div>
        </div>
      )}
    </div>
  );
};
