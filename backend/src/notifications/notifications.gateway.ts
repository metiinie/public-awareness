import { 
    WebSocketGateway, 
    WebSocketServer, 
    OnGatewayConnection,
    OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

@Injectable()
@WebSocketGateway({
    cors: {
        origin: '*', // For development. In production, restrict to your frontend domain.
    },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    // A simple map to keep track of userId -> socketIds
    private userSockets: Map<number, Set<string>> = new Map();

    handleConnection(client: Socket) {
        console.log(`[NotificationsGateway] Client connected: ${client.id}`);
        // Typically, you'd extract user identity from handshake auth/headers:
        // const userId = client.handshake.auth.userId;
        // if (userId) this.addUserSocket(Number(userId), client.id);
        
        // As a simpler fallback for React Native, we can listen to an explicit generic 'register' event:
        client.on('register', (userId: number) => {
            console.log(`[NotificationsGateway] Registering socket ${client.id} for user ${userId}`);
            this.addUserSocket(userId, client.id);
        });
    }

    handleDisconnect(client: Socket) {
        console.log(`[NotificationsGateway] Client disconnected: ${client.id}`);
        this.removeUserSocket(client.id);
    }

    private addUserSocket(userId: number, socketId: string) {
        if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId)!.add(socketId);
    }

    private removeUserSocket(socketId: string) {
        for (const [userId, sockets] of this.userSockets.entries()) {
            if (sockets.has(socketId)) {
                sockets.delete(socketId);
                if (sockets.size === 0) {
                    this.userSockets.delete(userId);
                }
                break;
            }
        }
    }

    // Send notification to specific user
    notifyUser(userId: number, payload: any) {
        const sockets = this.userSockets.get(userId);
        if (sockets) {
            sockets.forEach(socketId => {
                this.server.to(socketId).emit('newNotification', payload);
            });
        }
    }

    // Broadcast to all connected users
    broadcastToAll(payload: any) {
        this.server.emit('newNotification', payload);
    }
}
