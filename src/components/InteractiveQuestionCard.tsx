import React, { useState } from 'react';
import {
  HelpCircle,
  CheckCircle2,
  Send,
  Sparkles,
  Flame,
  Check
} from 'lucide-react';

export interface SubQuestion {
  question: string;
  options?: string[];
  multiSelect?: boolean;
}

export interface QuestionCardData {
  questionId: string;
  question: string;
  options?: string[];
  questions?: SubQuestion[];
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
  // Single question state
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [customText, setCustomText] = useState<string>('');

  // Multi question state (Grill-me interview mode)
  const [multiAnswers, setMultiAnswers] = useState<Record<number, string>>({});
  const [multiCustom, setMultiCustom] = useState<Record<number, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);

  // 【核心机制】当 questionId 切换为新问题时，彻底清空上一题的选中项和本地答复，杜绝答非所问与状态死锁
  React.useEffect(() => {
    setSelectedOption('');
    setCustomText('');
    setMultiAnswers({});
    setMultiCustom({});
    setIsSubmitting(false);
    setSubmittedAnswer(null);
  }, [data.questionId]);

  const isAnswered = !!data.answered || submittedAnswer !== null;
  const displayAnswer = data.selectedAnswer || submittedAnswer || '';
  const isMultiQuestion = Boolean(data.questions && data.questions.length > 0);

  // Single question submit
  const handleSingleSubmit = () => {
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

    setSubmittedAnswer(finalAnswer);
    setIsSubmitting(false);
    onSubmitAnswer(data.questionId, finalAnswer);
  };

  // Multi question (Grill-me) submit
  const handleMultiSubmit = () => {
    if (!data.questions || data.questions.length === 0) return;
    setIsSubmitting(true);

    const answersList = data.questions.map((q, idx) => {
      const selected = multiAnswers[idx];
      const custom = (multiCustom[idx] || '').trim();
      let ans = '';
      if (selected && custom) {
        ans = `${selected} (补充说明: ${custom})`;
      } else if (selected) {
        ans = selected;
      } else if (custom) {
        ans = custom;
      } else {
        ans = '默认/由 Agent 自主决定';
      }
      return `${idx + 1}. ${q.question}: ${ans}`;
    });

    const finalAnswer = answersList.join('\n');
    setSubmittedAnswer(finalAnswer);
    setIsSubmitting(false);
    onSubmitAnswer(data.questionId, finalAnswer);
  };

  const canSubmitMulti = isMultiQuestion && data.questions
    ? data.questions.some((_, idx) => !!multiAnswers[idx] || !!multiCustom[idx]?.trim())
    : false;

  return (
    <div className="my-3 rounded-xl border border-[var(--primary)]/40 bg-[var(--card)] p-4 shadow-md select-text">
      {/* Header */}
      <div className="flex items-center space-x-2 border-b border-[var(--border)] pb-2.5 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--primary)] text-white shadow-2xs">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-xs text-[var(--foreground)]">
              Agent 交互确认 / 决策问答
            </span>
            {isMultiQuestion && (
              <span className="rounded bg-[var(--primary)]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--primary)]">
                Grill-me 多维调研
              </span>
            )}
          </div>
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

      {/* Main Question / Prompt */}
      <div className="text-xs font-medium text-[var(--foreground)] leading-relaxed mb-3">
        {data.question}
      </div>

      {!isAnswered ? (
        isMultiQuestion && data.questions ? (
          /* Multi-Question (Grill-me mode) Layout */
          <div className="space-y-3.5">
            {data.questions.map((subQ, idx) => {
              const selected = multiAnswers[idx] || '';
              const custom = multiCustom[idx] || '';
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)]/60 p-3"
                >
                  <div className="text-xs font-semibold text-[var(--foreground)] mb-2 flex items-center space-x-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)]/20 text-[var(--primary)] text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <span>{subQ.question}</span>
                  </div>

                  {/* Options Chips */}
                  {subQ.options && subQ.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2.5">
                      {subQ.options.map((opt, optIdx) => {
                        const isSelected = selected === opt;
                        return (
                          <div
                            key={optIdx}
                            onClick={() => {
                              setMultiAnswers(prev => ({
                                ...prev,
                                [idx]: isSelected ? '' : opt
                              }));
                            }}
                            className={`flex items-center justify-between rounded-md border p-2 cursor-pointer text-xs transition-all ${
                              isSelected
                                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] font-semibold shadow-2xs'
                                : 'border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--primary)]/50'
                            }`}
                          >
                            <span className="leading-snug">{opt}</span>
                            <div
                              className={`h-3.5 w-3.5 rounded-full border flex-shrink-0 ml-1.5 flex items-center justify-center ${
                                isSelected
                                  ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                                  : 'border-[var(--input)]'
                              }`}
                            >
                              {isSelected && <Check className="h-2 w-2" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Custom Write-in for this sub-question */}
                  <div>
                    <input
                      type="text"
                      value={custom}
                      onChange={e => {
                        const val = e.target.value;
                        setMultiCustom(prev => ({ ...prev, [idx]: val }));
                      }}
                      placeholder={`补充说明或自定义要求（可选）...`}
                      className="w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
                    />
                  </div>
                </div>
              );
            })}

            {/* Bottom Submit Button for Multi-Question */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleMultiSubmit}
                disabled={!canSubmitMulti || isSubmitting}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="h-3 w-3" />
                <span>{isSubmitting ? '正在提交...' : '确认并发送给 Agent'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Single Question Layout (Backward Compatible) */
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
                    handleSingleSubmit();
                  }
                }}
              />
            </div>

            {/* Action Submit */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleSingleSubmit}
                disabled={(!selectedOption && !customText.trim()) || isSubmitting}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="h-3 w-3" />
                <span>{isSubmitting ? '正在提交...' : '确认并发送给 Agent'}</span>
              </button>
            </div>
          </div>
        )
      ) : (
        /* Answered Summary */
        <div className="rounded-lg bg-[var(--muted)]/60 p-3 text-xs border border-[var(--border)]/60">
          <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase block mb-1">
            您的确认答复：
          </span>
          <div className="font-semibold text-[var(--primary)] whitespace-pre-line leading-relaxed">
            {displayAnswer || '已确认'}
          </div>
        </div>
      )}
    </div>
  );
};
