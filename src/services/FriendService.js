// Friend management service - JavaScript wrapper for server compatibility

const { v4: uuidv4 } = require('uuid');

class FriendService {
  constructor(dbManager) {
    this.dbManager = dbManager;
  }

  /**
   * Send friend request using the friendships table
   */
  async sendFriendRequest(fromUserId, toUserId) {
    if (fromUserId === toUserId) {
      throw new Error('Cannot send friend request to yourself');
    }

    const adapter = this.dbManager.getAdapter();
    
    // Check if users exist
    const [fromUser, toUser] = await Promise.all([
      adapter.findOne('users', { id: fromUserId }),
      adapter.findOne('users', { id: toUserId })
    ]);

    if (!fromUser || !toUser) {
      throw new Error('User not found');
    }

    // Check if friendship already exists
    const existingFriendship = await adapter.findOne('friendships', {
      $or: [
        { requester_id: fromUserId, addressee_id: toUserId },
        { requester_id: toUserId, addressee_id: fromUserId }
      ]
    });

    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        throw new Error('Already friends');
      }
      if (existingFriendship.status === 'pending') {
        if (existingFriendship.requester_id === fromUserId) {
          throw new Error('Friend request already sent');
        } else {
          // Auto-accept if there's a mutual request
          await this.acceptFriendRequest(existingFriendship.id);
          return;
        }
      }
      if (existingFriendship.status === 'blocked') {
        throw new Error('Cannot send friend request to blocked user');
      }
    }

    // Create new friendship request
    const friendshipId = uuidv4();
    await adapter.create('friendships', {
      id: friendshipId,
      requester_id: fromUserId,
      addressee_id: toUserId,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Accept friend request by friendship ID
   */
  async acceptFriendRequest(requestId) {
    const adapter = this.dbManager.getAdapter();
    
    const friendship = await adapter.findOne('friendships', { id: requestId });
    if (!friendship) {
      throw new Error('Friend request not found');
    }

    if (friendship.status !== 'pending') {
      throw new Error('Friend request is not pending');
    }

    // Update friendship status to accepted
    await adapter.update('friendships', { id: requestId }, {
      status: 'accepted',
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Reject friend request by friendship ID
   */
  async rejectFriendRequest(requestId) {
    const adapter = this.dbManager.getAdapter();
    
    const friendship = await adapter.findOne('friendships', { id: requestId });
    if (!friendship) {
      throw new Error('Friend request not found');
    }

    if (friendship.status !== 'pending') {
      throw new Error('Friend request is not pending');
    }

    // Update friendship status to rejected
    await adapter.update('friendships', { id: requestId }, {
      status: 'rejected',
      updated_at: new Date().toISOString()
    });
  }

  /**
   * Remove friend by deleting the friendship record
   */
  async removeFriend(userId, friendId) {
    const adapter = this.dbManager.getAdapter();
    
    // Find the friendship record
    const friendship = await adapter.findOne('friendships', {
      $or: [
        { requester_id: userId, addressee_id: friendId, status: 'accepted' },
        { requester_id: friendId, addressee_id: userId, status: 'accepted' }
      ]
    });

    if (!friendship) {
      throw new Error('Friendship not found');
    }

    // Delete the friendship record
    await adapter.delete('friendships', { id: friendship.id });
  }

  /**
   * Get user's friends list with details
   */
  async getFriendsList(userId) {
    const adapter = this.dbManager.getAdapter();
    
    // Get all accepted friendships for the user
    const friendships = await adapter.findMany('friendships', {
      $or: [
        { requester_id: userId, status: 'accepted' },
        { addressee_id: userId, status: 'accepted' }
      ]
    });

    if (friendships.length === 0) {
      return [];
    }

    // Get friend user IDs
    const friendIds = friendships.map(friendship => 
      friendship.requester_id === userId ? friendship.addressee_id : friendship.requester_id
    );

    // Get friend details
    const friends = [];
    for (const friendId of friendIds) {
      const friend = await adapter.findOne('users', { id: friendId });
      if (friend) {
        friends.push({
          id: friend.id,
          username: friend.username,
          displayName: friend.display_name || friend.username,
          avatar: friend.avatar || '👤',
          isOnline: this.isUserOnline(friend.last_active),
          lastSeen: new Date(friend.last_active || friend.created_at),
          trustScore: friend.trust_score || 50,
          canInviteToParty: true
        });
      }
    }

    return friends;
  }

  /**
   * Get pending friend requests
   */
  async getPendingRequests(userId) {
    const adapter = this.dbManager.getAdapter();
    
    // Get sent requests
    const sentFriendships = await adapter.findMany('friendships', {
      requester_id: userId,
      status: 'pending'
    });

    // Get received requests
    const receivedFriendships = await adapter.findMany('friendships', {
      addressee_id: userId,
      status: 'pending'
    });

    // Get user details for sent requests
    const sentRequests = [];
    for (const friendship of sentFriendships) {
      const user = await adapter.findOne('users', { id: friendship.addressee_id });
      if (user) {
        sentRequests.push({
          id: friendship.id,
          username: user.username,
          displayName: user.display_name || user.username,
          avatar: user.avatar || '👤',
          requestedAt: new Date(friendship.created_at)
        });
      }
    }

    // Get user details for received requests
    const receivedRequests = [];
    for (const friendship of receivedFriendships) {
      const user = await adapter.findOne('users', { id: friendship.requester_id });
      if (user) {
        receivedRequests.push({
          id: friendship.id,
          username: user.username,
          displayName: user.display_name || user.username,
          avatar: user.avatar || '👤',
          requestedAt: new Date(friendship.created_at)
        });
      }
    }

    return {
      sent: sentRequests,
      received: receivedRequests
    };
  }

  /**
   * Block a user
   */
  async blockUser(userId, blockedUserId) {
    if (userId === blockedUserId) {
      throw new Error('Cannot block yourself');
    }

    const adapter = this.dbManager.getAdapter();
    
    // Check if users exist
    const [user, blockedUser] = await Promise.all([
      adapter.findOne('users', { id: userId }),
      adapter.findOne('users', { id: blockedUserId })
    ]);

    if (!user || !blockedUser) {
      throw new Error('User not found');
    }

    // Check if friendship exists
    const existingFriendship = await adapter.findOne('friendships', {
      $or: [
        { requester_id: userId, addressee_id: blockedUserId },
        { requester_id: blockedUserId, addressee_id: userId }
      ]
    });

    if (existingFriendship) {
      // Update existing friendship to blocked
      await adapter.update('friendships', { id: existingFriendship.id }, {
        status: 'blocked',
        updated_at: new Date().toISOString()
      });
    } else {
      // Create new blocked relationship
      const friendshipId = uuidv4();
      await adapter.create('friendships', {
        id: friendshipId,
        requester_id: userId,
        addressee_id: blockedUserId,
        status: 'blocked',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  /**
   * Get friendship status between two users
   */
  async getFriendStatus(userId, friendId) {
    const adapter = this.dbManager.getAdapter();
    
    const friendship = await adapter.findOne('friendships', {
      $or: [
        { requester_id: userId, addressee_id: friendId },
        { requester_id: friendId, addressee_id: userId }
      ]
    });

    if (!friendship) {
      return {
        status: 'none',
        canSendRequest: true,
        canAccept: false,
        canBlock: true
      };
    }

    switch (friendship.status) {
      case 'pending':
        if (friendship.requester_id === userId) {
          return {
            status: 'pending_sent',
            canSendRequest: false,
            canAccept: false,
            canBlock: true
          };
        } else {
          return {
            status: 'pending_received',
            canSendRequest: false,
            canAccept: true,
            canBlock: true
          };
        }
      case 'accepted':
        return {
          status: 'accepted',
          canSendRequest: false,
          canAccept: false,
          canBlock: true
        };
      case 'blocked':
        return {
          status: 'blocked',
          canSendRequest: false,
          canAccept: false,
          canBlock: false
        };
      default:
        return {
          status: 'none',
          canSendRequest: true,
          canAccept: false,
          canBlock: true
        };
    }
  }

  /**
   * Search for users to add as friends
   */
  async searchUsers(query, currentUserId) {
    const adapter = this.dbManager.getAdapter();
    
    // Search by username or display name
    const users = await adapter.findMany('users', {
      $or: [
        { username: { operator: 'LIKE', value: `%${query}%` } },
        { display_name: { operator: 'LIKE', value: `%${query}%` } }
      ],
      is_guest: 0 // Exclude guest users
    }, { limit: 20 });

    // Get friendship statuses for all users
    const results = [];
    for (const user of users) {
      if (user.id === currentUserId) continue; // Exclude self
      
      const friendStatus = await this.getFriendStatus(currentUserId, user.id);
      
      results.push({
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        avatar: user.avatar || '👤',
        trustScore: user.trust_score || 50,
        totalGames: user.total_games || 0,
        isFriend: friendStatus.status === 'accepted',
        requestSent: friendStatus.status === 'pending_sent',
        requestReceived: friendStatus.status === 'pending_received',
        isBlocked: friendStatus.status === 'blocked'
      });
    }

    return results;
  }

  /**
   * Check if a user is currently online (active within last 5 minutes)
   */
  isUserOnline(lastActive) {
    const lastActiveDate = typeof lastActive === 'string' ? new Date(lastActive) : lastActive;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastActiveDate > fiveMinutesAgo;
  }
}

module.exports = {
  FriendService
};