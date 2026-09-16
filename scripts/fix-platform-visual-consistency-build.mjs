import fs from 'node:fs';

const file = 'src/components/AppLayout.tsx';
if (!fs.existsSync(file)) throw new Error(`[platform-visual] arquivo ausente: ${file}`);

const before = fs.readFileSync(file, 'utf8');
let after = before;

const oldEffect = `  useEffect(() => {\n    document.body.classList.add('topac-neon-body');\n    return () => document.body.classList.remove('topac-neon-body');\n  }, []);`;

const newEffect = `  useEffect(() => {\n    const body = document.body;\n    const vars: Record<string, string> = {\n      '--background': '225 38% 3%',\n      '--foreground': '0 0% 96%',\n      '--card': '225 28% 5%',\n      '--card-foreground': '0 0% 96%',\n      '--popover': '225 28% 5%',\n      '--popover-foreground': '0 0% 96%',\n      '--primary': '43 100% 50%',\n      '--primary-foreground': '230 45% 4%',\n      '--secondary': '269 35% 12%',\n      '--secondary-foreground': '0 0% 95%',\n      '--muted': '225 20% 10%',\n      '--muted-foreground': '230 8% 58%',\n      '--accent': '271 91% 60%',\n      '--accent-foreground': '0 0% 100%',\n      '--border': '270 35% 22%',\n      '--input': '230 18% 16%',\n      '--ring': '270 91% 60%',\n    };\n    const previous = new Map<string, string>();\n    Object.entries(vars).forEach(([key, value]) => {\n      previous.set(key, body.style.getPropertyValue(key));\n      body.style.setProperty(key, value);\n    });\n    body.classList.add('topac-neon-body', 'dark');\n    return () => {\n      body.classList.remove('topac-neon-body', 'dark');\n      Object.keys(vars).forEach((key) => {\n        const value = previous.get(key) || '';\n        if (value) body.style.setProperty(key, value);\n        else body.style.removeProperty(key);\n      });\n    };\n  }, []);`;

if (after.includes(oldEffect)) {
  after = after.replace(oldEffect, newEffect);
} else if (!after.includes("body.classList.add('topac-neon-body', 'dark')")) {
  throw new Error('[platform-visual] ancora do tema global nao encontrada');
}

if (after !== before) fs.writeFileSync(file, after);
console.log('[platform-visual] tema TOPAC aplicado a dialogs, selects, popovers e botões portalizados');
