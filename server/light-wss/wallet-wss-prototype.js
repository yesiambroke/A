const WebSocket = require('ws');
const http = require('http');
const { Keypair, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

class WSSServer {
  constructor(port = 4128) {
    this.wss = null;
    this.clients = new Map();
    this.clientCounter = 0;
    this.heartbeatCheckInterval = null;
    // Create HTTP server for health check
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          clients: this.clients.size,
          uptime: process.uptime()
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('WSS Error:', error);
    });

    server.listen(port, () => {
      console.log(`Dummy WSS Server running on port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      this.startHeartbeatCheck();

      // Periodic status update
      setInterval(() => {
        if (this.clients.size > 0) {
          console.log(`📊 Active connections: ${this.clients.size}`);
        }
      }, 60000); // Every minute
    });

    // CLI
    this.setupCLI();
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const publicKey = req.headers['x-public-key'] as string || 'unknown';
    const authKey = req.headers['x-auth-key'] as string;
    const clientId = `client_${++this.clientCounter}`;

    const client: ConnectedClient = {
      ws,
      id: clientId,
      publicKey,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      authenticated: false
    };

    // If auth key is provided, attempt authentication
    if (authKey) {
      this.authenticateClient(client, authKey);
    }

    this.clients.set(clientId, client);
    console.log(`Client connected: ${clientId} (${publicKey}) - Total clients: ${this.clients.size}`);

    // Send connection ack
    const ack: ConnectionAck = {
      type: 'connection_ack',
      clientId,
      serverTime: Date.now()
    };
    ws.send(JSON.stringify(ack));
    console.log(`Sent connection_ack to ${clientId}`);

    ws.on('message', (data: Buffer) => {
      this.handleMessage(client, data);
    });

    ws.on('close', (code, reason) => {
      console.log(`Client disconnected: ${clientId} (code: ${code}, reason: ${reason}) - Remaining clients: ${this.clients.size - 1}`);
      this.clients.delete(clientId);
    });

    ws.on('error', (error) => {
      console.error(`Client error ${clientId}:`, error);
      this.clients.delete(clientId);
    });
  }

  private handleMessage(client: ConnectedClient, data: Buffer): void {
    try {
      const message: Message = JSON.parse(data.toString());

      switch (message.type) {
        case 'heartbeat':
          client.lastHeartbeat = Date.now();
          // Echo back as ack
          const heartbeatAck = {
            type: 'heartbeat_ack',
            timestamp: message.timestamp,
            serverTime: Date.now()
          };
          client.ws.send(JSON.stringify(heartbeatAck));
          console.log(`💓 Heartbeat from ${client.id} - responded`);
          break;

        case 'sign_response':
          this.handleSignResponse(client, message);
          break;

        case 'wallet_data_request':
          this.handleWalletDataRequest(client, message);
          break;

        default:
          console.warn(`Unknown message type from ${client.id}:`, message.type);
      }
    } catch (error) {
      console.error(`Failed to parse message from ${client.id}:`, error);
    }
  }

  private async authenticateClient(client: ConnectedClient, authKey: string): Promise<void> {
    try {
      // TODO: Validate auth key against database
      // For now, accept any auth key for testing
      console.log(`🔐 Authenticating client ${client.id} with key: ${authKey.substring(0, 8)}...`);

      // Mock authentication - replace with actual database check
      if (authKey && authKey.length > 10) {
        client.authenticated = true;
        client.userId = 'mock_user_' + client.id; // TODO: Get from database
        client.authKey = authKey;

        console.log(`✅ Client ${client.id} authenticated successfully for user ${client.userId}`);

        // Send authentication success message
        const authSuccess: ConnectionAck = {
          type: 'connection_ack',
          clientId: client.id,
          serverTime: Date.now()
        };
        client.ws.send(JSON.stringify({
          ...authSuccess,
          authenticated: true,
          userId: client.userId
        }));
      } else {
        console.log(`❌ Authentication failed for client ${client.id}`);
        client.ws.send(JSON.stringify({
          type: 'auth_failed',
          reason: 'Invalid auth key'
        }));
      }
    } catch (error) {
      console.error(`Authentication error for client ${client.id}:`, error);
      client.ws.send(JSON.stringify({
        type: 'auth_failed',
        reason: 'Authentication error'
      }));
    }
  }

  private handleSignResponse(client: ConnectedClient, response: SignResponse): void {
    console.log(`Sign response from ${client.id} for request ${response.requestId}:`);
    console.log(`  Status: ${response.status}`);
    if (response.signature) {
      console.log(`  Signature: ${response.signature}`);
    }
    if (response.reason) {
      console.log(`  Reason: ${response.reason}`);
    }
  }

  private handleWalletDataRequest(client: ConnectedClient, request: WalletDataRequest): void {
    console.log(`📥 Wallet data request from ${client.id} for user ${request.userId}`);

    // Verify the client is authenticated and matches the requested user
    if (!client.authenticated || client.userId !== request.userId) {
      console.log(`❌ Unauthorized wallet data request from ${client.id}`);
      client.ws.send(JSON.stringify({
        type: 'wallet_data_response',
        requestId: request.requestId,
        success: false,
        error: 'Unauthorized'
      }));
      return;
    }

    // TODO: Fetch actual wallet data from database or wallet client
    // For now, return mock wallet data
    const mockWalletData = [
      {
        id: 'wallet_1',
        name: 'Main Wallet',
        publicKey: '11111111111111111111111111111112',
        balance: 0.5,
        status: 'ready'
      }
    ];

    client.ws.send(JSON.stringify({
      type: 'wallet_data_response',
      requestId: request.requestId,
      success: true,
      wallets: mockWalletData
    }));

    console.log(`📤 Sent wallet data to authenticated client ${client.id}`);
  }

  private sendSignRequest(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      console.log(`Client ${clientId} not found`);
      return;
    }

    if (!client.authenticated) {
      console.log(`Client ${clientId} not authenticated`);
      return;
    }

    // Generate test transaction (0.001 SOL transfer to random address)
    const fromPubkey = new PublicKey(client.publicKey);
    const toPubkey = Keypair.generate().publicKey;
    const amount = 0.001 * LAMPORTS_PER_SOL;

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: amount
      })
    );

    // Set recent blockhash (dummy)
    transaction.recentBlockhash = '11111111111111111111111111111111';
    transaction.feePayer = fromPubkey;

    const serialized = transaction.serializeMessage().toString('base64');

    const request: SignRequest = {
      type: 'sign_request',
      id: `req_${Date.now()}`,
      timestamp: Date.now(),
      transaction: {
        serialized,
        metadata: {
          domain: 'test.a-trade.fun',
          description: 'Test transaction: Transfer 0.001 SOL',
          timestamp: Date.now(),
          estimatedFee: 0.000005
        }
      }
    };

    client.ws.send(JSON.stringify(request));
    console.log(`Sent sign request to authenticated client ${clientId} (user: ${client.userId})`);
  }

  // Get authenticated clients for a user
  private getAuthenticatedClientsForUser(userId: string): ConnectedClient[] {
    return Array.from(this.clients.values()).filter(
      client => client.authenticated && client.userId === userId
    );
  }

  // Send wallet data to authenticated clients
  private broadcastWalletData(userId: string, walletData: any): void {
    const userClients = this.getAuthenticatedClientsForUser(userId);
    const message = JSON.stringify({
      type: 'wallet_data',
      userId,
      wallets: walletData,
      timestamp: Date.now()
    });

    userClients.forEach(client => {
      try {
        client.ws.send(message);
        console.log(`📤 Sent wallet data to client ${client.id}`);
      } catch (error) {
        console.error(`Failed to send wallet data to client ${client.id}:`, error);
      }
    });
  }

  private setupCLI(): void {
    process.stdin.on('data', (data) => {
      const command = data.toString().trim();
      const [cmd, ...args] = command.split(' ');

      switch (cmd) {
        case 'clients':
          console.log('Connected clients:');
          for (const [id, client] of this.clients) {
            console.log(`  ${id}: ${client.publicKey} (connected ${new Date(client.connectedAt).toISOString()})`);
          }
          break;

        case 'send':
          if (args.length === 0) {
            console.log('Usage: send <clientId>');
          } else {
            this.sendSignRequest(args[0]);
          }
          break;

        case 'exit':
          console.log('Shutting down server...');
          this.wss.close();
          process.exit(0);
          break;

        default:
          console.log('Commands:');
          console.log('  clients - List connected clients');
          console.log('  send <clientId> - Send test transaction to client');
          console.log('  exit - Shutdown server');
      }

      process.stdout.write('> ');
    });

    process.stdout.write('> ');
  }

  private startHeartbeatCheck(): void {
    this.heartbeatCheckInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, client] of this.clients) {
        if (now - client.lastHeartbeat > 60000) { // 1 minute timeout
          console.log(`Client ${id} heartbeat timeout, disconnecting`);
          client.ws.close();
          this.clients.delete(id);
        }
      }
    }, 30000); // Check every 30 seconds
  }
}

// Start server
if (require.main === module) {
  new WSSServer();
}