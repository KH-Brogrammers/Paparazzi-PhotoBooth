interface ErrorMessageProps {
  message: string;
}

function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="bg-red-500/10 border-2 border-red-500 rounded-xl p-8 max-w-md">
        <div className="flex items-center justify-center w-16 h-16 bg-red-500 rounded-full mx-auto mb-4">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="text-white text-xl font-bold text-center mb-2">
          Camera Access Error
        </h2>
        <p className="text-gray-300 text-center">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export default ErrorMessage;
