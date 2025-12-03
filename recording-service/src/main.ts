import dotenv from 'dotenv';
import path from 'path';

// Load environment variables before anything else
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import app from './app';
import logger from './utils/logger';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  logger.info(`Recording Service listening on port ${PORT}`);
});
