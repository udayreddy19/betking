import { IoCheckmarkCircle, IoCloseCircle, IoInformationCircle, IoClose } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import './Toast.css';

const ICONS = {
  success: IoCheckmarkCircle,
  error: IoCloseCircle,
  info: IoInformationCircle,
};

export default function Toast() {
  const { toast, dismissToast } = useAuth();

  if (!toast?.message) return null;

  const variant = toast.variant || 'success';
  const Icon = ICONS[variant] || ICONS.success;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div className={`toast-card toast-card--${variant}`}>
        <Icon className="toast-icon" aria-hidden="true" />
        <span className="toast-message">{toast.message}</span>
        <button type="button" className="toast-dismiss" onClick={dismissToast} aria-label="Dismiss">
          <IoClose />
        </button>
      </div>
    </div>
  );
}
