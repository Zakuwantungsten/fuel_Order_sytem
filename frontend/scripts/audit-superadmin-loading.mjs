import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const superAdminDir = path.join(root, 'src', 'components', 'SuperAdmin');
const strict = process.argv.includes('--strict');

const matches = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.name.endsWith('.tsx')) {
      continue;
    }

    const source = fs.readFileSync(fullPath, 'utf8');
    const lines = source.split(/\r?\n/);

    // Heuristic: detect loading ternaries rendering ad-hoc spinner blocks instead of UnifiedTabLoader.
    // This is intentionally conservative and non-blocking unless --strict is passed.
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const hasLoadingBranch = /loading\s*\?/.test(line);
      if (!hasLoadingBranch) {
        continue;
      }

      const windowText = lines.slice(i, i + 14).join('\n');
      const hasUnifiedLoader = /UnifiedTabLoader|TableSkeleton|PageSpinner|PanelSpinner/.test(windowText);
      const hasSpinnerIcon = /(Loader2|Loader|RefreshCw)[\s\S]{0,180}animate-spin/.test(windowText);
      const hasCenteredDiv = /className=\"[^\"]*(justify-center|items-center)[^\"]*\"/.test(windowText);

      if (!hasUnifiedLoader && hasSpinnerIcon && hasCenteredDiv) {
        matches.push({ file: path.relative(root, fullPath), line: i + 1, sample: line.trim() });
      }
    }
  }
}

if (!fs.existsSync(superAdminDir)) {
  console.log('Super Admin directory not found, skipping loading audit.');
  process.exit(0);
}

walk(superAdminDir);

if (matches.length === 0) {
  console.log('OK: No ad-hoc full-load spinner patterns detected in Super Admin components.');
  process.exit(0);
}

console.log('Super Admin loading audit found potential ad-hoc full-load spinner patterns:');
for (const hit of matches) {
  console.log(`- ${hit.file}:${hit.line}  ${hit.sample}`);
}

if (strict) {
  console.error(`Found ${matches.length} loading pattern issue(s).`);
  process.exit(1);
}

console.log('Non-strict mode: report only. Use --strict to fail CI.');
process.exit(0);
