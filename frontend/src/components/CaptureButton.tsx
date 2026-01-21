interface CaptureButtonProps {
  onClick: () => void;
  isCapturing: boolean;
}

function CaptureButton({ onClick, isCapturing }: CaptureButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isCapturing}
      className={`
        w-full py-3 rounded-lg font-semibold text-white
        transition-all duration-200 transform
        ${
          isCapturing
            ? 'bg-gray-600 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 active:scale-95'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        shadow-lg hover:shadow-xl
        flex items-center justify-center space-x-2
      `}
    >
      <svg
        className={`w-6 h-6 ${isCapturing ? 'animate-spin' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        {isCapturing ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
        )}
        {!isCapturing && (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        )}
      </svg>
      <span>{isCapturing ? 'Capturing...' : 'Capture Photo'}</span>
    </button>
  );
}

export default CaptureButton;
