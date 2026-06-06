import https from 'https';

interface RequestOptions {
  hostname: string;
  path: string;
  method: string;
  headers?: Record<string, string>;
  port?: number;
}

export function httpsRequest<T = unknown>(options: RequestOptions, body?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { ...options, port: options.port || 443 },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json as T);
            } else {
              reject(new Error(`API error [${res.statusCode}]: ${(json as any).message || data}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
