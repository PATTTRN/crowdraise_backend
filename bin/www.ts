#!/usr/bin/env node

import app from '../app';
import http from 'http';
import config from '../src/config';

const port = config.port;
app.set('port', port);

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.syscall !== 'listen') throw error;
  const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;
  switch (error.code) {
    case 'EACCES': console.error(bind + ' requires elevated privileges'); process.exit(1);
    case 'EADDRINUSE': console.error(bind + ' is already in use'); process.exit(1);
    default: throw error;
  }
});
