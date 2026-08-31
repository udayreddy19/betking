import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import DepositView from '../DepositFlow/DepositView';
import './DepositModal.css';

export default function DepositModal() {
  const { isDepositModalOpen, closeDepositModal } = useAuth();

  if (!isDepositModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="deposit-modal-backdrop" onClick={closeDepositModal}>
        <motion.div
          className="deposit-modal-container"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <DepositView isModal={true} onClose={closeDepositModal} />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
