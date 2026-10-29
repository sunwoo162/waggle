import fs from 'node:fs';
import {marked} from 'marked';
const inputs = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(inputs.map(source => marked.parse(source, {gfm:true}))));
