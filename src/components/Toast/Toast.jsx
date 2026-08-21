import { IoCheckmarkCircle, IoCloseCircle, IoInformationCircle, IoClose } from '../../icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Toast.css';

const ICONS = {
  success: IoCheckmarkCircle,
  error: IoCloseCircle,
  info: IoInformationCircle,
  warning: IoInformationCircle,
};

export default function Toast() {
  const { toast, dismissToast } = useAuth();
  const navigate = useNavigate();

  if (!toast?.message) return null;

  const variant = toast.variant || 'success';
  const Icon = ICONS[variant] || ICONS.success;
  const action = toast.action;

  const handleAction = () => {
    dismissToast();
    if (action?.path) navigate(action.path);
    action?.onClick?.();
  };

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div className={`toast-card toast-card--${variant}`}>
        <Icon className="toast-icon" aria-hidden="true" />
        <div className="toast-body">
          <span className="toast-message">{toast.message}</span>
          {action?.label && (
            <button type="button" className="toast-action" onClick={handleAction}>
              {action.label}
            </button>
          )}
        </div>
        <button type="button" className="toast-dismiss" onClick={dismissToast} aria-label="Dismiss">
          <IoClose />
        </button>
      </div>
    </div>
  );
}
