import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { writeFileSync } from 'fs';

const dist = process.argv[2] || 'dist';
const output = process.argv[3] || 'embedded-assets.js';

function collectFiles(dir, baseDir) {
  const files = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const relativePath = join(baseDir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      Object.assign(files, collectFiles(fullPath, relativePath));
    } else {
      files[relativePath] = readFileSync(fullPath).toString('base64');
    }
  }
  return files;
}

const assets = collectFiles(dist, '/');
const content = `// Auto-generated embedded assets - do not edit
export default ${JSON.stringify(assets, null, 2)};
`;

writeFileSync(output, content);
console.log(`Embedded ${Object.keys(assets).length} files into ${output}`);
