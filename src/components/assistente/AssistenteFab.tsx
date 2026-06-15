import React, { useState } from 'react';
import { Sparkles, X, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useNavigate } from 'react-router-dom';
import EmployeeAccessControl from '@/components/EmployeeAccessControl';
import AssistenteChat from './AssistenteChat';

const AssistenteFab: React.FC = () => {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  return (
    <>
      <EmployeeAccessControl compact />
      <button
        onClick={() => setOpen(true)}
        aria-label="Assistente Operacional"
        className="fixed z-40 bottom-24 right-5 md:bottom-5 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
      >
        <Sparkles className="h-6 w-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="p-0 w-full sm:max-w-md flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Assistente
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => { setOpen(false); nav('/admin/assistente'); }} title="Abrir em tela cheia">
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <AssistenteChat className="h-full" header={false} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default AssistenteFab;
