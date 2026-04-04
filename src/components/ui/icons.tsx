import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

const defaultProps: Required<Pick<IconProps, "size">> = { size: 16 };

function icon(path: React.ReactNode, displayName: string) {
  const Component = ({ className, size = defaultProps.size }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {path}
    </svg>
  );
  Component.displayName = displayName;
  return Component;
}

// ---------------------------------------------------------------------------
// Pillar icons
// ---------------------------------------------------------------------------

/** Terminal / console prompt */
export const SessionsIcon = icon(
  <>
    <rect x="2" y="2" width="12" height="12" rx="2" />
    <polyline points="5 6 7 8 5 10" />
    <line x1="9" y1="10" x2="11" y2="10" />
  </>,
  "SessionsIcon",
);

/** Chat bubble */
export const RoomsIcon = icon(
  <path d="M3 3h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6l-3 2.5V4a1 1 0 0 1 1-1z" />,
  "RoomsIcon",
);

/** Checkmark in circle — workflow / sprint */
export const SprintsIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <polyline points="5.5 8 7.2 9.8 10.5 6.2" />
  </>,
  "SprintsIcon",
);

/** Layers / book — memory / knowledge */
export const MemoryIcon = icon(
  <>
    <rect x="3" y="2" width="10" height="12" rx="1" />
    <line x1="6" y1="5" x2="10" y2="5" />
    <line x1="6" y1="7.5" x2="10" y2="7.5" />
    <line x1="6" y1="10" x2="8.5" y2="10" />
  </>,
  "MemoryIcon",
);

// ---------------------------------------------------------------------------
// Action icons
// ---------------------------------------------------------------------------

/** Gear */
export const SettingsIcon = icon(
  <>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 2.5v1.2M8 12.3v1.2M2.5 8h1.2M12.3 8h1.2M4.1 4.1l.85.85M11.05 11.05l.85.85M4.1 11.9l.85-.85M11.05 4.95l.85-.85" />
  </>,
  "SettingsIcon",
);

/** Plus */
export const PlusIcon = icon(
  <>
    <line x1="8" y1="3.5" x2="8" y2="12.5" />
    <line x1="3.5" y1="8" x2="12.5" y2="8" />
  </>,
  "PlusIcon",
);

/** X / close */
export const CloseIcon = icon(
  <>
    <line x1="4.5" y1="4.5" x2="11.5" y2="11.5" />
    <line x1="11.5" y1="4.5" x2="4.5" y2="11.5" />
  </>,
  "CloseIcon",
);

/** Magnifying glass */
export const SearchIcon = icon(
  <>
    <circle cx="7" cy="7" r="4" />
    <line x1="10" y1="10" x2="13" y2="13" />
  </>,
  "SearchIcon",
);

/** Chevron down */
export const ChevronDownIcon = icon(
  <polyline points="4 6 8 10 12 6" />,
  "ChevronDownIcon",
);

/** Chevron right */
export const ChevronRightIcon = icon(
  <polyline points="6 4 10 8 6 12" />,
  "ChevronRightIcon",
);

/** Split screen */
export const SplitIcon = icon(
  <>
    <rect x="2" y="2" width="12" height="12" rx="1.5" />
    <line x1="8" y1="2" x2="8" y2="14" />
  </>,
  "SplitIcon",
);

/** Send — arrow up */
export const SendIcon = icon(
  <>
    <line x1="8" y1="13" x2="8" y2="3" />
    <polyline points="4 7 8 3 12 7" />
  </>,
  "SendIcon",
);

/** Pencil */
export const EditIcon = icon(
  <>
    <path d="M10.5 2.5l3 3L6 13H3v-3z" />
    <line x1="8.5" y1="4.5" x2="11.5" y2="7.5" />
  </>,
  "EditIcon",
);

/** Trash can */
export const TrashIcon = icon(
  <>
    <polyline points="3.5 5 4.5 13.5 11.5 13.5 12.5 5" />
    <line x1="2.5" y1="5" x2="13.5" y2="5" />
    <line x1="6" y1="3" x2="10" y2="3" />
    <line x1="6.5" y1="7.5" x2="6.5" y2="11" />
    <line x1="9.5" y1="7.5" x2="9.5" y2="11" />
  </>,
  "TrashIcon",
);

/** Filter / funnel */
export const FilterIcon = icon(
  <path d="M2.5 3.5h11L9 8.5v4l-2 1.5v-5.5z" />,
  "FilterIcon",
);

/** Checkmark */
export const CheckIcon = icon(
  <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />,
  "CheckIcon",
);

/** Warning triangle */
export const WarningIcon = icon(
  <>
    <path d="M8 2L1.5 13.5h13z" />
    <line x1="8" y1="6.5" x2="8" y2="9.5" />
    <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
  </>,
  "WarningIcon",
);

/** Info circle */
export const InfoIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <line x1="8" y1="7" x2="8" y2="11" />
    <circle cx="8" cy="5" r="0.5" fill="currentColor" stroke="none" />
  </>,
  "InfoIcon",
);

/** Bell */
export const BellIcon = icon(
  <>
    <path d="M4.5 6.5a3.5 3.5 0 0 1 7 0c0 2.5 1.5 4 1.5 4H3s1.5-1.5 1.5-4z" />
    <path d="M6.5 11.5a1.5 1.5 0 0 0 3 0" />
  </>,
  "BellIcon",
);

/** User / person */
export const UserIcon = icon(
  <>
    <circle cx="8" cy="5.5" r="2.5" />
    <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
  </>,
  "UserIcon",
);

/** Hash — channel prefix */
export const HashIcon = icon(
  <>
    <line x1="5.5" y1="3" x2="4.5" y2="13" />
    <line x1="11.5" y1="3" x2="10.5" y2="13" />
    <line x1="3" y1="6.5" x2="13" y2="6.5" />
    <line x1="3" y1="9.5" x2="13" y2="9.5" />
  </>,
  "HashIcon",
);

/** Arrow left */
export const ArrowLeftIcon = icon(
  <>
    <line x1="3" y1="8" x2="13" y2="8" />
    <polyline points="7 4 3 8 7 12" />
  </>,
  "ArrowLeftIcon",
);

// ---------------------------------------------------------------------------
// Extended icon set (replacing @phosphor-icons/react)
// ---------------------------------------------------------------------------

/** Chevron up */
export const ChevronUpIcon = icon(
  <polyline points="4 10 8 6 12 10" />,
  "ChevronUpIcon",
);

/** Save / floppy disk */
export const SaveIcon = icon(
  <>
    <path d="M3 3h8.5L14 5.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <rect x="5" y="9" width="6" height="4" rx="0.5" />
    <rect x="5" y="3" width="4" height="3" rx="0.5" />
  </>,
  "SaveIcon",
);

/** Folder open */
export const FolderIcon = icon(
  <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.5 2h5A1.5 1.5 0 0 1 14 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5z" />,
  "FolderIcon",
);

/** Refresh / arrow clockwise */
export const RefreshIcon = icon(
  <>
    <path d="M12.5 6.5a5 5 0 1 0 .5 4.5" />
    <polyline points="13 3 13 7 9 7" />
  </>,
  "RefreshIcon",
);

/** Clock */
export const ClockIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <polyline points="8 5 8 8 10.5 9.5" />
  </>,
  "ClockIcon",
);

/** Play triangle */
export const PlayIcon = icon(
  <polygon points="5 3 13 8 5 13" />,
  "PlayIcon",
);

/** Pause */
export const PauseIcon = icon(
  <>
    <rect x="4" y="3" width="2.5" height="10" rx="0.5" />
    <rect x="9.5" y="3" width="2.5" height="10" rx="0.5" />
  </>,
  "PauseIcon",
);

/** Stop / square */
export const StopIcon = icon(
  <rect x="3.5" y="3.5" width="9" height="9" rx="1" />,
  "StopIcon",
);

/** CPU chip */
export const CpuIcon = icon(
  <>
    <rect x="4" y="4" width="8" height="8" rx="1" />
    <line x1="6" y1="2" x2="6" y2="4" />
    <line x1="10" y1="2" x2="10" y2="4" />
    <line x1="6" y1="12" x2="6" y2="14" />
    <line x1="10" y1="12" x2="10" y2="14" />
    <line x1="2" y1="6" x2="4" y2="6" />
    <line x1="2" y1="10" x2="4" y2="10" />
    <line x1="12" y1="6" x2="14" y2="6" />
    <line x1="12" y1="10" x2="14" y2="10" />
  </>,
  "CpuIcon",
);

/** Hard drive / disk */
export const DiskIcon = icon(
  <>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <line x1="2" y1="9" x2="14" y2="9" />
    <circle cx="11" cy="11" r="0.7" fill="currentColor" stroke="none" />
  </>,
  "DiskIcon",
);

/** Monitor / desktop */
export const MonitorIcon = icon(
  <>
    <rect x="2" y="2.5" width="12" height="8.5" rx="1" />
    <line x1="8" y1="11" x2="8" y2="13.5" />
    <line x1="5" y1="13.5" x2="11" y2="13.5" />
  </>,
  "MonitorIcon",
);

/** Git branch */
export const GitBranchIcon = icon(
  <>
    <circle cx="5" cy="4" r="1.5" />
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="11" cy="6" r="1.5" />
    <line x1="5" y1="5.5" x2="5" y2="10.5" />
    <path d="M5 5.5c0 2 2 3 6 0.5" />
  </>,
  "GitBranchIcon",
);

/** Git commit */
export const GitCommitIcon = icon(
  <>
    <circle cx="8" cy="8" r="2.5" />
    <line x1="2" y1="8" x2="5.5" y2="8" />
    <line x1="10.5" y1="8" x2="14" y2="8" />
  </>,
  "GitCommitIcon",
);

/** Git merge */
export const GitMergeIcon = icon(
  <>
    <circle cx="5" cy="4" r="1.5" />
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="11" cy="12" r="1.5" />
    <line x1="5" y1="5.5" x2="5" y2="10.5" />
    <path d="M5 5.5c0 3 3 5 6 6.5" />
  </>,
  "GitMergeIcon",
);

/** Git pull request */
export const GitPRIcon = icon(
  <>
    <circle cx="5" cy="4" r="1.5" />
    <circle cx="11" cy="4" r="1.5" />
    <circle cx="11" cy="12" r="1.5" />
    <line x1="5" y1="5.5" x2="5" y2="14" />
    <line x1="11" y1="5.5" x2="11" y2="10.5" />
  </>,
  "GitPRIcon",
);

/** Lightning bolt */
export const BoltIcon = icon(
  <polygon points="9 2 4 9 8 9 7 14 12 7 8 7" />,
  "BoltIcon",
);

/** Rocket */
export const RocketIcon = icon(
  <>
    <path d="M8 2c3 0 5.5 3 5.5 6.5S8 14 8 14s-5.5-2-5.5-5.5S5 2 8 2z" />
    <circle cx="8" cy="7" r="1.5" />
  </>,
  "RocketIcon",
);

/** File / document */
export const FileIcon = icon(
  <path d="M4 2h5.5L13 5.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm5 0v4h4" />,
  "FileIcon",
);

/** File plus */
export const FilePlusIcon = icon(
  <>
    <path d="M4 2h5.5L13 5.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm5 0v4h4" />
    <line x1="8" y1="8" x2="8" y2="12" />
    <line x1="6" y1="10" x2="10" y2="10" />
  </>,
  "FilePlusIcon",
);

/** File minus */
export const FileMinusIcon = icon(
  <>
    <path d="M4 2h5.5L13 5.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm5 0v4h4" />
    <line x1="6" y1="10" x2="10" y2="10" />
  </>,
  "FileMinusIcon",
);

/** Upload / push */
export const UploadIcon = icon(
  <>
    <line x1="8" y1="10" x2="8" y2="3" />
    <polyline points="5 5.5 8 3 11 5.5" />
    <path d="M3 10v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" />
  </>,
  "UploadIcon",
);

/** External link / arrow square out */
export const ExternalLinkIcon = icon(
  <>
    <path d="M11 2h3v3" />
    <line x1="14" y1="2" x2="8" y2="8" />
    <path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
  </>,
  "ExternalLinkIcon",
);

/** Sun */
export const SunIcon = icon(
  <>
    <circle cx="8" cy="8" r="3" />
    <line x1="8" y1="2" x2="8" y2="3.5" />
    <line x1="8" y1="12.5" x2="8" y2="14" />
    <line x1="2" y1="8" x2="3.5" y2="8" />
    <line x1="12.5" y1="8" x2="14" y2="8" />
    <line x1="3.8" y1="3.8" x2="4.8" y2="4.8" />
    <line x1="11.2" y1="11.2" x2="12.2" y2="12.2" />
    <line x1="3.8" y1="12.2" x2="4.8" y2="11.2" />
    <line x1="11.2" y1="4.8" x2="12.2" y2="3.8" />
  </>,
  "SunIcon",
);

/** Moon */
export const MoonIcon = icon(
  <path d="M12 10A6 6 0 0 1 6 4a6 6 0 1 0 6 6z" />,
  "MoonIcon",
);

/** Sparkle / star */
export const SparkleIcon = icon(
  <path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5z" />,
  "SparkleIcon",
);

/** Eye */
export const EyeIcon = icon(
  <>
    <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" />
    <circle cx="8" cy="8" r="2" />
  </>,
  "EyeIcon",
);

/** Expand / arrows out */
export const ExpandIcon = icon(
  <>
    <polyline points="10 2 14 2 14 6" />
    <polyline points="6 14 2 14 2 10" />
    <line x1="14" y1="2" x2="9.5" y2="6.5" />
    <line x1="2" y1="14" x2="6.5" y2="9.5" />
  </>,
  "ExpandIcon",
);

/** Collapse / arrows in */
export const CollapseIcon = icon(
  <>
    <polyline points="14 6 10 6 10 2" />
    <polyline points="2 10 6 10 6 14" />
    <line x1="10" y1="6" x2="14" y2="2" />
    <line x1="6" y1="10" x2="2" y2="14" />
  </>,
  "CollapseIcon",
);

/** Zoom in / magnifying glass plus */
export const ZoomInIcon = icon(
  <>
    <circle cx="7" cy="7" r="4" />
    <line x1="10" y1="10" x2="13" y2="13" />
    <line x1="5.5" y1="7" x2="8.5" y2="7" />
    <line x1="7" y1="5.5" x2="7" y2="8.5" />
  </>,
  "ZoomInIcon",
);

/** Zoom out / magnifying glass minus */
export const ZoomOutIcon = icon(
  <>
    <circle cx="7" cy="7" r="4" />
    <line x1="10" y1="10" x2="13" y2="13" />
    <line x1="5.5" y1="7" x2="8.5" y2="7" />
  </>,
  "ZoomOutIcon",
);

/** Sidebar */
export const SidebarIcon = icon(
  <>
    <rect x="2" y="2" width="12" height="12" rx="1.5" />
    <line x1="6" y1="2" x2="6" y2="14" />
  </>,
  "SidebarIcon",
);

/** Question mark / help */
export const HelpIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.5 6a1.5 1.5 0 0 1 3 0c0 1-1.5 1.2-1.5 2.5" />
    <circle cx="8" cy="11" r="0.5" fill="currentColor" stroke="none" />
  </>,
  "HelpIcon",
);

/** Bug */
export const BugIcon = icon(
  <>
    <ellipse cx="8" cy="9" rx="3.5" ry="4.5" />
    <line x1="4" y1="7" x2="2" y2="5.5" />
    <line x1="12" y1="7" x2="14" y2="5.5" />
    <line x1="4" y1="11" x2="2" y2="12.5" />
    <line x1="12" y1="11" x2="14" y2="12.5" />
    <circle cx="8" cy="4" r="2" />
  </>,
  "BugIcon",
);

/** Wrench / tool */
export const WrenchIcon = icon(
  <path d="M10 3.5a3.5 3.5 0 0 0-4.5 4.5L3 10.5 5.5 13l2.5-2.5A3.5 3.5 0 0 0 12.5 6L10.5 8 9 6.5z" />,
  "WrenchIcon",
);

/** Shield */
export const ShieldIcon = icon(
  <path d="M8 2L3 4.5v4c0 3.5 2.5 5.5 5 7 2.5-1.5 5-3.5 5-7v-4z" />,
  "ShieldIcon",
);

/** Gauge / speedometer */
export const GaugeIcon = icon(
  <>
    <path d="M2 10a6 6 0 1 1 12 0" />
    <line x1="8" y1="10" x2="10" y2="5.5" />
    <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
  </>,
  "GaugeIcon",
);

/** Circle (hollow) */
export const CircleIcon = icon(
  <circle cx="8" cy="8" r="5" />,
  "CircleIcon",
);

/** Check circle */
export const CheckCircleIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <polyline points="5.5 8 7.2 9.8 10.5 6.2" />
  </>,
  "CheckCircleIcon",
);

/** X circle / error */
export const XCircleIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <line x1="5.8" y1="5.8" x2="10.2" y2="10.2" />
    <line x1="10.2" y1="5.8" x2="5.8" y2="10.2" />
  </>,
  "XCircleIcon",
);

/** Warning circle */
export const WarningCircleIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <line x1="8" y1="5" x2="8" y2="9" />
    <circle cx="8" cy="11" r="0.5" fill="currentColor" stroke="none" />
  </>,
  "WarningCircleIcon",
);

/** Arrow right */
export const ArrowRightIcon = icon(
  <>
    <line x1="3" y1="8" x2="13" y2="8" />
    <polyline points="9 4 13 8 9 12" />
  </>,
  "ArrowRightIcon",
);

/** Users / people */
export const UsersIcon = icon(
  <>
    <circle cx="6" cy="5" r="2" />
    <path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
    <circle cx="11" cy="5.5" r="1.8" />
    <path d="M10 9c1 0 2 .5 2.8 1.2" />
  </>,
  "UsersIcon",
);

/** Chart bar */
export const ChartBarIcon = icon(
  <>
    <rect x="3" y="8" width="2.5" height="5" rx="0.3" />
    <rect x="6.75" y="5" width="2.5" height="8" rx="0.3" />
    <rect x="10.5" y="3" width="2.5" height="10" rx="0.3" />
  </>,
  "ChartBarIcon",
);

/** Spinner / loading */
export const SpinnerIcon = icon(
  <path d="M8 2a6 6 0 0 1 6 6" />,
  "SpinnerIcon",
);

/** Clock counter-clockwise / history */
export const HistoryIcon = icon(
  <>
    <path d="M4 4a5.5 5.5 0 1 1-1 3" />
    <polyline points="8 5.5 8 8.5 10.5 10" />
    <polyline points="4 2 2.5 4.5 5 5" />
  </>,
  "HistoryIcon",
);

/** Plus circle */
export const PlusCircleIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <line x1="5.5" y1="8" x2="10.5" y2="8" />
    <line x1="8" y1="5.5" x2="8" y2="10.5" />
  </>,
  "PlusCircleIcon",
);

/** Pencil / edit simple */
export const PencilIcon = icon(
  <path d="M11.5 2.5l2 2L5 13H3v-2z" />,
  "PencilIcon",
);

/** File code */
export const FileCodeIcon = icon(
  <>
    <path d="M4 2h5.5L13 5.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm5 0v4h4" />
    <polyline points="6 9 4.5 10.5 6 12" />
    <polyline points="10 9 11.5 10.5 10 12" />
  </>,
  "FileCodeIcon",
);

/** Memory chip (for Phosphor's Memory icon) */
export const MemoryChipIcon = icon(
  <>
    <rect x="3" y="4" width="10" height="8" rx="1" />
    <line x1="5.5" y1="2" x2="5.5" y2="4" />
    <line x1="8" y1="2" x2="8" y2="4" />
    <line x1="10.5" y1="2" x2="10.5" y2="4" />
    <line x1="5.5" y1="12" x2="5.5" y2="14" />
    <line x1="8" y1="12" x2="8" y2="14" />
    <line x1="10.5" y1="12" x2="10.5" y2="14" />
  </>,
  "MemoryChipIcon",
);

/** Brain */
export const BrainIcon = icon(
  <>
    <path d="M8 2C5.5 2 4 4 4 6s1 3 1 4-1 2.5-1 3.5S5 15 6.5 14c.5-.3 1-.8 1.5-.8s1 .5 1.5.8c1.5 1 2.5 0 2.5-1S11 11 11 10s1-2 1-4-1.5-4-4-4z" />
    <line x1="8" y1="2" x2="8" y2="14" />
  </>,
  "BrainIcon",
);

/** Arrow counter-clockwise / undo */
export const UndoIcon = icon(
  <>
    <path d="M12 4a5.5 5.5 0 1 1 1 3" />
    <polyline points="12 2 13.5 4.5 11 5" />
  </>,
  "UndoIcon",
);
