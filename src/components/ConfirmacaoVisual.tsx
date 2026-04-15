import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
  titulo: string;
  detalhes: { label: string; valor: string }[];
}

const ConfirmacaoVisual: React.FC<Props> = ({ open, onClose, titulo, detalhes }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-border"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center mb-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', damping: 15 }}
              >
                <CheckCircle2 className="w-16 h-16 text-green-500 mb-3" />
              </motion.div>
              <h2 className="text-lg font-bold text-foreground font-display">{titulo}</h2>
            </div>
            <div className="space-y-2 mb-6">
              {detalhes.map((d, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-medium text-foreground text-right max-w-[60%]">{d.valor}</span>
                </div>
              ))}
            </div>
            <Button onClick={onClose} className="w-full">Fechar</Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmacaoVisual;
