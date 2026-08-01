import { IoCheckmarkCircle } from 'react-icons/io5';
import { useAuth } from '../../context/AuthContext';
import './Toast.css';

export default function Toast() {
  const { toastMessage } = useAuth();

  if (!toastMessage) return null;

  return (
    <div className="toast-container">
      <div className="toast-card">
        <IoCheckmarkCircle className="toast-icon" />
        <span>{toastMessage}</span>
      </div>
    </div>
  );
}
