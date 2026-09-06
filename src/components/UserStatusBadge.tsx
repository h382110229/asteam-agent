import React from 'react';

/**
 * 用户状态枚举
 * 定义系统支持的所有用户在线状态
 */
export enum UserStatus {
  ONLINE = 'online',       // 在线
  OFFLINE = 'offline',     // 离线
  BUSY = 'busy',           // 忙碌
  AWAY = 'away',           // 离开
  DO_NOT_DISTURB = 'dnd',  // 请勿打扰
}

/**
 * 状态配置接口
 * 定义每种状态对应的视觉表现和文案
 */
interface StatusConfig {
  label: string;           // 状态文案
  dotColor: string;        // 状态圆点颜色（Tailwind class）
  bgColor: string;         // 背景色（Tailwind class）
  textColor: string;       // 文字色（Tailwind class）
  pulse?: boolean;         // 是否需要脉冲动画（仅在线状态）
}

/**
 * 组件属性接口
 */
export interface UserStatusBadgeProps {
  /** 用户状态 */
  status: UserStatus;
  /** 用户名称（可选，用于带名称展示） */
  username?: string;
  /** 用户头像 URL（可选） */
  avatarUrl?: string;
  /** 是否显示状态文案 */
  showLabel?: boolean;
  /** 组件尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 自定义类名 */
  className?: string;
  /** 状态变更回调（用于交互场景） */
  onStatusClick?: (status: UserStatus) => void;
}

/**
 * 状态配置映射表
 * 使用 ASTeam 主题色 #006857 作为在线状态标识
 */
const STATUS_CONFIG: Record<UserStatus, StatusConfig> = {
  [UserStatus.ONLINE]: {
    label: '在线',
    dotColor: 'bg-[#006857]',
    bgColor: 'bg-[#006857]/10',
    textColor: 'text-[#006857]',
    pulse: true,
  },
  [UserStatus.OFFLINE]: {
    label: '离线',
    dotColor: 'bg-gray-400',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-500',
  },
  [UserStatus.BUSY]: {
    label: '忙碌',
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-50',
    textColor: 'text-red-600',
  },
  [UserStatus.AWAY]: {
    label: '离开',
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
  },
  [UserStatus.DO_NOT_DISTURB]: {
    label: '请勿打扰',
    dotColor: 'bg-purple-500',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
  },
};

/**
 * 尺寸样式映射
 */
const SIZE_CLASSES = {
  sm: {
    dot: 'w-2 h-2',
    badge: 'px-2 py-0.5 text-xs',
    avatar: 'w-6 h-6',
    avatarDot: 'w-2.5 h-2.5 -right-0.5 -bottom-0.5',
  },
  md: {
    dot: 'w-2.5 h-2.5',
    badge: 'px-3 py-1 text-sm',
    avatar: 'w-8 h-8',
    avatarDot: 'w-3 h-3 -right-0.5 -bottom-0.5',
  },
  lg: {
    dot: 'w-3 h-3',
    badge: 'px-4 py-1.5 text-base',
    avatar: 'w-10 h-10',
    avatarDot: 'w-3.5 h-3.5 right-0 bottom-0',
  },
} as const;

/**
 * UserStatusBadge - 用户状态指示器组件
 *
 * @description 用于展示用户在线状态的通用组件，支持多种展示模式：
 * 1. 纯状态点模式（默认）
 * 2. 带文案的徽章模式
 * 3. 头像 + 状态点的组合模式
 *
 * @example
 * // 纯状态点
 * <UserStatusBadge status={UserStatus.ONLINE} />
 *
 * // 带文案
 * <UserStatusBadge status={UserStatus.BUSY} showLabel />
 *
 * // 头像模式
 * <UserStatusBadge
 *   status={UserStatus.ONLINE}
 *   username="张三"
 *   avatarUrl="/avatars/zhangsan.png"
 * />
 */
const UserStatusBadge: React.FC<UserStatusBadgeProps> = ({
  status,
  username,
  avatarUrl,
  showLabel = false,
  size = 'md',
  className = '',
  onStatusClick,
}) => {
  // 防御性编程：校验 status 参数合法性
  const config = STATUS_CONFIG[status];
  if (!config) {
    console.warn(`[UserStatusBadge] 无效的状态值: ${status}`);
    return null;
  }

  const sizeClasses = SIZE_CLASSES[size];
  const isClickable = typeof onStatusClick === 'function';

  /**
   * 渲染状态圆点
   * 在线状态带脉冲动画效果
   */
  const renderStatusDot = (positionClass = ''): React.ReactNode => (
    <span
      className={`
        inline-block rounded-full border-2 border-white
        ${sizeClasses.dot} ${sizeClasses.avatarDot || positionClass}
        ${config.dotColor}
        ${config.pulse ? 'animate-pulse' : ''}
      `}
      aria-hidden="true"
    />
  );

  /**
   * 渲染纯状态点模式
   */
  const renderDotOnly = (): React.ReactNode => (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      role="status"
      aria-label={`用户状态: ${config.label}`}
    >
      {renderStatusDot('relative')}
      {showLabel && (
        <span className={`${config.textColor} font-medium`}>
          {config.label}
        </span>
      )}
    </span>
  );

  /**
   * 渲染头像 + 状态点组合模式
   */
  const renderWithAvatar = (): React.ReactNode => {
    // 防御性编程：头像加载失败时的 fallback
    const handleAvatarError = (e: React.SyntheticEvent<HTMLImageElement>): void => {
      const target = e.currentTarget;
      target.style.display = 'none';
      // 显示 fallback 首字母
      const fallback = target.nextElementSibling as HTMLElement;
      if (fallback) fallback.style.display = 'flex';
    };

    const firstChar = username ? username.charAt(0).toUpperCase() : '?';

    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <span className="relative inline-block">
          {/* 头像 */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username || '用户头像'}
              className={`${sizeClasses.avatar} rounded-full object-cover`}
              onError={handleAvatarError}
            />
          ) : null}
          {/* Fallback 首字母头像 */}
          <span
            className={`${sizeClasses.avatar} rounded-full bg-[#006857]/10 text-[#006857]
              font-semibold flex items-center justify-center
              ${avatarUrl ? 'hidden' : 'flex'}
            `}
            aria-hidden={!!avatarUrl}
          >
            {firstChar}
          </span>
          {/* 状态指示点 */}
          {renderStatusDot()}
        </span>
        {/* 用户信息 */}
        {(username || showLabel) && (
          <span className="flex flex-col">
            {username && (
              <span className="text-sm font-medium text-gray-900">{username}</span>
            )}
            {showLabel && (
              <span className={`text-xs ${config.textColor}`}>{config.label}</span>
            )}
          </span>
        )}
      </span>
      </div>
    );
  };

  /**
   * 渲染带容器的徽章模式
   */
  const renderBadge = (): React.ReactNode => (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${sizeClasses.badge} ${config.bgColor} ${config.textColor}
        ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
        ${className}
      `}
      role="status"
      aria-label={`用户状态: ${config.label}`}
      onClick={isClickable ? () => onStatusClick(status) : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onStatusClick(status);
              }
            }
          : undefined
      }
    >
      {renderStatusDot('relative')}
      <span>{config.label}</span>
    </span>
  );

  // 根据是否传入 avatarUrl/username 决定渲染模式
  if (avatarUrl || username) {
    return renderWithAvatar();
  }

  if (showLabel) {
    return renderBadge();
  }

  return renderDotOnly();
};

// 设置组件 displayName，便于 DevTools 调试
UserStatusBadge.displayName = 'UserStatusBadge';

export default UserStatusBadge;
