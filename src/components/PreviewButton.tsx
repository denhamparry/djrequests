import type { MouseEvent } from 'react';

export type PreviewState = 'idle' | 'loading' | 'playing';

type Props = {
  state: PreviewState;
  trackLabel: string;
  onClick: () => void;
};

function PreviewButton({ state, trackLabel, onClick }: Props) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick();
  };

  return (
    <button
      type="button"
      className="preview-button"
      aria-label={`Preview ${trackLabel}`}
      aria-pressed={state === 'playing'}
      data-state={state}
      onClick={handleClick}
    >
      {state === 'loading' ? (
        <svg
          className="preview-spinner"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="14 42"
          />
        </svg>
      ) : state === 'playing' ? (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
          <rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

export default PreviewButton;
