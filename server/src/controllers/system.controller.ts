import { Request, Response } from 'express';
import os from 'os';
import { env } from '../config/env.js';
import { getConnectedClientsInfo } from '../sockets/socketManager.js';

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addrs: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const n: any = net;
      if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
    }
  }
  return Array.from(new Set(addrs));
}

export class SystemController {
  static async info(_req: Request, res: Response) {
    const connectedClients = (() => { try { return getConnectedClientsInfo(); } catch { return { total: 0, byType: { scorebug: 0, graphics: 0, console: 0, other: 0 } }; } })();
    return res.json({
      success: true,
      data: {
        version: process.env.npm_package_version || '1.0.0',
        port: env.PORT,
        lanIpv4: getLanAddresses(),
        connectedClients,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
