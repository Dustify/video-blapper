import path from 'path';
import { fileURLToPath } from 'url';

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

export const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
export const ENCODES_OUTPUT_PATH = '/output';
export const MOUNTED_FOLDER_PATH = '/data';
export const DEFAULTS_PATH = path.join(__dirname, 'defaults.json');