import fs from 'node:fs';

const file = 'src/pages/EmployeeDetailPage.tsx';
let source = fs.readFileSync(file, 'utf8');

if (source.includes('> Emitir VR')) {
  console.log('[vr-shortcut] atalho já presente');
  process.exit(0);
}

const importBefore = "import { ArrowLeft, FileText, Mail, Pencil, Save, Trash2, UserMinus } from 'lucide-react';";
const importAfter = "import { ArrowLeft, FileText, Mail, Pencil, Save, Trash2, UserMinus, UtensilsCrossed } from 'lucide-react';";
if (!source.includes(importBefore)) throw new Error('[vr-shortcut] import lucide não localizado');
source = source.replace(importBefore, importAfter);

const anchor = `          <Badge className={emp.status === 'ativo' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}>{emp.status}</Badge>\n          {isAdmin && !isEditing && (`;
const replacement = `          <Badge className={emp.status === 'ativo' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}>{emp.status}</Badge>\n          {emp.status === 'ativo' && emp.vrAtivo && !isEditing && (\n            <Button\n              type="button"\n              variant="outline"\n              onClick={() => navigate(\`/admin/relatorio-vr?empresa=\${emp.companyId}&funcionario=\${emp.id}&competencia=\${new Date().toISOString().slice(0, 7)}&modo=individual\`)}\n            >\n              <UtensilsCrossed className="mr-2 h-4 w-4" /> Emitir VR\n            </Button>\n          )}\n          {isAdmin && !isEditing && (`;
if (!source.includes(anchor)) throw new Error('[vr-shortcut] ponto de inserção não localizado');
source = source.replace(anchor, replacement);

fs.writeFileSync(file, source);
console.log('[vr-shortcut] atalho Emitir VR aplicado');
