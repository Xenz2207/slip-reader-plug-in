export class SseHub {
  constructor() {
    this.clients = new Set();
  }

  addClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const client = { res };
    this.clients.add(client);

    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        this.clients.delete(client);
      }
    }, 25000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(client);
    });
  }

  broadcast(eventName, payload) {
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      try {
        client.res.write(frame);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  get clientCount() {
    return this.clients.size;
  }
}

export const sseHub = new SseHub();
