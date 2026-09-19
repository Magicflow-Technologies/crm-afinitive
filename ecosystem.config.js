const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Lee el archivo .env ubicado en la raíz del proyecto
const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));

module.exports = {
  apps: [
    {
      name: 'wa-crm',
      script: './.next/standalone/server.js',
      cwd: '/var/www/CRM',
      env: {
        ...envConfig,
        PORT: 3005,
        NODE_ENV: 'production'
      }
    }
  ]
};
